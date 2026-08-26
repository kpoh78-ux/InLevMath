import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { academyTeacher } from '@/lib/academy'
import { tryRecalcStudentLevel } from '@/lib/studentLevel'

async function getTeacher(req: NextRequest) {
  const auth = await getAuthUser(req)
  if (!auth || auth.role !== 'teacher') return null
  return academyTeacher(auth.sub)
}

/** 교재 소유 확인 */
async function ownedTextbook(teacherId: string, textbookId: string) {
  return prisma.textbook.findFirst({ where: { id: textbookId, teacherId } })
}

// POST /api/textbooks/assign — body: { textbookId, studentIds: string[] }
export async function POST(req: NextRequest) {
  const teacher = await getTeacher(req)
  if (!teacher) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const { textbookId, studentIds } = await req.json() as {
    textbookId?: string; studentIds?: string[]
  }
  if (!textbookId || !Array.isArray(studentIds) || studentIds.length === 0) {
    return NextResponse.json({ error: '교재와 학생을 선택하세요.' }, { status: 400 })
  }

  if (!await ownedTextbook(teacher.id, textbookId)) {
    return NextResponse.json({ error: '교재를 찾을 수 없습니다.' }, { status: 404 })
  }

  // 학원 재원 학생에게만 배정 가능
  const students = await prisma.student.findMany({
    where: { id: { in: studentIds }, teacherId: teacher.id, status: 'active' },
    select: { id: true },
  })

  await prisma.$transaction(
    students.map(s =>
      prisma.textbookAssignment.upsert({
        where: { textbookId_studentId: { textbookId, studentId: s.id } },
        create: { textbookId, studentId: s.id },
        update: {},
      })
    )
  )

  return NextResponse.json({ ok: true, assigned: students.length })
}

// GET /api/textbooks/assign?textbookId=xxx — 그 교재를 배정받은 학생
// GET /api/textbooks/assign?studentId=xxx  — 그 학생이 배정받은 교재
export async function GET(req: NextRequest) {
  const teacher = await getTeacher(req)
  if (!teacher) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const textbookId = req.nextUrl.searchParams.get('textbookId')
  const studentId = req.nextUrl.searchParams.get('studentId')

  if (textbookId) {
    if (!await ownedTextbook(teacher.id, textbookId)) return NextResponse.json([])
    const rows = await prisma.textbookAssignment.findMany({
      where: { textbookId },
      select: { studentId: true, assignedAt: true },
    })
    return NextResponse.json(rows)
  }

  if (studentId) {
    const rows = await prisma.textbookAssignment.findMany({
      where: { studentId, textbook: { teacherId: teacher.id } },
      orderBy: { assignedAt: 'desc' },
      select: {
        assignedAt: true,
        completedAt: true,
        textbook: {
          select: {
            id: true, title: true, grade: true, publisher: true,
            _count: { select: { problems: true } },
          },
        },
      },
    })

    // 채점 여부를 함께 내려 목록에서 바로 구분할 수 있게 한다
    const results = await prisma.textbookResult.findMany({
      where: { studentId, textbookId: { in: rows.map(r => r.textbook.id) } },
      select: { textbookId: true, wrongProblemsJson: true, submittedAt: true },
    })
    const resultBy = new Map(results.map(r => [r.textbookId, r]))

    return NextResponse.json(rows.map(r => {
      const res = resultBy.get(r.textbook.id)
      let wrongCount = 0
      if (res) { try { wrongCount = (JSON.parse(res.wrongProblemsJson) as number[]).length } catch { /* 무시 */ } }
      const total = r.textbook._count.problems
      return {
        id: r.textbook.id,
        title: r.textbook.title,
        grade: r.textbook.grade,
        publisher: r.textbook.publisher,
        problemCount: total,
        assignedAt: r.assignedAt,
        completedAt: r.completedAt,
        graded: !!res,
        correctRate: res && total > 0 ? Math.round(((total - wrongCount) / total) * 100) : null,
        wrongCount: res ? wrongCount : null,
        submittedAt: res?.submittedAt ?? null,
      }
    }))
  }

  return NextResponse.json([])
}

// DELETE /api/textbooks/assign — body: { textbookId, studentIds?: string[] }
// studentIds 생략 시 해당 교재의 배정 전체 해제
export async function DELETE(req: NextRequest) {
  const teacher = await getTeacher(req)
  if (!teacher) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const { textbookId, studentIds } = await req.json().catch(() => ({})) as {
    textbookId?: string; studentIds?: string[]
  }
  if (!textbookId) return NextResponse.json({ error: '교재를 선택하세요.' }, { status: 400 })

  if (!await ownedTextbook(teacher.id, textbookId)) {
    return NextResponse.json({ error: '교재를 찾을 수 없습니다.' }, { status: 404 })
  }

  // 채점이 끝난 학생은 기록 보존을 위해 배정 해제에서 제외한다
  const graded = await prisma.textbookResult.findMany({
    where: { textbookId, ...(studentIds ? { studentId: { in: studentIds } } : {}) },
    select: { studentId: true },
  })
  const gradedIds = new Set(graded.map(g => g.studentId))

  const targets = (studentIds ?? (await prisma.textbookAssignment.findMany({
    where: { textbookId }, select: { studentId: true },
  })).map(a => a.studentId)).filter(id => !gradedIds.has(id))

  if (targets.length > 0) {
    await prisma.textbookAssignment.deleteMany({
      where: { textbookId, studentId: { in: targets } },
    })
  }

  return NextResponse.json({
    ok: true,
    removed: targets.length,
    blocked: [...gradedIds],   // 채점 완료라 해제하지 못한 학생
  })
}

// PATCH /api/textbooks/assign — 교재 완료 처리 / 완료 해제
// body: { textbookId, studentId, completed: boolean }
//
// 교재를 끝내면 그 성적은 '지난 과정'이 되어 등급 계산에 30%만 반영된다.
// 진도 중인 교재는 70%다. (lib/studentLevel.ts)
export async function PATCH(req: NextRequest) {
  const teacher = await getTeacher(req)
  if (!teacher) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const { textbookId, studentId, completed } = await req.json().catch(() => ({}))
  if (!textbookId || !studentId) {
    return NextResponse.json({ error: '교재와 학생을 선택하세요.' }, { status: 400 })
  }
  if (!await ownedTextbook(teacher.id, textbookId)) {
    return NextResponse.json({ error: '교재를 찾을 수 없습니다.' }, { status: 404 })
  }

  const { count } = await prisma.textbookAssignment.updateMany({
    where: { textbookId, studentId },
    data: { completedAt: completed === false ? null : new Date() },
  })
  if (count === 0) {
    return NextResponse.json({ error: '배정 기록을 찾을 수 없습니다.' }, { status: 404 })
  }

  // 비중이 70% ↔ 30% 로 옮겨가므로 등급을 다시 계산한다
  const level = await tryRecalcStudentLevel(studentId)

  return NextResponse.json({ ok: true, completed: completed !== false, level })
}
