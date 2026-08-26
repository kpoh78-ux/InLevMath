// apps/web/src/lib/attendanceService.ts
import { prisma } from '@/lib/db';
import { broadcastToTeacher, broadcastToAll } from '@/lib/sse';
import { sendKakaoAlimtalk } from '@/lib/kakaoBizmsg';

export interface KioskCheckResult {
  studentName: string;
  grade: string;
  type: 'CHECK_IN' | 'NEED_CHECK_OUT' | 'CHECK_OUT';
  checkInTime?: string;
  checkOutTime?: string;
  parentPhoneMasked: string;
  alimtalkSent: boolean;
}

export type AttendanceResponse = {
  studentId: string;
  studentName: string;
  grade: string;
  type: 'CHECK_IN' | 'NEED_CHECK_OUT' | 'CHECK_OUT' | 'ALREADY_CHECKED_OUT' | 'ERROR';
  checkInTime?: string;
  checkOutTime?: string;
  parentPhoneMasked: string;
  alimtalkSent: boolean;
  message?: string;
};

export function maskPhoneNumber(phone: string): string {
  const clean = phone.replace(/[^0-9]/g, '');
  if (clean.length === 11) {
    return `${clean.slice(0, 3)}-****-${clean.slice(7)}`;
  }
  if (clean.length === 10) {
    return `${clean.slice(0, 3)}-***-${clean.slice(6)}`;
  }
  if (clean.length >= 4) {
    return `***-****-${clean.slice(-4)}`;
  }
  return '***-****-****';
}

