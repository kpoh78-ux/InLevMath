// apps/web/src/lib/attendanceReport.ts
//
// 출결 결과를 학부모 알림톡으로 보내기 위한 리포트 구성 + 발송.
//
// ⚠️ 카카오 비즈엠이 아직 연동되지 않았으므로 실제로는 발송되지 않는다.
// sendKakaoAlimtalk()이 NOT_CONFIGURED 실패를 돌려주고, 그 결과를 그대로
// AlimtalkSendLog에 남긴다. 절대 낙관적으로 성공 처리하지 않는다.

import { prisma } from '@/lib/db';
import { sendKakaoAlimtalk } from '@/lib/kakaoBizmsg';
import { formatTimeKorean } from '@/lib/attendanceService';

export type ReportScope = 'DAILY' | 'MONTHLY';

export const ATTENDANCE_TEMPLATE = {
  DAILY: 'INLEV_ATTEND_DAILY',
  MONTHLY: 'INLEV_ATTEND_MONTHLY',
} as const;

export interface AttendanceReportRow {
  studentId: string;
  studentName: string;
  grade: string;
  parentPhone: string;
  /** 정상 | 지각 | 결석 | 보강 (월별은 요약 라벨) */
  statusLabel: string;
  /** 화면 미리보기용 한 줄 요약 */
  detail: string;
  /** 실제 발송 문구 */
  message: string;
  /** 학부모 연락처가 없으면 발송할 수 없다 */
  sendable: boolean;
}

export interface SendReportResult {
  studentId: string;
  studentName: string;
  success: boolean;
  error?: string;
  logId?: string;
}

export function attendanceStatusLabel(status: string): string {
  if (status === 'LATE') return '지각';
  if (status === 'ABSENT') return '결석';
  if (status === 'EXCUSED') return '사유결석';
  if (status === 'MAKEUP') return '보강';
  return '정상';
}

