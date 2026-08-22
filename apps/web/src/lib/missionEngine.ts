// apps/web/src/lib/missionEngine.ts
//
// 취약점 감지 시 자동 처방 미션 및 알림 엔진

import { prisma } from '@/lib/prisma'
import { broadcastToTeacher } from '@/lib/sse'

export interface WeaknessMissionResult {
  studentId: string
  studentName: string
  subUnitId: string
  subUnitName: string
  accuracyRate: number
  prescriptionType: 'CONCEPT_REINFORCEMENT' | 'STEP_DOWN_DRILL' | 'TWIN_PROBLEM_PRESCRIPTION'
  message: string
}

/**
 * 소단원 정답률 60% 미만(최소 5문항 이상 풀이) 취약점 발생 시 자동 처방 미션 발급 및 교사 알림 트리거
 */
export async function checkAndTriggerWeaknessMission(
  studentId: string,
  subUnitId: string,
  accuracyRate: number
): Promise<WeaknessMissionResult | null> {
  try {
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: {
        user: { select: { name: true } },
        teacher: true,
      },
    })

    if (!student) return null

    const subUnit = await prisma.mathSubUnit.findUnique({
      where: { id: subUnitId },
      include: {
        middleUnit: {
          include: {
            majorUnit: true,
          },
        },
      },
    })

    if (!subUnit) return null

    // 처방 미션 유형 결정
    let prescriptionType: WeaknessMissionResult['prescriptionType'] = 'TWIN_PROBLEM_PRESCRIPTION'
    let message = `[취약점 처방] ${subUnit.name} 소단원 정답률이 ${accuracyRate}%입니다. 오답 쌍둥이 문제 집중 훈련을 추천합니다.`

    if (accuracyRate < 40.0) {
      prescriptionType = 'CONCEPT_REINFORCEMENT'
      message = `[긴급 처방] ${subUnit.name} 개념 이해도가 매우 취약합니다(${accuracyRate}%). 선수 개념 복습 및 기본 개념익히기 미션이 권장됩니다.`
    } else if (accuracyRate < 50.0) {
      prescriptionType = 'STEP_DOWN_DRILL'
      message = `[집중 처방] ${subUnit.name} 단계별 기초 계산 및 기본 유형 복습 훈련이 필요합니다(${accuracyRate}%).`
    }

    // SSE: 실시간 교사 대시보드 취약점 감지 팝업 브로드캐스트
    if (student.teacherId) {
      broadcastToTeacher(student.teacherId, {
        type: 'WEAKNESS_TRIGGERED',
        studentId: student.id,
        studentName: student.user.name,
        subUnitId: subUnit.id,
        subUnitName: subUnit.name,
        majorUnitName: subUnit.middleUnit.majorUnit.name,
        accuracyRate,
        prescriptionType,
        message,
        timestamp: new Date().toISOString(),
      })
    }

    return {
      studentId: student.id,
      studentName: student.user.name,
      subUnitId: subUnit.id,
      subUnitName: subUnit.name,
      accuracyRate,
      prescriptionType,
      message,
    }
  } catch (error) {
    console.error('[missionEngine] checkAndTriggerWeaknessMission error:', error)
    return null
  }
}
