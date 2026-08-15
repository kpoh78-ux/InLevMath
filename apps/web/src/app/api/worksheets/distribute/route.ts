import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken } from '@/lib/auth'
import { academyTeacher } from '@/lib/academy'

// 선생님 인증 + 본인 Teacher 레코드 조회 — 실패 시 NextResponse 를 그대로 반환
async function requireTeacher(req: NextRequest) {
  const auth = req.headers.get('authorization')?.split(' ')[1]
  if (!auth) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  const payload = await verifyToken(auth)
  if (!payload || payload.role !== 'teacher') {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }
  const teacher = await academyTeacher(payload.sub)
  if (!teacher) return NextResponse.json({ error: '선생님 정보 없음' }, { status: 404 })
  return teacher
}

// POST /api/worksheets/distribute — 학습지 배포
export async function POST(req: NextRequest) {
  const teacher = await requireTeacher(req)
  if (teacher instanceof NextResponse) return teacher

  // worksheetIds(여러 개) 우선, 없으면 worksheetId(한 개) — 기존 호출부 호환
  const { worksheetId, worksheetIds, studentIds } = await req.json()
  const ids: string[] = Array.isArray(worksheetIds)
    ? [...new Set(worksheetIds.filter((v: unknown): v is string => typeof v === 'string' && v !== ''))]
    : worksheetId ? [worksheetId] : []

  if (ids.length === 0 || !Array.isArray(studentIds) || studentIds.length === 0) {
    return NextResponse.json({ error: '학습지와 학생을 선택하세요.' }, { status: 400 })
  }

  // 남의 학원 학습지가 섞이면 그 건만 조용히 빠지는 게 아니라 요청 전체를 막는다
  const owned = await prisma.worksheet.findMany({
    where: { id: { in: ids }, teacherId: teacher.id },
    select: { id: true },
  })
  if (owned.length !== ids.length) {
    return NextResponse.json({ error: '학습지를 찾을 수 없습니다.' }, { status: 404 })
  }

  // 이미 배포된 학생은 upsert(기존 유지) — 숨김 처리된 건은 재배포 시 다시 노출
  const results = await Promise.all(
    ids.flatMap(wsId =>
      studentIds.map((studentId: string) =>
        prisma.worksheetDistribution.upsert({
          where: { worksheetId_studentId: { worksheetId: wsId, studentId } },
          update: { hiddenAt: null }, // 배포 이력은 유지, 숨김만 해제
          create: { worksheetId: wsId, studentId, status: 'distributed' },
        })
      )
    )
  )

  return NextResponse.json({
    distributed: results.length,
    worksheetCount: ids.length,
    studentCount: studentIds.length,
  })
}

// GET /api/worksheets/distribute?worksheetId=xxx — 배포 현황
// 숨김 처리된 배포는 제외 (?includeHidden=1 로 포함 가능)
export async function GET(req: NextRequest) {
  const teacher = await requireTeacher(req)
  if (teacher instanceof NextResponse) return teacher

  const worksheetId = req.nextUrl.searchParams.get('worksheetId')
  if (!worksheetId) return NextResponse.json([])

  const includeHidden = req.nextUrl.searchParams.get('includeHidden') === '1'

  const dists = await prisma.worksheetDistribution.findMany({
    where: {
      worksheetId,
      worksheet: { teacherId: teacher.id },
      ...(includeHidden ? {} : { hiddenAt: null }),
    },
    include: { student: { include: { user: { select: { name: true } } } }, result: true },
  })
  return NextResponse.json(dists)
}

// DELETE /api/worksheets/distribute — 배포 취소 (미제출 건만 삭제)
// body: { worksheetId, studentIds?: string[] }  studentIds 생략 시 해당 학습지 전체 대상
// 제출(채점결과 존재) 건은 학습이력·능력치 보존을 위해 삭제하지 않고 blocked 로 반환
export async function DELETE(req: NextRequest) {
  const teacher = await requireTeacher(req)
  if (teacher instanceof NextResponse) return teacher

  const { worksheetId, studentIds } = await req.json().catch(() => ({}))
  if (!worksheetId) return NextResponse.json({ error: '학습지를 선택하세요.' }, { status: 400 })

  const targets = await prisma.worksheetDistribution.findMany({
    where: {
      worksheetId,
      worksheet: { teacherId: teacher.id },
      ...(Array.isArray(studentIds) && studentIds.length > 0 ? { studentId: { in: studentIds } } : {}),
    },
    include: {
      result: { select: { id: true } },
      student: { include: { user: { select: { name: true } } } },
    },
  })

  if (targets.length === 0) return NextResponse.json({ deleted: 0, blocked: [] })

  const deletable = targets.filter(d => d.result === null)
  const blocked   = targets.filter(d => d.result !== null)

  if (deletable.length > 0) {
    await prisma.worksheetDistribution.deleteMany({ where: { id: { in: deletable.map(d => d.id) } } })
  }

  return NextResponse.json({
    deleted: deletable.length,
    blocked: blocked.map(d => ({
      distributionId: d.id,
      studentId: d.studentId,
      studentName: d.student.user.name,
      hidden: d.hiddenAt !== null,
    })),
  })
}

// PATCH /api/worksheets/distribute — 배포 목록에서 숨기기 / 숨김 해제
// body: { distributionIds: string[], hidden: boolean }
// 선생님 배포목록에서만 감춘다. 학생앱·학습이력·집계는 그대로 유지
export async function PATCH(req: NextRequest) {
  const teacher = await requireTeacher(req)
  if (teacher instanceof NextResponse) return teacher

  const { distributionIds, hidden } = await req.json().catch(() => ({}))
  if (!Array.isArray(distributionIds) || distributionIds.length === 0) {
    return NextResponse.json({ error: '대상을 선택하세요.' }, { status: 400 })
  }

  const { count } = await prisma.worksheetDistribution.updateMany({
    where: { id: { in: distributionIds }, worksheet: { teacherId: teacher.id } },
    data: { hiddenAt: hidden === false ? null : new Date() },
  })

  return NextResponse.json({ updated: count, hidden: hidden !== false })
}
