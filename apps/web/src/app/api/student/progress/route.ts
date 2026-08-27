import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getAuthUser } from '@/lib/auth'
import { tryRecalcStudentLevel } from '@/lib/studentLevel'
import { MISSION_ORDER, MissionType, levelInfoOf } from '@inlevmath/shared'

export const dynamic = 'force-dynamic'

// GET /api/student/progress — 학생 본인의 레벨·능력치·미션 진행 상황
//
// 학생 앱 홈 화면이 쓴다. 예전에는 앱이 Lv3 / 능력치 72·58·45를 하드코딩해
// 모든 학생에게 같은 값을 보여줬다.
export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user || user.role !== 'student') {
    return NextResponse.json({ error: '학생만 조회할 수 있습니다.' }, { status: 403 })
  }

  const student = await prisma.student.findUnique({
    where: { userId: user.sub },
    select: {
      id: true,
      currentLevel: true,
      currentMission: true,
      avgCorrectRate: true,
      comprehension: true,
      reasoning: true,
      calculation: true,
      rewardPoints: true,
    },
  })
  if (!student) {
    return NextResponse.json({ error: '학생 정보를 찾을 수 없습니다.' }, { status: 404 })
  }

  // 학습지 채점일이 90일을 넘기면 반영 비중이 옮겨가므로, 볼 때마다 다시 계산한다.
  // 실패해도 저장된 값으로 화면은 그린다.
  const snapshot = await tryRecalcStudentLevel(student.id)
  const info = snapshot ?? levelInfoOf(student.avgCorrectRate, 0)

  // 지금 미션 앞의 단계는 모두 클리어한 것으로 본다
  const missionIdx = MISSION_ORDER.indexOf(student.currentMission as MissionType)
  const clearedMissions = missionIdx > 0 ? MISSION_ORDER.slice(0, missionIdx) : []

  return NextResponse.json({
    currentLevel: snapshot?.level ?? student.currentLevel,
    currentMission: student.currentMission,
    clearedMissions,
    abilityScore: {
      comprehension: Math.round(student.comprehension * 10) / 10,
      reasoning: Math.round(student.reasoning * 10) / 10,
      calculation: Math.round(student.calculation * 10) / 10,
    },
    avgCorrectRate: snapshot?.avgCorrectRate ?? student.avgCorrectRate,
    title: info.title,
    unranked: info.unranked,
    capped: info.capped,
    totalProblems: snapshot?.totalProblems ?? 0,
    rewardPoints: student.rewardPoints,
  })
}
