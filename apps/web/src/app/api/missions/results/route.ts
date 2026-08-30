import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getAuthUser } from '@/lib/auth'
import { academyTeacher } from '@/lib/academy'
import { broadcastToTeacher, broadcastToStudentsOfTeacher } from '@/lib/sse'
import {
  calcCorrectRate, calcAbilityDelta,
  MISSION_CLEAR_THRESHOLD, MISSION_ORDER,
  MissionType,
} from '@inlevmath/shared'

// POST /api/missions/results — 미션(학습 관찰) 결과 입력
//
// **선생님이 학생을 관찰해 입력한다.** 예전에는 학생 앱에서 스스로 넣었는데,
// 문제 수와 맞은 개수를 학생이 직접 적으면 확인할 방법이 없었다. 학습지·교재는
// 정답이 저장돼 있어 자동 채점되지만, 그 밖의 학습(개념 설명 후 확인문제,
// 구두 문답 등)은 선생님이 옆에서 본 것을 적는 수밖에 없다.
//
// 선생님이 부를 때는 body 에 studentId 를 함께 보낸다.
// 학생 계정으로도 아직 부를 수 있게 남겨 두었다 — 예전 앱이 남아 있을 수 있고,
// 그 경우 자기 자신의 결과만 넣는다.
export async function POST(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const {
    missionType, totalProblems, correctProblems, source, solvedAt,
    studentId: targetStudentId, memo,
  } = await req.json()

  if (!missionType || !totalProblems || correctProblems == null || !source) {
    return NextResponse.json({ error: '필수 항목이 누락되었습니다.' }, { status: 400 })
  }
  if (correctProblems > totalProblems || correctProblems < 0) {
    return NextResponse.json({ error: '정답 수가 총 문제 수를 초과합니다.' }, { status: 400 })
  }

  let student
  if (user.role === 'teacher') {
    if (!targetStudentId) {
      return NextResponse.json({ error: '학생을 선택하세요.' }, { status: 400 })
    }
    // 우리 학원 학생인지 확인한다 — id 만 받고 그대로 쓰면 남의 학생에게 쓸 수 있다
    const teacher = await academyTeacher(user.sub)
    if (!teacher) return NextResponse.json({ error: '선생님 정보를 찾을 수 없습니다.' }, { status: 404 })
    student = await prisma.student.findFirst({
      where: { id: targetStudentId, teacherId: teacher.id },
      include: { teacher: true, user: { select: { name: true } } },
    })
  } else {
    student = await prisma.student.findUnique({
      where: { userId: user.sub },
      include: { teacher: true, user: { select: { name: true } } },
    })
  }
  if (!student) return NextResponse.json({ error: '학생 정보를 찾을 수 없습니다.' }, { status: 404 })

  // 결과 저장
  const result = await prisma.missionResult.create({
    data: {
      studentId: student.id,
      missionType,
      totalProblems,
      correctProblems,
      source,
      solvedAt: solvedAt ? new Date(solvedAt) : new Date(),
    },
  })

  // 능력치 계산 & 업데이트
  const rate = calcCorrectRate(totalProblems, correctProblems)
  const delta = calcAbilityDelta(missionType as MissionType, rate)

  const updatedStudent = await prisma.student.update({
    where: { id: student.id },
    data: {
      comprehension: { increment: delta.comprehension ?? 0 },
      reasoning:     { increment: delta.reasoning     ?? 0 },
      calculation:   { increment: delta.calculation   ?? 0 },
    },
  })

  // 미션 클리어 판정 — 다음 미션으로 넘어간다.
  // 레벨(Lv.1~9)은 평균 정답률에서만 나오므로 여기서 올리지 않는다.
  // 예전처럼 미션 클리어마다 +1 하면 정답률로 계산한 레벨과 서로 덮어쓴다.
  let missionCleared = false
  const threshold = MISSION_CLEAR_THRESHOLD[missionType as MissionType]
  if (rate >= threshold) {
    const nextIdx = MISSION_ORDER.indexOf(missionType as MissionType) + 1
    const nextMission = MISSION_ORDER[nextIdx] ?? missionType
    if (nextMission !== student.currentMission) {
      missionCleared = true
      await prisma.student.update({
        where: { id: student.id },
        data: { currentMission: nextMission as MissionType },
      })
    }
  }

  // SSE: 학생 결과 입력 → 선생님에게 실시간 알림
  const sseEvent = {
    type: 'MISSION_RESULT',
    studentId: student.id,
    studentName: student.user.name,
    missionType,
    correctRate: rate,
    missionCleared,
  }
  broadcastToTeacher(student.teacherId, sseEvent)

  // SSE: 레벨업 시 학생에게도 알림
  if (missionCleared) {
    broadcastToStudentsOfTeacher(student.teacherId, {
      type: 'LEVEL_UP',
      studentId: student.id,
      studentName: student.user.name,
    })
  }

  return NextResponse.json({ result, missionCleared, correctRate: rate }, { status: 201 })
}

// GET /api/missions/results — 학생 본인 이력 조회
export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  if (user.role === 'student') {
    const student = await prisma.student.findUnique({ where: { userId: user.sub } })
    if (!student) return NextResponse.json({ error: '학생 정보를 찾을 수 없습니다.' }, { status: 404 })

    const results = await prisma.missionResult.findMany({
      where: { studentId: student.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    return NextResponse.json(results)
  }

  return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
}