export function formatTimeKorean(date: Date = new Date()): string {
  return date.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * 사용자가 고른 출결 시각을 해당 날짜의 Date로 변환한다.
 * "HH:mm"(input[type=time]) / "오전 hh : mm" 두 형식을 모두 받는다.
 * 형식이 맞지 않으면 null (호출부에서 현재 시각으로 대체)
 */
/** 사용자 입력 오류(400으로 응답할 값) */
export const CHECKOUT_BEFORE_CHECKIN = '하원 시간은 등원 시간보다 빠를 수 없습니다.';
export const ATTENDANCE_RECORD_NOT_FOUND = '삭제할 출결 기록이 없습니다.';

export function parseAttendanceTime(dateStr: string, time?: string | null): Date | null {
  if (!time) return null;
  const trimmed = String(time).trim();

  let hour: number | null = null;
  let minute: number | null = null;

  const korean = /^(오전|오후)\s*(\d{1,2})\s*:\s*(\d{1,2})$/.exec(trimmed);
  const h24 = /^(\d{1,2})\s*:\s*(\d{1,2})$/.exec(trimmed);

  if (korean) {
    const base = Number(korean[2]) % 12;
    hour = korean[1] === '오후' ? base + 12 : base;
    minute = Number(korean[3]);
  } else if (h24) {
    hour = Number(h24[1]);
    minute = Number(h24[2]);
  }

  if (hour === null || minute === null || hour > 23 || minute > 59) return null;

  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return null;

  const dt = new Date(y, m - 1, d, hour, minute, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export function getTodayDateString(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export class AttendanceService {
  /**
   * 키오스크 4자리 PIN 입력 처리
   */
  static async handleKioskPin(pin: string, teacherId?: string): Promise<KioskCheckResult> {
    const res = await handleKioskPin(pin, teacherId);
    if (res.type === 'ERROR') {
      throw new Error(res.message || '일치하는 학생 정보를 찾을 수 없습니다.');
    }
    return {
      studentName: res.studentName,
      grade: res.grade,
      type: res.type === 'ALREADY_CHECKED_OUT' ? 'CHECK_OUT' : res.type,
      checkInTime: res.checkInTime,
      checkOutTime: res.checkOutTime,
      parentPhoneMasked: res.parentPhoneMasked,
      alimtalkSent: res.alimtalkSent,
    };
  }

  /**
   * 키오스크 [퇴원하기] 확정 처리
   */
  static async confirmCheckOut(pinOrPayload: string | { pin?: string; studentId?: string }, teacherId?: string): Promise<KioskCheckResult> {
    const res = await confirmCheckOut(pinOrPayload, teacherId);
    if (res.type === 'ERROR') {
      throw new Error(res.message || '학생을 찾을 수 없습니다.');
    }
    return {
      studentName: res.studentName,
      grade: res.grade,
      type: 'CHECK_OUT',
      checkInTime: res.checkInTime,
      checkOutTime: res.checkOutTime,
      parentPhoneMasked: res.parentPhoneMasked,
      alimtalkSent: res.alimtalkSent,
    };
  }
}

// ── 4자리 PIN으로 학생 조회 (1순위: attendancePin, 2순위: 전화번호 끝 4자리) ──
export async function findStudentByPin(pin: string, teacherId?: string) {
  const cleanPin = pin.trim();
  if (!cleanPin || cleanPin.length !== 4) return null;

  // 1. 커스텀 지정된 attendancePin 우선 매칭 (재원생 우선)
  let student = await prisma.student.findFirst({
    where: {
      attendancePin: cleanPin,
      status: { in: ['active', 'ENROLLED'] },
      ...(teacherId ? { teacherId } : {}),
    },
    include: {
      user: true,
      teacher: true,
    },
  });

  if (student) return student;

  // 2. 학생의 휴대폰번호 끝 4자리 매칭
  const activeStudents = await prisma.student.findMany({
    where: {
      status: { in: ['active', 'ENROLLED'] },
      ...(teacherId ? { teacherId } : {}),
    },
    include: {
      user: true,
      teacher: true,
    },
  });

  student = activeStudents.find((s) => {
    const userPhone = s.user?.phone || '';
    return userPhone.replace(/[^0-9]/g, '').endsWith(cleanPin);
  }) || null;

  return student;
}

/**
 * 1단계 & 2단계: 키오스크에서 4자리 PIN 입력 시 상태 머신
 */
export async function handleKioskPin(pin: string, teacherId?: string): Promise<AttendanceResponse> {
  const student = await findStudentByPin(pin, teacherId);
  if (!student) {
    return {
      studentId: '',
      studentName: '',
      grade: '',
      type: 'ERROR',
      parentPhoneMasked: '',
      alimtalkSent: false,
      message: '등록되지 않은 4자리 출결 번호입니다. 선생님께 문의해주세요.',
    };
  }

  const todayStr = getTodayDateString();
  const targetParentPhone = student.parentPhone || student.user?.phone || '010-0000-0000';
  const maskedParentPhone = maskPhoneNumber(targetParentPhone);
  const now = new Date();
  const nowTimeStr = formatTimeKorean(now);

  // 당일 출결 기록 확인
  let todayLog = await prisma.attendanceLog.findFirst({
    where: {
      studentId: student.id,
      date: todayStr,
    },
  });

  // 상태 A: 당일 출결 기록이 없거나 등원 전 -> [1차 입력] 등원 완료 처리 및 학부모 알림톡 자동 발송
  if (!todayLog || !todayLog.checkInTime) {
    if (!todayLog) {
      todayLog = await prisma.attendanceLog.create({
        data: {
          studentId: student.id,
          date: todayStr,
          type: 'CHECK_IN',
          status: 'ON_TIME',
          checkInTime: now,
          alimtalkSent: false, // 실제 발송 결과를 확인한 뒤 갱신한다
        },
      });
    } else {
      todayLog = await prisma.attendanceLog.update({
        where: { id: todayLog.id },
        data: {
          type: 'CHECK_IN',
          status: 'ON_TIME',
          checkInTime: now,
          alimtalkSent: false, // 실제 발송 결과를 확인한 뒤 갱신한다
        },
      });
    }

    // 카카오 알림톡(비즈엠) 발송 — 미연동 상태면 success: false가 돌아온다
    const alimtalkResult = await sendKakaoAlimtalk({
      templateCode: 'INLEV_ATTEND_IN',
      recipientPhone: targetParentPhone,
      message: `[InLevMath 출결안내]\n${student.user.name} 학생이 오늘 ${nowTimeStr}에 안전하게 등원(출석)하였습니다.`,
      variables: {
        studentName: student.user.name,
        checkInTime: nowTimeStr,
        academyName: 'InLevMath 학원',
      },
    });

    // 실제로 발송된 경우에만 발송 완료로 기록한다
    if (alimtalkResult.success) {
      await prisma.attendanceLog.update({
        where: { id: todayLog.id },
        data: { alimtalkSent: true },
      });
    }

    // 선생님 앱 화면 실시간 SSE 브로드캐스트
    if (student.teacherId) {
      broadcastToTeacher(student.teacherId, {
        type: 'ATTENDANCE_UPDATE',
        studentId: student.id,
        studentName: student.user.name,
        grade: student.grade,
        status: 'CHECK_IN',
        time: nowTimeStr,
        timestamp: now.toISOString(),
      });
    }

    return {
      studentId: student.id,
      studentName: student.user.name,
      grade: student.grade,
      type: 'CHECK_IN',
      checkInTime: nowTimeStr,
      parentPhoneMasked: maskedParentPhone,
      alimtalkSent: alimtalkResult.success,
      message: `${student.user.name} 학생 등원이 확인되었습니다.`,
    };
  }

  // 상태 B: 이미 등원했고 아직 하원하지 않은 경우 -> [2차 입력] 퇴원 대기 및 [퇴원하기] 팝업 버튼 유도
  if (todayLog.checkInTime && !todayLog.checkOutTime) {
    const checkInFormatted = formatTimeKorean(todayLog.checkInTime);
    return {
      studentId: student.id,
      studentName: student.user.name,
      grade: student.grade,
      type: 'NEED_CHECK_OUT',
      checkInTime: checkInFormatted,
      parentPhoneMasked: maskedParentPhone,
      alimtalkSent: false,
      message: `${student.user.name} 학생, 지금 퇴원하시겠습니까?`,
    };
  }

  // 상태 C: 이미 당일 등원 및 하원까지 모두 완료된 경우
  return {
    studentId: student.id,
    studentName: student.user.name,
    grade: student.grade,
    type: 'ALREADY_CHECKED_OUT',
    checkInTime: todayLog.checkInTime ? formatTimeKorean(todayLog.checkInTime) : '',
    checkOutTime: todayLog.checkOutTime ? formatTimeKorean(todayLog.checkOutTime) : '',
    parentPhoneMasked: maskedParentPhone,
    alimtalkSent: false,
    message: `${student.user.name} 학생은 오늘 이미 하원 처리가 완료되었습니다.`,
  };
}

export const processKioskPin = handleKioskPin;

/**
 * 2단계: 키오스크 [퇴원하기] 대형 버튼 터치 시 하원 확정 처리
 */
export async function confirmCheckOut(
  pinOrPayload: string | { pin?: string; studentId?: string },
  teacherId?: string
): Promise<AttendanceResponse> {
  let student: any = null;

  if (typeof pinOrPayload === 'string') {
    student = await findStudentByPin(pinOrPayload, teacherId);
  } else if (pinOrPayload.studentId) {
    student = await prisma.student.findUnique({
      where: { id: pinOrPayload.studentId },
      include: { user: true, teacher: true },
    });
  } else if (pinOrPayload.pin) {
    student = await findStudentByPin(pinOrPayload.pin, teacherId);
  }

  if (!student) {
    return {
      studentId: '',
      studentName: '',
      grade: '',
      type: 'ERROR',
      parentPhoneMasked: '',
      alimtalkSent: false,
      message: '학생 정보를 찾을 수 없습니다.',
    };
  }

  const todayStr = getTodayDateString();
  const targetParentPhone = student.parentPhone || student.user?.phone || '010-0000-0000';
  const maskedParentPhone = maskPhoneNumber(targetParentPhone);
  const now = new Date();
  const nowTimeStr = formatTimeKorean(now);

  let todayLog = await prisma.attendanceLog.findFirst({
    where: {
      studentId: student.id,
      date: todayStr,
    },
  });

  if (!todayLog) {
    todayLog = await prisma.attendanceLog.create({
      data: {
        studentId: student.id,
        date: todayStr,
        type: 'CHECK_OUT',
        status: 'ON_TIME',
        checkInTime: now,
        checkOutTime: now,
        alimtalkSent: false, // 실제 발송 결과를 확인한 뒤 갱신한다
      },
    });
  } else {
    todayLog = await prisma.attendanceLog.update({
      where: { id: todayLog.id },
      data: {
        type: 'CHECK_OUT',
        checkOutTime: now,
        alimtalkSent: false, // 실제 발송 결과를 확인한 뒤 갱신한다
      },
    });
  }

  // 하원 카카오 알림톡 발송 — 미연동 상태면 success: false가 돌아온다
  const alimtalkResult = await sendKakaoAlimtalk({
    templateCode: 'INLEV_ATTEND_OUT',
    recipientPhone: targetParentPhone,
    message: `[InLevMath 출결안내]\n${student.user.name} 학생이 오늘 ${nowTimeStr}에 모든 수업 및 학습을 마치고 안전하게 하원(퇴원)하였습니다.`,
    variables: {
      studentName: student.user.name,
      checkOutTime: nowTimeStr,
      academyName: 'InLevMath 학원',
    },
  });

  // 실제로 발송된 경우에만 발송 완료로 기록한다
  if (alimtalkResult.success) {
    await prisma.attendanceLog.update({
      where: { id: todayLog.id },
      data: { alimtalkSent: true },
    });
  }

  // 선생님 앱 화면 실시간 SSE 브로드캐스트
  if (student.teacherId) {
    broadcastToTeacher(student.teacherId, {
      type: 'ATTENDANCE_UPDATE',
      studentId: student.id,
      studentName: student.user.name,
      grade: student.grade,
      status: 'CHECK_OUT',
      time: nowTimeStr,
      timestamp: now.toISOString(),
    });
  }

  return {
    studentId: student.id,
    studentName: student.user.name,
    grade: student.grade,
    type: 'CHECK_OUT',
    checkInTime: todayLog.checkInTime ? formatTimeKorean(todayLog.checkInTime) : nowTimeStr,
    checkOutTime: nowTimeStr,
    parentPhoneMasked: maskedParentPhone,
    alimtalkSent: alimtalkResult.success,
    message: `${student.user.name} 학생 하원 처리가 완료되었습니다.`,
  };
}

/**
 * 선생님 앱 원클릭 출결 상태 변경 및 알림 발송
 */
export async function toggleAttendance(params: {
  studentId: string;
  type: 'CHECK_IN' | 'CHECK_OUT' | 'ABSENT' | 'MAKEUP';
  status?: 'ON_TIME' | 'LATE' | 'ABSENT' | 'MAKEUP';
  /** 이번에 기록할 시각 ("HH:mm" 또는 "오전 hh : mm"). 없으면 현재 시각 */
  time?: string;
  /** 하원 처리 시 등원 시각을 함께 수정하고 싶을 때 사용 */
  checkInTime?: string;
  date?: string;
  sendNotification?: boolean;
  memo?: string;
  teacherId?: string;
}) {
  const {
    studentId,
    type,
    status: customStatus,
    time,
    checkInTime: checkInTimeInput,
    date,
    sendNotification,
    memo,
    teacherId,
  } = params;
  const targetDate = date || getTodayDateString();
  const now = new Date();
  // 사용자가 팝업에서 조절한 시각을 실제 기록 시각으로 사용한다 (미지정 시 현재 시각)
  const eventAt = parseAttendanceTime(targetDate, time) || now;
  const checkInAt = parseAttendanceTime(targetDate, checkInTimeInput);
  const timeStr = formatTimeKorean(eventAt);

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: { user: true },
  });

  if (!student) {
    throw new Error('학생 정보를 찾을 수 없습니다.');
  }

  let log = await prisma.attendanceLog.findFirst({
    where: {
      studentId,
      date: targetDate,
    },
  });

  const updateData: any = {
    type,
    memo: memo || undefined,
  };

  if (customStatus) {
    updateData.status = customStatus;
  }

  if (type === 'CHECK_IN') {
    updateData.checkInTime = eventAt;
    if (!customStatus) updateData.status = 'ON_TIME';
  } else if (type === 'CHECK_OUT') {
    updateData.checkOutTime = eventAt;
    // 하원 처리 시 등원 시각도 함께 수정할 수 있다
    if (checkInAt) updateData.checkInTime = checkInAt;

    const effectiveCheckIn = checkInAt || log?.checkInTime || null;
    if (effectiveCheckIn && eventAt.getTime() < new Date(effectiveCheckIn).getTime()) {
      throw new Error(CHECKOUT_BEFORE_CHECKIN);
    }
    if (!customStatus) updateData.status = 'ON_TIME';
  } else if (type === 'ABSENT') {
    // 결석 처리 시 남아 있던 등·하원 시각을 지운다
    updateData.status = customStatus || 'ABSENT';
    updateData.checkInTime = null;
    updateData.checkOutTime = null;
  } else if (type === 'MAKEUP') {
    updateData.status = customStatus || 'MAKEUP';
  }

  if (log) {
    log = await prisma.attendanceLog.update({
      where: { id: log.id },
      data: updateData,
    });
  } else {
    log = await prisma.attendanceLog.create({
      data: {
        studentId,
        date: targetDate,
        type,
        status: updateData.status || 'ON_TIME',
        checkInTime: type === 'CHECK_IN' ? eventAt : (checkInAt ?? undefined),
        checkOutTime: type === 'CHECK_OUT' ? eventAt : undefined,
        memo,
      },
    });
  }

  // 알림 발송 옵션이 켜져 있는 경우
  if (sendNotification) {
    const parentPhone = student.parentPhone || student.user.phone;
    const templateCode = type === 'CHECK_OUT' ? 'INLEV_ATTEND_OUT' : 'INLEV_ATTEND_IN';

    const notifyResult = await sendKakaoAlimtalk({
      templateCode,
      recipientPhone: parentPhone,
      message:
        type === 'CHECK_OUT'
          ? `[InLevMath 출결안내]\n${student.user.name} 학생이 오늘 ${timeStr}에 모든 수업 및 학습을 마치고 안전하게 하원(퇴원)하였습니다.`
          : `[InLevMath 출결안내]\n${student.user.name} 학생이 오늘 ${timeStr}에 안전하게 등원(출석)하였습니다.`,
      variables: {
        studentName: student.user.name,
        time: timeStr,
        academyName: 'InLevMath 학원',
      },
    });

    if (notifyResult.success) {
      await prisma.attendanceLog.update({
        where: { id: log.id },
        data: { alimtalkSent: true },
      });
    }
  }

  // 실시간 브로드캐스트
  const targetTeacherId = teacherId || student.teacherId;
  if (targetTeacherId) {
    broadcastToTeacher(targetTeacherId, {
      type: 'ATTENDANCE_UPDATE',
      studentId: student.id,
      studentName: student.user.name,
      status: type,
      time: timeStr,
      date: targetDate,
      timestamp: new Date().toISOString(),
    });
  }

  return { success: true, log };
}

/**
 * 잘못 등록한 출결 기록 삭제
 * - CHECK_OUT: 하원 시각만 지우고 등원 상태로 되돌린다
 * - CHECK_IN: 등원 없는 하원은 성립하지 않으므로 그날 기록을 통째로 지운다
 */
export async function deleteAttendanceRecord(params: {
  studentId: string;
  target: 'CHECK_IN' | 'CHECK_OUT';
  date?: string;
  teacherId?: string;
}) {
  const { studentId, target, date, teacherId } = params;
  const targetDate = date || getTodayDateString();

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: { user: true },
  });

  if (!student) {
    throw new Error('학생 정보를 찾을 수 없습니다.');
  }

  const log = await prisma.attendanceLog.findFirst({
    where: { studentId, date: targetDate },
  });

  if (!log) {
    throw new Error(ATTENDANCE_RECORD_NOT_FOUND);
  }

  if (target === 'CHECK_OUT') {
    if (!log.checkOutTime) {
      throw new Error(ATTENDANCE_RECORD_NOT_FOUND);
    }
    await prisma.attendanceLog.update({
      where: { id: log.id },
      data: { checkOutTime: null, type: 'CHECK_IN' },
    });
  } else {
    // 등원 기록 삭제 = 그날 출결 자체를 없던 일로 되돌린다
    await prisma.attendanceLog.delete({ where: { id: log.id } });
  }

  const targetTeacherId = teacherId || student.teacherId;
  if (targetTeacherId) {
    broadcastToTeacher(targetTeacherId, {
      type: 'ATTENDANCE_UPDATE',
      studentId: student.id,
      studentName: student.user.name,
      status: target === 'CHECK_OUT' ? 'CHECK_OUT_DELETED' : 'CHECK_IN_DELETED',
      date: targetDate,
      timestamp: new Date().toISOString(),
    });
  }

  return { success: true, deleted: target };
}

