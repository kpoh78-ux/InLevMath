import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken } from '@/lib/auth'
import { academyTeacher } from '@/lib/academy'
import { broadcastToStudentsOfTeacher } from '@/lib/sse'

// 학생별 학습지 목록에서 쓰는 배포 건 관리.
//   POST   — 재출제 (기존 답안·채점을 지우고 다시 풀게 한다)
//   DELETE — 배포 취소 (여러 건 한 번에)
//
// 배포 자체를 만드는 것은 /api/worksheets/distribute 가 담당한다.

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

/** 요청에 담긴 배포 id 중 이 학원 것만 골라낸다 */
async function ownedIds(teacherId: string, raw: unknown): Promise<string[] | null> {
  const ids = Array.isArray(raw)
    ? [...new Set(raw.filter((v): v is string => typeof v === 'string' && v !== ''))]
    : []
  if (ids.length === 0) return null

  const owned = await prisma.worksheetDistribution.findMany({
    where: { id: { in: ids }, worksheet: { teacherId } },
    select: { id: true, studentId: true },
  })
  // 남의 학원 건이 섞이면 그 건만 빼지 않고 요청 전체를 막는다
  if (owned.length !== ids.length) return null
  return owned.map(o => o.id)
}

/**
 * POST — 재출제.
 * 학생이 낸 답과 채점 결과를 지우고 '배포됨'으로 되돌린다.
 * 학습지 자체는 그대로이므로 학생 앱에서 다시 풀 수 있게 된다.
 */
export async function POST(req: NextRequest) {
  const teacher = await requireTeacher(req)
  if (teacher instanceof NextResponse) return teacher

  const body = await req.json().catch(() => ({}))
  const ids = await ownedIds(teacher.id, body.distributionIds)
  if (!ids) {
    return NextResponse.json({ error: '재출제할 학습지를 찾을 수 없습니다.' }, { status: 404 })
  }

  const targets = await prisma.worksheetDistribution.findMany({
    where: { id: { in: ids } },
    select: { studentId: true },
  })

  await prisma.$transaction([
    // 낸 답과 채점 결과를 지운다 — 이게 남아 있으면 학생 앱에서 문항이 잠긴 채로 보인다
    prisma.worksheetResult.deleteMany({ where: { distributionId: { in: ids } } }),
    prisma.worksheetDistribution.updateMany({
      where: { id: { in: ids } },
      data: { status: 'distributed', hiddenAt: null, distributedAt: new Date() },
    }),
  ])

  // 학생 앱에 새 학습지가 온 것과 같은 형태로 알린다 (distribute 라우트와 페이로드 통일)
  broadcastToStudentsOfTeacher(teacher.id, {
    type: 'NEW_MISSION',
    title: '학습지 재출제',
    message: ids.length === 1
      ? '선생님이 학습지를 다시 내주셨습니다. 새로 풀어보세요!'
      : `학습지 ${ids.length}개가 다시 출제되었습니다.`,
    worksheetCount: ids.length,
    studentIds: [...new Set(targets.map(t => t.studentId))],
  })

  return NextResponse.json({ success: true, count: ids.length })
}

/** DELETE — 배포 취소. 답안·채점 결과까지 함께 지운다. */
export async function DELETE(req: NextRequest) {
  const teacher = await requireTeacher(req)
  if (teacher instanceof NextResponse) return teacher

  const body = await req.json().catch(() => ({}))
  const ids = await ownedIds(teacher.id, body.distributionIds)
  if (!ids) {
    return NextResponse.json({ error: '삭제할 학습지를 찾을 수 없습니다.' }, { status: 404 })
  }

  // WorksheetResult 는 distribution 에 cascade 로 묶여 있지만,
  // 스키마 변경에 흔들리지 않도록 명시적으로 지운다
  await prisma.$transaction([
    prisma.worksheetResult.deleteMany({ where: { distributionId: { in: ids } } }),
    prisma.worksheetDistribution.deleteMany({ where: { id: { in: ids } } }),
  ])

  return NextResponse.json({ success: true, count: ids.length })
}
