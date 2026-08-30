// apps/web/src/lib/dailyReportAggregator.ts
//
// 하원 학습리포트의 항목별 숫자를 하루 단위로 집계한다.
//
// ── 왜 날짜 단위인가 ────────────────────────────────────────────────────────
// "등원부터 하원까지"를 시각으로 자르면 수업 후에 채점한 건이 빠진다.
// 선생님이 수업을 마치고 채점하는 일이 흔하므로 날짜(YYYY-MM-DD)로 자르고,
// 하원 시점에 한 번 · 이후 채점이 들어올 때 다시 부른다.
// 이 함수는 언제 불러도 같은 답을 내는 순수 집계다 (아무것도 쓰지 않는다).
//
// ── 왜 선생님을 가리지 않는가 ───────────────────────────────────────────────
// 시간표는 선생님마다 따로 만들지만 학생의 하루는 하나다. 같은 날 A선생님 수업
// 뒤에 B선생님 수업이 이어지면 학부모는 두 통이 아니라 한 통을 받아야 하고,
// 숙제·오답클리닉 숫자도 그날 전체를 합한 값이어야 한다.
// 그날 수업 목록은 dailyClasses 가, 학습 데이터는 여기서 날짜로 모은다.
//
// 무엇을 담을지는 reportOptions 가 정한다 (선생님 프리셋 + 당일 오버라이드).

import { prisma } from './db'
import { getStudentDayClasses, describeClasses, type DailyClassPlan } from './dailyClasses'
import { formatTimeKorean } from './attendanceService'
import { DEFAULT_ITEMS, type ReportItems } from './reportOptions'

/** 오답 클리닉으로 볼 학습지 단계 */
export const CLINIC_STEPS = ['최다오답', '오답유형', '취약유형']

/** 단원평가·모의고사로 볼 학습지 단계 */
export const EXAM_STEPS_FOR_REPORT = ['단원평가', '모의고사', '기출문제']

/** 하루의 시작·끝 (로컬 기준) */
export function dayRange(dateStr: string): { start: Date; end: Date } | null {
  const [y, m, d] = dateStr.split('-').map(Number)
  if (!y || !m || !d) return null
  return {
    start: new Date(y, m - 1, d, 0, 0, 0, 0),
    end: new Date(y, m - 1, d + 1, 0, 0, 0, 0),
  }
}

function rate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null
  return Math.round((numerator / denominator) * 100)
}

// ── 항목별 결과 ─────────────────────────────────────────────────────────────

/** 출결·지각 */
export type LatenessItem = {
  recorded: boolean
  status: string | null
  statusLabel: string
  lateMinutes: number | null
  checkInTime: string | null
  checkOutTime: string | null
  /** 판정 기준이 된 수업 시작 시각 */
  scheduledStart: string | null
}

/** 학습지 한 장의 결과 */
export type WorksheetLine = {
  distributionId: string
  title: string
  step: string
  problemCount: number
  submittedCount: number
  correctProblems: number
  /** 푼 만큼 기준 정답률 */
  accuracy: number | null
  /** 낸 문항 ÷ 전체 문항 */
  completion: number | null
}

/** 학습지 묶음(숙제·오답클리닉·단원평가) 공통 집계 */
export type WorksheetGroup = {
  count: number
  problemCount: number
  submittedCount: number
  correctProblems: number
  /** 완성도 — 얼마나 풀었나 */
  completion: number | null
  /** 점수 — 푼 것 중 얼마나 맞았나. 완성도와 다른 수다 */
  accuracy: number | null
  lines: WorksheetLine[]
}

/** 목표 완성률 — 그날 배정·채점된 학습지에서 얼마나 냈나 */
export type GoalRateItem = {
  assignedProblems: number
  submittedProblems: number
  rate: number | null
}

export type DailyStudentReport = {
  studentId: string
  studentName: string
  grade: string
  date: string
  /** 그날 수업 — 여러 선생님 수업이 하나로 합쳐져 있다 */
  classes: DailyClassPlan
  lateness: LatenessItem
  homework: WorksheetGroup
  clinic: WorksheetGroup
  exam: WorksheetGroup
  goalRate: GoalRateItem
  /** 선생님이 그날 직접 적는 값 (당일 오버라이드에서 온다) */
  attitude: string | null
  comment: string | null
  /** 그날 기록이 하나라도 있는가 */
  hasAnything: boolean
}

const EMPTY_GROUP: WorksheetGroup = {
  count: 0, problemCount: 0, submittedCount: 0, correctProblems: 0,
  completion: null, accuracy: null, lines: [],
}

