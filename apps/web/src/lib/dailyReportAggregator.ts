// apps/web/src/lib/dailyReportAggregator.ts
//
// 하원 학습리포트의 5대 항목을 하루 단위로 집계한다.
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
// 숙제·교재·오답클리닉 숫자도 그날 전체를 합한 값이어야 한다.
// 그날 수업 목록은 dailyClasses 가, 학습 데이터는 여기서 날짜로 모은다.

import { prisma } from './db'
import { getStudentDayClasses, describeClasses, type DailyClassPlan } from './dailyClasses'
import { formatTimeKorean } from './attendanceService'

/** ④ 오답 클리닉으로 볼 학습지 단계 */
export const CLINIC_STEPS = ['최다오답', '오답유형', '취약유형']

/** ⑤ 단원평가·모의고사로 볼 학습지 단계 */
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

/** ① 지각 */
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

/** 학습지 묶음(②숙제 ④오답클리닉 ⑤단원평가) 공통 집계 */
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

/** ③ 교재 한 권의 결과 */
export type TextbookLine = {
  textbookId: string
  title: string
  submittedCount: number
  wrongCount: number
  accuracy: number | null
}

export type TextbookGroup = {
  count: number
  submittedCount: number
  wrongCount: number
  /** 분모는 배정 전체가 아니라 그날 낸 문항 수 */
  accuracy: number | null
  lines: TextbookLine[]
}

export type DailyStudentReport = {
  studentId: string
  studentName: string
  grade: string
  date: string
  /** 그날 수업 — 여러 선생님 수업이 하나로 합쳐져 있다 */
  classes: DailyClassPlan
  lateness: LatenessItem      // ①
  homework: WorksheetGroup    // ②
  textbook: TextbookGroup     // ③
  clinic: WorksheetGroup      // ④
  exam: WorksheetGroup        // ⑤
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
 * 숙제·교재·학습지 결과가 모두 날짜 단위라 자연히 합산된다.
 */
export async function buildDailyStudentReport(
  studentId: string,
  date: string
): Promise<DailyStudentReport | null> {
  const range = dayRange(date)
  if (!range) return null

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, grade: true, user: { select: { name: true } } },
  })
  if (!student) return null

  const [classes, log, distributions, textbookResults] = await Promise.all([
    getStudentDayClasses(studentId, date),

    prisma.attendanceLog.findFirst({ where: { studentId, date } }),

    // 그날 채점된 학습지 — 숙제·오답클리닉·단원평가를 한 번에 읽고 나중에 가른다
    prisma.worksheetDistribution.findMany({
      where: {
        studentId,
        result: { submittedAt: { gte: range.start, lt: range.end } },
      },
      select: {
        id: true,
        homeworkAt: true,
        worksheet: { select: { title: true, step: true, problemCount: true } },
        result: { select: { correctProblems: true, submittedCount: true } },
      },
    }),

    prisma.textbookResult.findMany({
      where: { studentId, submittedAt: { gte: range.start, lt: range.end } },
      select: {
        textbookId: true,
        submittedCount: true,
        wrongProblemsJson: true,
        textbook: { select: { title: true } },
      },
    }),
  ])

  // ── ① 지각 ──
  const lateness: LatenessItem = {
    recorded: log != null,
    status: log?.status ?? null,
    statusLabel: statusLabel(log?.status ?? null, log?.lateMinutes ?? null),
    lateMinutes: log?.lateMinutes ?? null,
    checkInTime: log?.checkInTime ? formatTimeKorean(log.checkInTime) : null,
    checkOutTime: log?.checkOutTime ? formatTimeKorean(log.checkOutTime) : null,
    scheduledStart: classes.blocks[0]?.startTime ?? null,
  }

  // ── ②④⑤ 학습지 가르기 ──
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
    const line = toLine(d)
    // 숙제 지정 여부와 단계는 배타적이지 않다. 숙제로 낸 오답클리닉이면 양쪽에
    // 모두 들어가는 것이 맞다 — 학부모는 "숙제를 했는가"와 "오답을 정리했는가"를
    // 각각 알고 싶어 한다.
    if (d.homeworkAt) homeworkLines.push(line)
    if (CLINIC_STEPS.includes(line.step)) clinicLines.push(line)
    if (EXAM_STEPS_FOR_REPORT.includes(line.step)) examLines.push(line)
  }

  // ── ③ 교재 ──
  const textbookLines: TextbookLine[] = textbookResults.map(r => {
    let wrong = 0
    try {
      const parsed = JSON.parse(r.wrongProblemsJson)
      wrong = Array.isArray(parsed) ? parsed.length : 0
    } catch {
      wrong = 0
    }
    return {
      textbookId: r.textbookId,
      title: r.textbook.title,
      submittedCount: r.submittedCount,
      wrongCount: wrong,
      accuracy: rate(r.submittedCount - wrong, r.submittedCount),
    }
  })

  const tbSubmitted = textbookLines.reduce((s, l) => s + l.submittedCount, 0)
  const tbWrong = textbookLines.reduce((s, l) => s + l.wrongCount, 0)
  const textbook: TextbookGroup = {
    count: textbookLines.length,
    submittedCount: tbSubmitted,
    wrongCount: tbWrong,
    accuracy: rate(tbSubmitted - tbWrong, tbSubmitted),
    lines: textbookLines,
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
    textbook,
    clinic,
    exam,
    hasAnything:
      lateness.recorded || homework.count > 0 || textbook.count > 0 ||
      clinic.count > 0 || exam.count > 0 || classes.classes.length > 0,
  }
}