export const toggleTeacherAttendance = toggleAttendance;

/**
 * 월별 출결 캘린더 조회
 */
export async function getMonthlyAttendance(studentId: string, year: number, month: number) {
  const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;

  const logs = await prisma.attendanceLog.findMany({
    where: {
      studentId,
      date: {
        startsWith: monthPrefix,
      },
    },
    orderBy: {
      date: 'asc',
    },
  });

  const totalCheckIns = logs.filter((l) => l.checkInTime).length;
  const totalCheckOuts = logs.filter((l) => l.checkOutTime).length;
  const totalAbsents = logs.filter((l) => l.status === 'ABSENT').length;
  const totalLate = logs.filter((l) => l.status === 'LATE').length;

  const formattedLogs = logs.map((l) => ({
    id: l.id,
    date: l.date,
    type: l.type,
    status: l.status,
    checkInTime: l.checkInTime ? formatTimeKorean(l.checkInTime) : '',
    checkOutTime: l.checkOutTime ? formatTimeKorean(l.checkOutTime) : '',
    alimtalkSent: l.alimtalkSent,
    memo: l.memo,
  }));

  return {
    year,
    month,
    summary: {
      checkIns: totalCheckIns,
      checkOuts: totalCheckOuts,
      absents: totalAbsents,
      late: totalLate,
      attendanceRate: totalCheckIns > 0 ? Math.round((totalCheckIns / (totalCheckIns + totalAbsents || 1)) * 100) : 100,
    },
    logs: formattedLogs,
  };
}

export const getStudentMonthlyAttendance = getMonthlyAttendance;

/**
 * 형제자매 번호 중복 방지: 4자리 고유 난수 PIN 생성
 */
export async function generateUniqueAttendancePin(): Promise<string> {
  for (let attempts = 0; attempts < 50; attempts++) {
    const pin = Math.floor(1000 + Math.random() * 9000).toString();
    const existing = await prisma.student.findFirst({
      where: {
        attendancePin: pin,
        status: { in: ['active', 'ENROLLED'] },
      },
    });
    if (!existing) {
      return pin;
    }
  }
  return String(Date.now()).slice(-4);
}