function statusLabel(status: string | null, lateMinutes: number | null): string {
  if (status === 'LATE') {
    if (!lateMinutes) return '지각'
    return lateMinutes >= 60 ? '60분 이상 지각' : `${lateMinutes}분 지각`
  }
  if (status === 'ABSENT') return '결석'
  if (status === 'EXCUSED') return '사유결석'
  if (status === 'MAKEUP') return '보강'
  if (status) return '정상'
  return '기록 없음'
}

/** 학습지 결과 행들을 묶음 집계로 */
function toGroup(lines: WorksheetLine[]): WorksheetGroup {
  if (lines.length === 0) return { ...EMPTY_GROUP, lines: [] }
  const problemCount = lines.reduce((s, l) => s + l.problemCount, 0)
  const submittedCount = lines.reduce((s, l) => s + l.submittedCount, 0)
  const correctProblems = lines.reduce((s, l) => s + l.correctProblems, 0)
  return {
    count: lines.length,
    problemCount,
    submittedCount,
    correctProblems,
    completion: rate(submittedCount, problemCount),
    accuracy: rate(correctProblems, submittedCount),
    lines,
  }
}

/**
 * 한 학생의 하루치 학습리포트.
 *
 * 그날 수업이 여러 개여도(선생님이 달라도) 숫자는 하나로 합쳐진다 —
 * 숙제·학습지 결과가 모두 날짜 단위라 자연히 합산된다.
 *
 * extras 는 선생님이 그날 직접 적은 값(수업 태도·코멘트)이다. 데이터로 뽑을 수
 * 없으므로 호출부가 reportOptions 에서 읽어 넘긴다.
 */
export async function buildDailyStudentReport(
  studentId: string,
  date: string,
  extras: { attitude?: string | null; comment?: string | null } = {}
): Promise<DailyStudentReport | null> {
  const range = dayRange(date)
  if (!range) return null

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, grade: true, user: { select: { name: true } } },
  })
  if (!student) return null

  const [classes, log, distributions] = await Promise.all([
    getStudentDayClasses(studentId, date),

    prisma.attendanceLog.findFirst({ where: { studentId, date } }),

    // 그날 배포됐거나 그날 채점된 학습지.
    // 채점된 것만 보면 목표 완성률의 분모(오늘 낸 숙제)가 빠지고,
    // 배포된 것만 보면 어제 낸 숙제를 오늘 채점한 건이 빠진다.
    prisma.worksheetDistribution.findMany({
      where: {
        studentId,
        OR: [
          { distributedAt: { gte: range.start, lt: range.end } },
          { result: { submittedAt: { gte: range.start, lt: range.end } } },
        ],
      },
      select: {
        id: true,
        homeworkAt: true,
        worksheet: { select: { title: true, step: true, problemCount: true } },
        result: { select: { correctProblems: true, submittedCount: true, submittedAt: true } },
      },
    }),
  ])

  // ── 출결·지각 ──
  const lateness: LatenessItem = {
    recorded: log != null,
    status: log?.status ?? null,
    statusLabel: statusLabel(log?.status ?? null, log?.lateMinutes ?? null),
    lateMinutes: log?.lateMinutes ?? null,
    checkInTime: log?.checkInTime ? formatTimeKorean(log.checkInTime) : null,
    checkOutTime: log?.checkOutTime ? formatTimeKorean(log.checkOutTime) : null,
    scheduledStart: classes.blocks[0]?.startTime ?? null,
  }

  // ── 학습지 가르기 ──
  const gradedToday = (d: (typeof distributions)[number]) => {
    const at = d.result?.submittedAt
    return at != null && at >= range.start && at < range.end
  }

  const toLine = (d: (typeof distributions)[number]): WorksheetLine => {
    const submitted = d.result?.submittedCount ?? 0
    const correct = d.result?.correctProblems ?? 0
    return {
      distributionId: d.id,
      title: d.worksheet.title,
      step: d.worksheet.step,
      problemCount: d.worksheet.problemCount,
      submittedCount: submitted,
      correctProblems: correct,
      accuracy: rate(correct, submitted),
      completion: rate(submitted, d.worksheet.problemCount),
    }
  }

  const homeworkLines: WorksheetLine[] = []
  const clinicLines: WorksheetLine[] = []
  const examLines: WorksheetLine[] = []

  for (const d of distributions) {
    if (!gradedToday(d)) continue
    const line = toLine(d)
    // 숙제 지정 여부와 단계는 배타적이지 않다. 숙제로 낸 오답클리닉이면 양쪽에
    // 모두 들어가는 것이 맞다 — 학부모는 "숙제를 했는가"와 "오답을 정리했는가"를
    // 각각 알고 싶어 한다.
    if (d.homeworkAt) homeworkLines.push(line)
    if (CLINIC_STEPS.includes(line.step)) clinicLines.push(line)
    if (EXAM_STEPS_FOR_REPORT.includes(line.step)) examLines.push(line)
  }

  // ── 목표 완성률 — 그날 걸린 학습지 전체가 분모 ──
  const assignedProblems = distributions.reduce((s, d) => s + d.worksheet.problemCount, 0)
  const submittedProblems = distributions.reduce((s, d) => s + (d.result?.submittedCount ?? 0), 0)
  const goalRate: GoalRateItem = {
    assignedProblems,
    submittedProblems,
    rate: rate(submittedProblems, assignedProblems),
  }

  const homework = toGroup(homeworkLines)
  const clinic = toGroup(clinicLines)
  const exam = toGroup(examLines)

  return {
    studentId: student.id,
    studentName: student.user.name,
    grade: student.grade ?? '',
    date,
    classes,
    lateness,
    homework,
    clinic,
    exam,
    goalRate,
    attitude: extras.attitude ?? null,
    comment: extras.comment ?? null,
    hasAnything:
      lateness.recorded || homework.count > 0 ||
      clinic.count > 0 || exam.count > 0 || classes.classes.length > 0,
  }
}

