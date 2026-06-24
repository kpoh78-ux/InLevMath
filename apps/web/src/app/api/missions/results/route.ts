import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getAuthUser } from '@/lib/auth'
import { broadcastToTeacher, broadcastToStudentsOfTeacher } from '@/lib/sse'
import {
  calcCorrectRate, calcAbilityDelta,
  MISSION_CLEAR_THRESHOLD, MISSION_ORDER,
  MissionType,
} from '@inlevmath/shared'

// POST /api/missions/results — 학생이 미션 결과 입력
export async function POST(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user || user.role !== 'student') {
    return NextResponse.json({ error: '학생만 결과를 입력할 수 있습니다.' }, { status: 403 })
  }

  const { missionType, totalProblems, correctProblems, source, solvedAt } = await req.json()

  if (!missionType || !totalProblems || correctProblems == null || !source) {
    return NextResponse.json({ error: '필수 항목이 누락되었습니다.' }, { status: 400 })
  }
  if (correctProblems > totalProblems || correctProblems < 0) {
    return NextResponse.json({ error: '정답 수가 총 문제 수를 초과합니다.' }, { status: 400 })
  }

  const student = await prisma.student.findUnique({
    where: { userId: user.sub },
    include: { teacher: true },
  })
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

  // 미션 클리어 판정 및 레벨업
  let missionCleared = false
  const threshold = MISSION_CLEAR_THRESHOLD[missionType as MissionType]
  if (rate >= threshold) {
    const nextIdx = MISSION_ORDER.indexOf(missionType as MissionType) + 1
    const nextMission = MISSION_ORDER[nextIdx] ?? missionType
    if (nextMission !== student.currentMission) {
      missionCleared = true
      await prisma.student.update({
        where: { id: student.id },
        data: {
          currentMission: nextMission as MissionType,
          currentLevel: { increment: 1 },
        },
      })
    }
  }

  // SSE: 학생 결과 입력 → 선생님에게 실시간 알림
  const sseEvent = {
    type: 'MISSION_RESULT',
    studentId: student.id,
    studentName: user.name,
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
      studentName: user.name,
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
