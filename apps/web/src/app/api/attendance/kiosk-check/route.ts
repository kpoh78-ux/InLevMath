import { NextResponse } from 'next/server';
import { processKioskPin } from '@/lib/attendanceService';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { pin } = await req.json();
    if (!pin || typeof pin !== 'string' || pin.trim().length !== 4) {
      return NextResponse.json(
        { error: '출결 번호 4자리를 정확히 입력해주세요.' },
        { status: 400 }
      );
    }

    const result = await processKioskPin(pin.trim());

    if (result.type === 'ERROR') {
      return NextResponse.json(result, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Kiosk check API error:', error?.message);
    return NextResponse.json(
      { error: '출결 확인 중 서버 오류가 발생했습니다.', details: error.message },
      { status: 500 }
    );
  }
}
