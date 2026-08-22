// apps/web/src/lib/statAggregator.ts
//
// 초3~고3 K-수학 4계층 체계화 (대단원 ➡️ 중단원 ➡️ 소단원 ➡️ 문제유형)
// 학생 소단원 및 유형별 정답률 실시간 갱신 & 취약점 트리거

import { prisma } from '@/lib/prisma'
import { checkAndTriggerWeaknessMission } from './missionEngine'
import type { Prisma, MathGradeSubject } from '@prisma/client'

export interface AnswerSubmission {
  questionId: string
  subUnitId: string
  patternTypeId?: string | null
  isCorrect: boolean
  timeSpentSec: number
}

export interface SubmissionItemStat {
  subUnitId?: string | null
  subUnitCode?: string | null
  patternTypeId?: string | null
  patternTypeCode?: string | null
  isCorrect: boolean
}

export interface UnitStatNode {
  id: string
  code: string
  name: string
  totalSolved: number
  correctCount: number
  accuracyRate: number // 0.0 ~ 100.0%
}

export interface SubUnitWithStats extends UnitStatNode {
  orderIndex: number
  patternTypes: (UnitStatNode & { difficulty: number })[]
}

export interface MiddleUnitWithStats extends UnitStatNode {
  orderIndex: number
  subUnits: SubUnitWithStats[]
}

export interface MajorUnitWithStats extends UnitStatNode {
  subject: MathGradeSubject
  orderIndex: number
  middleUnits: MiddleUnitWithStats[]
}

export interface WeaknessInsight {
  subUnitId: string
  subUnitCode: string
  subUnitName: string
  middleUnitName: string
  majorUnitName: string
  subject: MathGradeSubject
  totalSolved: number
  correctCount: number
  accuracyRate: number
  severity: 'CRITICAL' | 'WARNING' | 'NEEDS_PRACTICE' | 'GOOD'
  recommendation: string
}

export interface RadarCapabilityPoint {
  subject: string
  subjectCode: MathGradeSubject | string
  displayName: string
  accuracyRate: number
  totalSolved: number
  fullMark: number
}

/**
 * 정답률 백분율(%) 계산기 (소수점 1자리 반올림)
 */
export function calcAccuracy(correct: number, total: number): number {
  if (!total || total <= 0) return 0.0
  const rate = (correct / total) * 100
  return Number(rate.toFixed(1))
}

/**
 * 학생 답안 제출 실시간 정답률 갱신 & 취약점 트리거 엔진
 */
export async function processSubmissionStats(
  studentId: string,
  submissions: AnswerSubmission[]
) {
  const subUnitMap = new Map<string, { total: number; correct: number }>()
  const patternMap = new Map<string, { total: number; correct: number }>()

  for (const item of submissions) {
    if (item.subUnitId) {
      if (!subUnitMap.has(item.subUnitId)) {
        subUnitMap.set(item.subUnitId, { total: 0, correct: 0 })
      }
      const target = subUnitMap.get(item.subUnitId)!
      target.total += 1
      if (item.isCorrect) target.correct += 1
    }

    if (item.patternTypeId) {
      if (!patternMap.has(item.patternTypeId)) {
        patternMap.set(item.patternTypeId, { total: 0, correct: 0 })
      }
      const pTarget = patternMap.get(item.patternTypeId)!
      pTarget.total += 1
      if (item.isCorrect) pTarget.correct += 1
    }
  }

  // DB 트랜잭션으로 Upsert & 정답률(백분율) 재계산
  await prisma.$transaction(async (tx) => {
    // 1. 소단원별 정답률 통계 갱신
    for (const [subUnitId, data] of subUnitMap.entries()) {
      const existing = await tx.studentSubUnitStat.findUnique({
        where: { studentId_subUnitId: { studentId, subUnitId } },
      })

      const newTotal = (existing?.totalSolved || 0) + data.total
      const newCorrect = (existing?.correctCount || 0) + data.correct
      const newAccuracy = Number(((newCorrect / newTotal) * 100).toFixed(1))

      await tx.studentSubUnitStat.upsert({
        where: { studentId_subUnitId: { studentId, subUnitId } },
        create: {
          studentId,
          subUnitId,
          totalSolved: newTotal,
          correctCount: newCorrect,
          accuracyRate: newAccuracy,
        },
        update: {
          totalSolved: newTotal,
          correctCount: newCorrect,
          accuracyRate: newAccuracy,
        },
      })

      // 최소 3문항 이상 풀이 시 학생별 맞춤 기준 정답률에 따라 자동 처방 미션 및 음성 브리핑 검사
      if (newTotal >= 3) {
        await checkAndTriggerWeaknessMission(studentId, subUnitId, newAccuracy)
      }
    }

    // 2. 문제유형별 정답률 통계 갱신 (점진적 확장)
    for (const [patternTypeId, data] of patternMap.entries()) {
      const existing = await tx.studentPatternStat.findUnique({
        where: { studentId_patternTypeId: { studentId, patternTypeId } },
      })

      const newTotal = (existing?.totalSolved || 0) + data.total
      const newCorrect = (existing?.correctCount || 0) + data.correct
      const newAccuracy = Number(((newCorrect / newTotal) * 100).toFixed(1))

      await tx.studentPatternStat.upsert({
        where: { studentId_patternTypeId: { studentId, patternTypeId } },
        create: {
          studentId,
          patternTypeId,
          totalSolved: newTotal,
          correctCount: newCorrect,
          accuracyRate: newAccuracy,
        },
        update: {
          totalSolved: newTotal,
          correctCount: newCorrect,
          accuracyRate: newAccuracy,
        },
      })
    }
  })
}

