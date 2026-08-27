// apps/web/src/lib/reportOptions.ts
//
// 하원 학습리포트에 무엇을 담을지 — 2계층 설정.
//
//   1층 프리셋   AttendanceNotificationConfig   선생님별 기본값. 한 번 정해 두고 계속 쓴다
//   2층 오버라이드 DailyStudentReportOverride    학생 1명의 그날 하루만. 없으면 프리셋을 쓴다
//
// 계층을 더 두지 않는다. "이 학생은 늘 코멘트를 빼자" 같은 요구가 나와도
// 학생별 상시 설정을 만들면 어느 설정이 이겼는지 아무도 못 따라간다.
// 그날 하루만 바꾸고 기록(editedBy)을 남기는 쪽이 운영에서 덜 위험하다.

import { prisma } from './db'

/** 리포트 항목 키 — 화면 체크박스와 1:1 */
export const REPORT_ITEM_KEYS = [
  'includeAttendance',
  'includeHomework',
  'includeCalcBook',
  'includeProgressBook',
  'includeWorksheet',
  'includeUnitExam',
  'includeGoalRate',
  'includeAttitude',
  'includeComment',
] as const

export type ReportItemKey = (typeof REPORT_ITEM_KEYS)[number]

export type ReportItems = Record<ReportItemKey, boolean>

/** 화면에 그대로 쓰는 이름과 설명 */
export const REPORT_ITEM_META: Record<ReportItemKey, { label: string; hint: string }> = {
  includeAttendance:   { label: '출결·지각',        hint: '등·하원 시각과 지각 여부. 수업 시작 시각과 맞대어 자동 판정' },
  includeHomework:     { label: '숙제',             hint: '완성도(얼마나 풀었나)와 정답률(푼 것 중 맞은 비율)' },
  includeCalcBook:     { label: '연산교재',         hint: '연산으로 분류한 교재의 그날 채점 결과' },
  includeProgressBook: { label: '진도교재',         hint: '진도로 분류한 교재의 그날 채점 결과' },
  includeWorksheet:    { label: '오답 클리닉',      hint: '최다오답·오답유형·취약유형 학습지' },
  includeUnitExam:     { label: '단원평가·모의고사', hint: '단원평가·모의고사·기출문제 학습지' },
  includeGoalRate:     { label: '목표 완성률',      hint: '그날 낸 문항 ÷ 그날 배정된 문항' },
  includeAttitude:     { label: '수업 태도',        hint: '데이터로 뽑을 수 없어 선생님이 그날 직접 적는다' },
  includeComment:      { label: '선생님 코멘트',    hint: '학부모에게 남기는 자유 문장' },
}

/** 프리셋이 없을 때 쓰는 기본값 — 스키마 default 와 같아야 한다 */
export const DEFAULT_ITEMS: ReportItems = {
  includeAttendance: true,
  includeHomework: true,
  includeCalcBook: true,
  includeProgressBook: true,
  includeWorksheet: true,
  includeUnitExam: true,
  includeGoalRate: false,
  includeAttitude: false,
  includeComment: false,
}

/** 어디서 온 값인지 — 화면에서 "오늘만 바꿈"을 표시하려면 알아야 한다 */
export type ItemsSource = 'default' | 'preset' | 'override'

export type ResolvedReportOptions = {
  items: ReportItems
  source: ItemsSource
  /** 오버라이드가 있을 때만 값이 있다 */
  attitude: string | null
  comment: string | null
  editedBy: string | null
}

function pickItems(row: Partial<Record<ReportItemKey, boolean>>): ReportItems {
  const out = { ...DEFAULT_ITEMS }
  for (const k of REPORT_ITEM_KEYS) {
    if (typeof row[k] === 'boolean') out[k] = row[k] as boolean
  }
  return out
}

/** 요청 본문에서 항목 체크박스만 골라낸다 (알 수 없는 키는 버린다) */
export function readItemsFromBody(body: unknown): Partial<ReportItems> {
  const out: Partial<ReportItems> = {}
  if (body && typeof body === 'object') {
    const rec = body as Record<string, unknown>
    for (const k of REPORT_ITEM_KEYS) {
      if (typeof rec[k] === 'boolean') out[k] = rec[k] as boolean
    }
  }
  return out
}

/** 선생님 프리셋. 없으면 기본값 */
export async function getTeacherPreset(teacherId: string): Promise<{
  items: ReportItems
  autoSendOnCheckOut: boolean
  exists: boolean
}> {
  const row = await prisma.attendanceNotificationConfig.findUnique({ where: { teacherId } })
  if (!row) return { items: { ...DEFAULT_ITEMS }, autoSendOnCheckOut: false, exists: false }
  return { items: pickItems(row), autoSendOnCheckOut: row.autoSendOnCheckOut, exists: true }
}

/**
 * 이 학생의 이 날짜에 실제로 적용되는 항목.
 * 오버라이드가 있으면 그것이, 없으면 선생님 프리셋이 이긴다.
 */
export async function resolveReportOptions(
  teacherId: string,
  studentId: string,
  date: string
): Promise<ResolvedReportOptions> {
  const [preset, override] = await Promise.all([
    getTeacherPreset(teacherId),
    prisma.dailyStudentReportOverride.findUnique({
      where: { studentId_date: { studentId, date } },
    }),
  ])

  if (!override) {
    return {
      items: preset.items,
      source: preset.exists ? 'preset' : 'default',
      attitude: null,
      comment: null,
      editedBy: null,
    }
  }

  return {
    items: pickItems(override),
    source: 'override',
    attitude: override.attitude ?? null,
    comment: override.comment ?? null,
    editedBy: override.editedBy ?? null,
  }
}

/** 여러 학생분을 한 번에 — 리포트 목록처럼 전원을 도는 곳에서 쓴다 */
export async function resolveReportOptionsForStudents(
  teacherId: string,
  studentIds: string[],
  date: string
): Promise<Map<string, ResolvedReportOptions>> {
  const preset = await getTeacherPreset(teacherId)
  const overrides = studentIds.length
    ? await prisma.dailyStudentReportOverride.findMany({
        where: { date, studentId: { in: studentIds } },
      })
    : []

  const byStudent = new Map(overrides.map(o => [o.studentId, o]))
  const out = new Map<string, ResolvedReportOptions>()

  for (const studentId of studentIds) {
    const o = byStudent.get(studentId)
    out.set(
      studentId,
      o
        ? {
            items: pickItems(o),
            source: 'override',
            attitude: o.attitude ?? null,
            comment: o.comment ?? null,
            editedBy: o.editedBy ?? null,
          }
        : {
            items: preset.items,
            source: preset.exists ? 'preset' : 'default',
            attitude: null,
            comment: null,
            editedBy: null,
          }
    )
  }
  return out
}
