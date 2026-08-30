import { NextRequest, NextResponse } from 'next/server';
import { processKioskPin } from '@/lib/attendanceService';
import { requireKiosk } from '@/lib/kioskAuth';

// POST /api/attendance/kiosk-check — 입구 태블릿에서 4자리 PIN 입력
//
// 선생님 로그인이 있어야 부를 수 있다. 예전에는 검사가 없어 누구나 4자리를
// 1만 번 넣어 볼 수 있었고, 맞으면 남의 아이 등원 기록이 생기고 학부모에게
// 알림톡이 나갔다 (lib/kioskAuth.ts 참고).

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const guard = await requireKiosk(req);
  if ('response' in guard) return guard.response;

  try {
    const { pin } = await req.json();
    if (!pin || typeof pin !== 'string' || pin.trim().length !== 4) {
      return NextResponse.json(
        { error: '출결 번호 4자리를 정확히 입력해주세요.' },
        { status: 400 }
      );
    }

    // 학원을 넘어 PIN 이 겹치지 않도록 이 학원으로 좁혀 찾는다
    const result = await processKioskPin(pin.trim(), guard.auth.academyTeacherId);

    if (result.type === 'ERROR') {
      return NextResponse.json(result, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류';
    console.error('Kiosk check API error:', message);
    return NextResponse.json(
      { error: '출결 확인 중 서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