function monthPrefix(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function formatDateKorean(date: string): string {
  const [y, m, d] = date.split('-');
  return `${y}년 ${Number(m)}월 ${Number(d)}일`;
}

/** 리포트 대상 학생 (재원생만) */
async function activeStudents(teacherId: string) {
  return prisma.student.findMany({
    where: { teacherId, status: 'active' },
    select: {
      id: true,
      grade: true,
      parentPhone: true,
      user: { select: { name: true, phone: true } },
    },
  });
}

/** 하루치 출결 리포트 — 그날 출결 기록이 있는 학생만 대상 */
export async function buildDailyReport(teacherId: string, date: string): Promise<AttendanceReportRow[]> {
  const students = await activeStudents(teacherId);
  const studentIds = students.map((s) => s.id);

  const logs = await prisma.attendanceLog.findMany({
    where: { studentId: { in: studentIds }, date },
  });

  const logByStudent = new Map(logs.map((l) => [l.studentId, l]));

  return students
    .filter((s) => logByStudent.has(s.id))
    .map((s) => {
      const log = logByStudent.get(s.id)!;
      const name = s.user.name;
      const label = attendanceStatusLabel(log.status);
      const parentPhone = s.parentPhone || s.user.phone || '';

      const checkIn = log.checkInTime ? formatTimeKorean(log.checkInTime) : '';
      const checkOut = log.checkOutTime ? formatTimeKorean(log.checkOutTime) : '';

      let detail: string;
      let message: string;

      if (log.status === 'ABSENT' || log.status === 'EXCUSED') {
        detail = label;
        message = `[InLevMath 출결안내]\n${name} 학생이 ${formatDateKorean(date)} ${label} 처리되었습니다.\n\n문의사항은 학원으로 연락 주시기 바랍니다.`;
      } else {
        detail = [checkIn && `등원 ${checkIn}`, checkOut && `하원 ${checkOut}`, label].filter(Boolean).join(' · ');
        const timeLine = [checkIn && `등원 ${checkIn}`, checkOut && `하원 ${checkOut}`].filter(Boolean).join(' / ');
        message =
          `[InLevMath 출결안내]\n${name} 학생 ${formatDateKorean(date)} 출결 안내입니다.\n` +
          (timeLine ? `${timeLine}\n` : '') +
          `상태: ${label}`;
      }

      return {
        studentId: s.id,
        studentName: name,
        grade: s.grade || '',
        parentPhone,
        statusLabel: label,
        detail,
        message,
        sendable: Boolean(parentPhone),
      };
    })
    .sort((a, b) => a.studentName.localeCompare(b.studentName, 'ko'));
}

/** 한 달치 출결 요약 리포트 — 그달 출결 기록이 하나라도 있는 학생만 대상 */
export async function buildMonthlyReport(
  teacherId: string,
  year: number,
  month: number
): Promise<AttendanceReportRow[]> {
  const students = await activeStudents(teacherId);
  const studentIds = students.map((s) => s.id);

  const logs = await prisma.attendanceLog.findMany({
    where: { studentId: { in: studentIds }, date: { startsWith: monthPrefix(year, month) } },
  });

  const byStudent = new Map<string, typeof logs>();
  logs.forEach((l) => {
    if (!byStudent.has(l.studentId)) byStudent.set(l.studentId, []);
    byStudent.get(l.studentId)!.push(l);
  });

  return students
    .filter((s) => byStudent.has(s.id))
    .map((s) => {
      const list = byStudent.get(s.id)!;
      const name = s.user.name;
      const parentPhone = s.parentPhone || s.user.phone || '';

      const checkIns = list.filter((l) => l.checkInTime).length;
      const checkOuts = list.filter((l) => l.checkOutTime).length;
      const late = list.filter((l) => l.status === 'LATE').length;
      const absents = list.filter((l) => l.status === 'ABSENT' || l.status === 'EXCUSED').length;
      const scheduled = checkIns + absents;
      const rate = scheduled > 0 ? Math.round((checkIns / scheduled) * 100) : 100;

      const detail = `등원 ${checkIns} · 지각 ${late} · 결석 ${absents} · 출석률 ${rate}%`;
      const message =
        `[InLevMath 월간 출결]\n${name} 학생 ${year}년 ${month}월 출결 요약입니다.\n` +
        `등원 ${checkIns}회 / 하원 ${checkOuts}회\n` +
        `지각 ${late}회 / 결석 ${absents}회\n` +
        `출석률 ${rate}%`;

      return {
        studentId: s.id,
        studentName: name,
        grade: s.grade || '',
        parentPhone,
        statusLabel: `출석률 ${rate}%`,
        detail,
        message,
        sendable: Boolean(parentPhone),
      };
    })
    .sort((a, b) => a.studentName.localeCompare(b.studentName, 'ko'));
}

export async function buildAttendanceReport(params: {
  teacherId: string;
  scope: ReportScope;
  date?: string;
  year?: number;
  month?: number;
}): Promise<AttendanceReportRow[]> {
  const { teacherId, scope, date, year, month } = params;

  if (scope === 'DAILY') {
    if (!date) throw new Error('날짜가 필요합니다.');
    return buildDailyReport(teacherId, date);
  }

  if (!year || !month) throw new Error('연도와 월이 필요합니다.');
  return buildMonthlyReport(teacherId, year, month);
}

/**
 * 리포트를 학부모에게 발송하고 결과를 AlimtalkSendLog에 남긴다.
 * 비즈엠 미연동 상태에서는 전부 실패(NOT_CONFIGURED)로 기록된다.
 */
export async function sendAttendanceReport(
  rows: AttendanceReportRow[],
  scope: ReportScope
): Promise<SendReportResult[]> {
  const templateCode = ATTENDANCE_TEMPLATE[scope];
  const title = scope === 'DAILY' ? '[InLevMath] 일별 출결 안내' : '[InLevMath] 월간 출결 요약';
  const results: SendReportResult[] = [];

  for (const row of rows) {
    if (!row.sendable) {
      results.push({
        studentId: row.studentId,
        studentName: row.studentName,
        success: false,
        error: '학부모 연락처가 등록되어 있지 않습니다.',
      });
      continue;
    }

    const sendResult = await sendKakaoAlimtalk({
      templateCode,
      recipientPhone: row.parentPhone,
      message: row.message,
      variables: {
        studentName: row.studentName,
        academyName: 'InLevMath 학원',
      },
    });

    const log = await prisma.alimtalkSendLog.create({
      data: {
        studentName: row.studentName,
        parentPhone: row.parentPhone.replace(/[^0-9]/g, ''),
        receiverPhone: row.parentPhone.replace(/[^0-9]/g, ''),
        sendChannel: 'ALIMTALK',
        messageType: 'AT',
        templateCode,
        messageTitle: title,
        sentMessageText: row.message,
        messageBody: row.message,
        includedOptions: { scope },
        status: sendResult.success ? 'SUCCESS' : 'FAILED',
        statusCode: sendResult.success ? 'SUCCESS' : 'FAIL',
        responseCode: sendResult.success ? 'success' : sendResult.error || 'SEND_FAILED',
        responseMessage: sendResult.success ? '발송 완료' : sendResult.errorMessage || '발송 실패',
        bizmsgMsgId: sendResult.messageId ?? undefined,
      },
    });

    results.push({
      studentId: row.studentId,
      studentName: row.studentName,
      success: sendResult.success,
      error: sendResult.success ? undefined : sendResult.errorMessage,
      logId: log.id,
    });
  }

  return results;
}
