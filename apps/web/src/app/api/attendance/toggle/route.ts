import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { toggleTeacherAttendance } from '@/lib/attendanceService';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const body = await req.json();
    const { studentId, date, type, status, sendNotification, memo } = body;

    if (!studentId) {
      return NextResponse.json({ error: '학생 ID가 필요합니다.' }, { status: 400 });
    }

    const updated = await toggleTeacherAttendance({
      studentId,
      date,
      type,
      status,
      sendNotification: Boolean(sendNotification),
      memo,
    });

    return NextResponse.json({ success: true, log: updated });
  } catch (error: any) {
    console.error('Attendance toggle error:', error?.message);
    return NextResponse.json(
      { error: error?.message || '출결 처리 실패' },
      { status: 500 }
    );
  }
}