/**
 * 답안 제출 시 소단원 및 문제유형별 정답률을 DB 트랜잭션으로 원자적(Atomic) 갱신 (호환용)
 */
export async function recordAtomicSubmissionStats(
  tx: Prisma.TransactionClient | typeof prisma,
  studentId: string,
  items: SubmissionItemStat[]
): Promise<{
  updatedSubUnitsCount: number
  updatedPatternsCount: number
}> {
  if (!items || items.length === 0) {
    return { updatedSubUnitsCount: 0, updatedPatternsCount: 0 }
  }

  const submissions: AnswerSubmission[] = items.map((it, idx) => ({
    questionId: `sub_${idx}_${Date.now()}`,
    subUnitId: it.subUnitId || '',
    patternTypeId: it.patternTypeId || null,
    isCorrect: it.isCorrect,
    timeSpentSec: 0,
  })).filter(s => Boolean(s.subUnitId))

  if (submissions.length > 0) {
    await processSubmissionStats(studentId, submissions)
  }

  return { updatedSubUnitsCount: submissions.length, updatedPatternsCount: 0 }
}

/**
 * 학년/과목별 한글 명칭 매핑
 */
export const MATH_SUBJECT_LABELS: Record<MathGradeSubject, string> = {
  ELEM_3_1: '초등 3-1',
  ELEM_3_2: '초등 3-2',
  ELEM_4_1: '초등 4-1',
  ELEM_4_2: '초등 4-2',
  ELEM_5_1: '초등 5-1',
  ELEM_5_2: '초등 5-2',
  ELEM_6_1: '초등 6-1',
  ELEM_6_2: '초등 6-2',
  MID_1_1: '중등 1-1',
  MID_1_2: '중등 1-2',
  MID_2_1: '중등 2-1',
  MID_2_2: '중등 2-2',
  MID_3_1: '중등 3-1',
  MID_3_2: '중등 3-2',
  HIGH_COMMON_1: '공통수학 1',
  HIGH_COMMON_2: '공통수학 2',
  HIGH_ALGEBRA: '대수 (고2)',
  HIGH_CALC_1: '미적분Ⅰ (고2)',
  HIGH_CALC_2: '미적분Ⅱ (고3)',
  HIGH_PROB_STAT: '확률과 통계',
  HIGH_GEOMETRY: '기하 (고3)',
}

/**
 * 학생의 4계층(대단원 ➡️ 중단원 ➡️ 소단원 ➡️ 문제유형) 전체 누적 정답률 트리 조회
 */
export async function getStudentHierarchyStats(
  studentId: string,
  subjectFilter?: MathGradeSubject
): Promise<MajorUnitWithStats[]> {
  const majorUnits = await prisma.mathMajorUnit.findMany({
    where: subjectFilter ? { subject: subjectFilter } : undefined,
    orderBy: [{ subject: 'asc' }, { orderIndex: 'asc' }],
    include: {
      middleUnits: {
        orderBy: { orderIndex: 'asc' },
        include: {
          subUnits: {
            orderBy: { orderIndex: 'asc' },
            include: {
              patternTypes: {
                orderBy: { typeCode: 'asc' },
                include: {
                  stats: {
                    where: { studentId },
                  },
                },
              },
              stats: {
                where: { studentId },
              },
            },
          },
        },
      },
    },
  })

  return majorUnits.map(major => {
    let majorTotal = 0
    let majorCorrect = 0

    const middleUnitsWithStats: MiddleUnitWithStats[] = major.middleUnits.map(mid => {
      let midTotal = 0
      let midCorrect = 0

      const subUnitsWithStats: SubUnitWithStats[] = mid.subUnits.map(sub => {
        const subStat = sub.stats[0]
        const subTotal = subStat ? subStat.totalSolved : 0
        const subCorrect = subStat ? subStat.correctCount : 0
        const subRate = subStat ? subStat.accuracyRate : 0.0

        midTotal += subTotal
        midCorrect += subCorrect

        const patternTypesWithStats = sub.patternTypes.map(pt => {
          const ptStat = pt.stats[0]
          return {
            id: pt.id,
            code: pt.typeCode,
            name: pt.typeName,
            difficulty: pt.difficulty,
            totalSolved: ptStat ? ptStat.totalSolved : 0,
            correctCount: ptStat ? ptStat.correctCount : 0,
            accuracyRate: ptStat ? ptStat.accuracyRate : 0.0,
          }
        })

        return {
          id: sub.id,
          code: sub.code,
          name: sub.name,
          orderIndex: sub.orderIndex,
          totalSolved: subTotal,
          correctCount: subCorrect,
          accuracyRate: subRate,
          patternTypes: patternTypesWithStats,
        }
      })

      majorTotal += midTotal
      majorCorrect += midCorrect

      return {
        id: mid.id,
        code: mid.code,
        name: mid.name,
        orderIndex: mid.orderIndex,
        totalSolved: midTotal,
        correctCount: midCorrect,
        accuracyRate: calcAccuracy(midCorrect, midTotal),
        subUnits: subUnitsWithStats,
      }
    })

    return {
      id: major.id,
      code: major.code,
      name: major.name,
      subject: major.subject,
      orderIndex: major.orderIndex,
      totalSolved: majorTotal,
      correctCount: majorCorrect,
      accuracyRate: calcAccuracy(majorCorrect, majorTotal),
      middleUnits: middleUnitsWithStats,
    }
  })
}

