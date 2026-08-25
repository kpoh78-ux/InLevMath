import { NextResponse } from 'next/server';
import { confirmCheckOut } from '@/lib/attendanceService';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { pin, studentId } = body;

    if (!pin && !studentId) {
      return NextResponse.json(
        { error: '출결 번호 또는 학생 ID가 필요합니다.' },
        { status: 400 }
      );
    }

    const result = await confirmCheckOut({ pin, studentId });

    if (result.type === 'ERROR') {
      return NextResponse.json(result, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Confirm check-out API error:', error?.message);
    return NextResponse.json(
      { error: '하원 처리 중 서버 오류가 발생했습니다.', details: error.message },
      { status: 500 }
    );
  }
}