// ── 알림톡 문구 ─────────────────────────────────────────────────────────────

function pct(v: number | null): string {
  return v == null ? '-' : `${v}%`
}

/**
 * 하루치 리포트를 알림톡 본문으로.
 *
 * 그날 수업이 여러 개여도 한 통이다 — 숫자는 이미 합산돼 있다.
 * 켜진 항목이라도 그날 기록이 없으면 줄을 넣지 않는다. 빈 항목을 "0건"으로
 * 채우면 학부모가 매일 같은 껍데기를 받게 된다.
 */
export function formatDailyReportMessage(
  report: DailyStudentReport,
  items: ReportItems = DEFAULT_ITEMS
): string {
  const [, m, d] = report.date.split('-')
  const lines: string[] = [
    '[InLevMath 학습리포트]',
    `${report.studentName} 학생 ${Number(m)}월 ${Number(d)}일 학습 안내입니다.`,
  ]

  if (report.classes.classes.length > 0) {
    lines.push('', '■ 오늘 수업', describeClasses(report.classes))
  }

  if (items.includeAttendance && report.lateness.recorded) {
    const times = [
      report.lateness.checkInTime && `등원 ${report.lateness.checkInTime}`,
      report.lateness.checkOutTime && `하원 ${report.lateness.checkOutTime}`,
    ].filter(Boolean).join(' / ')
    lines.push('', '■ 출결', [report.lateness.statusLabel, times].filter(Boolean).join(' · '))
  }

  if (items.includeHomework && report.homework.count > 0) {
    const g = report.homework
    lines.push('', '■ 숙제',
      `${g.count}건 · 완성도 ${pct(g.completion)} (${g.submittedCount}/${g.problemCount}문항) · 정답률 ${pct(g.accuracy)}`)
  }

  if (items.includeWorksheet && report.clinic.count > 0) {
    const g = report.clinic
    lines.push('', '■ 오답 클리닉',
      `${g.count}건 · ${g.submittedCount}문항 중 ${g.correctProblems}문항 정답 (정답률 ${pct(g.accuracy)})`)
  }

  if (items.includeUnitExam && report.exam.count > 0) {
    const g = report.exam
    lines.push('', '■ 단원평가·모의고사',
      `${g.count}건 · 정답률 ${pct(g.accuracy)} (${g.correctProblems}/${g.submittedCount}문항)`)
  }

  if (items.includeGoalRate && report.goalRate.rate != null) {
    const g = report.goalRate
    lines.push('', '■ 목표 완성률',
      `${pct(g.rate)} (${g.submittedProblems}/${g.assignedProblems}문항)`)
  }

  if (items.includeAttitude && report.attitude) {
    lines.push('', '■ 수업 태도', report.attitude)
  }

  if (items.includeComment && report.comment) {
    lines.push('', '■ 선생님 코멘트', report.comment)
  }

  return lines.join('\n')
}

/** 화면 목록의 한 줄 요약 */
export function summarizeReport(report: DailyStudentReport, items: ReportItems = DEFAULT_ITEMS): string {
  return [
    report.classes.classes.length > 0 && `수업 ${report.classes.classes.length}개`,
    items.includeAttendance && report.lateness.checkInTime && `등원 ${report.lateness.checkInTime}`,
    items.includeAttendance && report.lateness.checkOutTime && `하원 ${report.lateness.checkOutTime}`,
    items.includeHomework && report.homework.count > 0 && `숙제 ${report.homework.count}건`,
    items.includeWorksheet && report.clinic.count > 0 && `오답 ${report.clinic.count}건`,
    items.includeUnitExam && report.exam.count > 0 && `평가 ${report.exam.count}건`,
    report.lateness.recorded && report.lateness.statusLabel,
  ].filter(Boolean).join(' · ')
}
