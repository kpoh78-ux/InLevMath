import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { deleteAttendanceRecord, ATTENDANCE_RECORD_NOT_FOUND } from '@/lib/attendanceService';

export const dynamic = 'force-dynamic';

/** 잘못 등록한 등원/하원 기록 삭제 */
export async function DELETE(req: Request) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { studentId, target, date } = await req.json();

    if (!studentId) {
      return NextResponse.json({ error: '학생 ID가 필요합니다.' }, { status: 400 });
    }
    if (target !== 'CHECK_IN' && target !== 'CHECK_OUT') {
      return NextResponse.json(
        { error: '삭제 대상은 CHECK_IN 또는 CHECK_OUT이어야 합니다.' },
        { status: 400 }
      );
    }

    const result = await deleteAttendanceRecord({ studentId, target, date });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : '출결 기록 삭제 실패';

    // 지울 기록이 없는 경우는 사용자 상황이므로 404로 구분한다
    if (message === ATTENDANCE_RECORD_NOT_FOUND) {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    console.error('Attendance record delete error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
