import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getStudentMonthlyAttendance } from '@/lib/attendanceService';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get('studentId');
    const now = new Date();
    const year = parseInt(searchParams.get('year') || String(now.getFullYear()), 10);
    const month = parseInt(searchParams.get('month') || String(now.getMonth() + 1), 10);

    if (!studentId) {
      return NextResponse.json({ error: '학생 ID가 필요합니다.' }, { status: 400 });
    }

    const data = await getStudentMonthlyAttendance(studentId, year, month);

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Monthly attendance error:', error?.message);
    return NextResponse.json(
      { error: error?.message || '월별 출결 조회 실패' },
      { status: 500 }
    );
  }
}
