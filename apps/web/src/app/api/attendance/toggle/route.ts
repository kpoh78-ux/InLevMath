import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { toggleTeacherAttendance, CHECKOUT_BEFORE_CHECKIN } from '@/lib/attendanceService';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const body = await req.json();
    const { studentId, date, type, status, time, checkInTime, lateMinutes, sendNotification, memo } = body;

    if (!studentId) {
      return NextResponse.json({ error: '학생 ID가 필요합니다.' }, { status: 400 });
    }

    const updated = await toggleTeacherAttendance({
      studentId,
      date,
      type,
      status,
      time,        // 팝업에서 조절한 등원/하원 시각
      checkInTime, // 하원 처리 시 등원 시각을 함께 수정하는 경우
      lateMinutes, // 지각 정도(분)
      sendNotification: Boolean(sendNotification),
      memo,
    });

    return NextResponse.json({ success: true, log: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : '출결 처리 실패';

    // 시간 입력 오류는 사용자 잘못이므로 400으로 구분해 응답한다
    const isValidationError = message === CHECKOUT_BEFORE_CHECKIN;
    if (!isValidationError) {
      console.error('Attendance toggle error:', message);
    }

    return NextResponse.json({ error: message }, { status: isValidationError ? 400 : 500 });
  }
}