/**
 * 학생의 취약 소단원 랭킹 및 레이더 차트 분석 데이터 산출
 */
export async function getStudentWeaknessRadarData(studentId: string): Promise<{
  radarData: RadarCapabilityPoint[]
  weaknesses: WeaknessInsight[]
  summary: {
    totalSubUnitsSolved: number
    overallAccuracy: number
    criticalCount: number
    warningCount: number
    masteredCount: number
  }
}> {
  // 1. 학생의 모든 소단원 통계 조회
  const stats = await prisma.studentSubUnitStat.findMany({
    where: { studentId },
    include: {
      subUnit: {
        include: {
          middleUnit: {
            include: {
              majorUnit: true,
            },
          },
        },
      },
    },
    orderBy: [{ accuracyRate: 'asc' }, { totalSolved: 'desc' }],
  })

  // 2. 과목/대단원별 레이더 데이터 집계
  const subjectAgg = new Map<MathGradeSubject, { total: number; correct: number }>()

  const weaknesses: WeaknessInsight[] = []
  let totalSolvedAll = 0
  let correctSolvedAll = 0
  let criticalCount = 0
  let warningCount = 0
  let masteredCount = 0

  for (const s of stats) {
    const sub = s.subUnit
    const mid = sub.middleUnit
    const major = mid.majorUnit
    const subject = major.subject

    totalSolvedAll += s.totalSolved
    correctSolvedAll += s.correctCount

    const agg = subjectAgg.get(subject) ?? { total: 0, correct: 0 }
    agg.total += s.totalSolved
    agg.correct += s.correctCount
    subjectAgg.set(subject, agg)

    let severity: WeaknessInsight['severity'] = 'GOOD'
    let recommendation = '개념 완성 단계입니다. 심화/최상위 문제를 도전하세요.'

    if (s.totalSolved >= 3) {
      if (s.accuracyRate < 50.0) {
        severity = 'CRITICAL'
        recommendation = '핵심 공식 및 기본 개념 재학습과 기초 계산 집중 훈련이 필요합니다.'
        criticalCount++
      } else if (s.accuracyRate < 70.0) {
        severity = 'WARNING'
        recommendation = '대표 필수 유형 복습 및 오답 쌍둥이 문제 반복 풀이를 권장합니다.'
        warningCount++
      } else if (s.accuracyRate < 85.0) {
        severity = 'NEEDS_PRACTICE'
        recommendation = '실수 방지 및 응용 발전 유형 학습을 추천합니다.'
      } else {
        masteredCount++
      }
    }

    weaknesses.push({
      subUnitId: sub.id,
      subUnitCode: sub.code,
      subUnitName: sub.name,
      middleUnitName: mid.name,
      majorUnitName: major.name,
      subject: major.subject,
      totalSolved: s.totalSolved,
      correctCount: s.correctCount,
      accuracyRate: s.accuracyRate,
      severity,
      recommendation,
    })
  }

  // 3. 레이더 차트 포인트 구성
  const radarData: RadarCapabilityPoint[] = []

  for (const [subj, data] of subjectAgg.entries()) {
    radarData.push({
      subject: MATH_SUBJECT_LABELS[subj] || subj,
      subjectCode: subj,
      displayName: MATH_SUBJECT_LABELS[subj] || subj,
      accuracyRate: calcAccuracy(data.correct, data.total),
      totalSolved: data.total,
      fullMark: 100,
    })
  }

  if (radarData.length === 0) {
    const defaultAxes: MathGradeSubject[] = ['MID_1_1', 'MID_2_1', 'MID_3_1', 'HIGH_COMMON_1', 'HIGH_ALGEBRA']
    for (const axis of defaultAxes) {
      radarData.push({
        subject: MATH_SUBJECT_LABELS[axis],
        subjectCode: axis,
        displayName: MATH_SUBJECT_LABELS[axis],
        accuracyRate: 0,
        totalSolved: 0,
        fullMark: 100,
      })
    }
  }

  return {
    radarData,
    weaknesses,
    summary: {
      totalSubUnitsSolved: stats.length,
      overallAccuracy: calcAccuracy(correctSolvedAll, totalSolvedAll),
      criticalCount,
      warningCount,
      masteredCount,
    },
  }
}
