// apps/web/src/lib/kakaoReportDispatcher.ts
//
// 학생 1명의 하루치 학습리포트를 학부모에게 보낸다.
//
// ⚠️ 발송 결과를 절대 낙관적으로 처리하지 않는다. 비즈엠이 success 를 준
// 경우에만 SUCCESS 로 기록한다. 과거 Mock 모드가 가짜 성공을 남겨 학부모에게
// 가지 않은 알림을 "발송완료"로 표시한 사고가 있었다.
//
// 하원 자동 발송(dispatchOnCheckOut)은 선생님이 프리셋에서 켰을 때만 동작하고,
// 같은 날 같은 학생에게 두 번 보내지 않는다.

import { prisma } from './db'
import { sendKakaoAlimtalk } from './kakaoBizmsg'
import { buildDailyStudentReport, formatDailyReportMessage } from './dailyReportAggregator'
import { resolveReportOptions, getTeacherPreset } from './reportOptions'

export const DAILY_REPORT_TEMPLATE = 'INLEV_DAILY_REPORT'
const TITLE = '[InLevMath] 일일 학습리포트'

export type DispatchResult = {
  studentId: string
  studentName: string
  sent: boolean
  /** 보낼 것이 없어 건너뛴 경우의 사유. 실패와 구분한다 */
  skipped?: 'NO_DATA' | 'NO_PARENT_PHONE' | 'ALREADY_SENT' | 'AUTO_SEND_OFF' | 'NO_STUDENT'
  error?: string
  logId?: string
}

/** 그날 이 학생에게 리포트가 이미 나갔는지 (성공 건만 센다) */
export async function alreadySentToday(studentName: string, date: string): Promise<boolean> {
  const [y, m, d] = date.split('-').map(Number)
  if (!y || !m || !d) return false

  const existing = await prisma.alimtalkSendLog.findFirst({
    where: {
      studentName,
      templateCode: DAILY_REPORT_TEMPLATE,
      status: 'SUCCESS',
      sentAt: { gte: new Date(y, m - 1, d), lt: new Date(y, m - 1, d + 1) },
    },
    select: { id: true },
  })
  return existing != null
}

/**
 * 하루치 학습리포트 발송.
 *
 * teacherId 는 어떤 프리셋을 쓸지 고르는 데만 쓴다 — 리포트 내용 자체는
 * 선생님을 가리지 않는다 (학생이 여러 선생님 수업을 들을 수 있다).
 */
export async function sendDailyReport(params: {
  teacherId: string
  studentId: string
  date: string
  /** 이미 보냈어도 다시 보낸다 (선생님이 화면에서 직접 누른 경우) */
  force?: boolean
}): Promise<DispatchResult> {
  const { teacherId, studentId, date, force } = params

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, parentPhone: true, user: { select: { name: true, phone: true } } },
  })
  if (!student) {
    return { studentId, studentName: '', sent: false, skipped: 'NO_STUDENT' }
  }

  const studentName = student.user.name
  const parentPhone = student.parentPhone || student.user.phone || ''

  if (!parentPhone) {
    return { studentId, studentName, sent: false, skipped: 'NO_PARENT_PHONE' }
  }
  if (!force && (await alreadySentToday(studentName, date))) {
    return { studentId, studentName, sent: false, skipped: 'ALREADY_SENT' }
  }

  const options = await resolveReportOptions(teacherId, studentId, date)
  const report = await buildDailyStudentReport(studentId, date, {
    attitude: options.attitude,
    comment: options.comment,
  })
  if (!report || !report.hasAnything) {
    return { studentId, studentName, sent: false, skipped: 'NO_DATA' }
  }

  const message = formatDailyReportMessage(report, options.items)

  const result = await sendKakaoAlimtalk({
    templateCode: DAILY_REPORT_TEMPLATE,
    recipientPhone: parentPhone,
    message,
    variables: {
      studentName,
      date,
      academyName: 'InLevMath 학원',
    },
  })

  const digits = parentPhone.replace(/[^0-9]/g, '')
  const log = await prisma.alimtalkSendLog.create({
    data: {
      studentName,
      parentPhone: digits,
      receiverPhone: digits,
      sendChannel: 'ALIMTALK',
      messageType: 'AT',
      templateCode: DAILY_REPORT_TEMPLATE,
      messageTitle: TITLE,
      sentMessageText: message,
      messageBody: message,
      includedOptions: { date, items: options.items, source: options.source },
      // 비즈엠이 success 를 준 경우에만 성공이다
      status: result.success ? 'SUCCESS' : 'FAILED',
      statusCode: result.success ? 'SUCCESS' : 'FAIL',
      responseCode: result.success ? 'success' : result.error || 'SEND_FAILED',
      responseMessage: result.success ? '발송 완료' : result.errorMessage || '발송 실패',
      bizmsgMsgId: result.messageId ?? undefined,
    },
  })

  return {
    studentId,
    studentName,
    sent: result.success,
    error: result.success ? undefined : result.errorMessage,
    logId: log.id,
  }
}

/**
 * 하원 처리 직후 자동 발송.
 *
 * 선생님이 프리셋에서 켰을 때만 보낸다. 기본은 꺼짐 — 켜지 않은 학원에서
 * 하원 버튼 한 번에 학부모 전원에게 문자가 나가면 안 된다.
 *
 * 실패해도 하원 처리 자체를 되돌리지 않는다. 등·하원 기록이 알림톡 사정으로
 * 사라지는 편이 훨씬 나쁘다.
 */
export async function dispatchOnCheckOut(params: {
  teacherId: string | null
  studentId: string
  date: string
}): Promise<DispatchResult | null> {
  const { teacherId, studentId, date } = params
  if (!teacherId) return null

  try {
    const preset = await getTeacherPreset(teacherId)
    if (!preset.autoSendOnCheckOut) {
      return { studentId, studentName: '', sent: false, skipped: 'AUTO_SEND_OFF' }
    }
    return await sendDailyReport({ teacherId, studentId, date })
  } catch (e) {
    console.error('[dailyReport] 하원 자동 발송 실패:', e instanceof Error ? e.message : e)
    return null
  }
}