// ── 알림톡 문구 ─────────────────────────────────────────────────────────────

/** 선생님이 켠 항목만 골라 담는다 (기본값: 전부) */
export type ReportOptions = {
  classes?: boolean
  lateness?: boolean
  homework?: boolean
  textbook?: boolean
  clinic?: boolean
  exam?: boolean
}

const ALL_ON: Required<ReportOptions> = {
  classes: true, lateness: true, homework: true, textbook: true, clinic: true, exam: true,
}

function pct(v: number | null): string {
  return v == null ? '-' : `${v}%`
}

/**
 * 하루치 리포트를 알림톡 본문으로.
 * 그날 수업이 여러 개여도 한 통이다 — 숫자는 이미 합산돼 있다.
 */
export function formatDailyReportMessage(
  report: DailyStudentReport,
  options: ReportOptions = {}
): string {
  const on = { ...ALL_ON, ...options }
  const [, m, d] = report.date.split('-')
  const lines: string[] = [
    '[InLevMath 학습리포트]',
    `${report.studentName} 학생 ${Number(m)}월 ${Number(d)}일 학습 안내입니다.`,
  ]

  if (on.classes && report.classes.classes.length > 0) {
    lines.push('', '■ 오늘 수업', describeClasses(report.classes))
  }

  if (on.lateness && report.lateness.recorded) {
    const times = [
      report.lateness.checkInTime && `등원 ${report.lateness.checkInTime}`,
      report.lateness.checkOutTime && `하원 ${report.lateness.checkOutTime}`,
    ].filter(Boolean).join(' / ')
    lines.push('', '■ 출결', [report.lateness.statusLabel, times].filter(Boolean).join(' · '))
  }

  if (on.homework && report.homework.count > 0) {
    const g = report.homework
    lines.push('', '■ 숙제',
      `${g.count}건 · 완성도 ${pct(g.completion)} (${g.submittedCount}/${g.problemCount}문항) · 정답률 ${pct(g.accuracy)}`)
  }

  if (on.textbook && report.textbook.count > 0) {
    const g = report.textbook
    lines.push('', '■ 교재',
      `${g.count}권 · ${g.submittedCount}문항 중 ${g.submittedCount - g.wrongCount}문항 정답 (정답률 ${pct(g.accuracy)})`)
  }

  if (on.clinic && report.clinic.count > 0) {
    const g = report.clinic
    lines.push('', '■ 오답 클리닉',
      `${g.count}건 · ${g.submittedCount}문항 중 ${g.correctProblems}문항 정답 (정답률 ${pct(g.accuracy)})`)
  }

  if (on.exam && report.exam.count > 0) {
    const g = report.exam
    lines.push('', '■ 단원평가·모의고사',
      `${g.count}건 · 정답률 ${pct(g.accuracy)} (${g.correctProblems}/${g.submittedCount}문항)`)
  }

  return lines.join('\n')
}
