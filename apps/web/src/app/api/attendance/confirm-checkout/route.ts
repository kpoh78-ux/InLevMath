import { NextRequest, NextResponse } from 'next/server';
import { confirmCheckOut } from '@/lib/attendanceService';
import { requireKiosk } from '@/lib/kioskAuth';

// POST /api/attendance/confirm-checkout — 키오스크 [하원하기] 확정
//
// 선생님 로그인이 있어야 부를 수 있다. 예전에는 검사가 없어 studentId 만
// 알면 PIN 없이도 하원 처리와 학부모 알림톡을 일으킬 수 있었다.
// 학생 id 는 다른 API 응답에 실려 나가므로 알아내기 어렵지도 않았다.

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const guard = await requireKiosk(req);
  if ('response' in guard) return guard.response;

  try {
    const body = await req.json();
    const { pin, studentId } = body;

    if (!pin && !studentId) {
      return NextResponse.json(
        { error: '출결 번호 또는 학생 ID가 필요합니다.' },
        { status: 400 }
      );
    }

    const result = await confirmCheckOut({ pin, studentId }, guard.auth.academyTeacherId);

    if (result.type === 'ERROR') {
      return NextResponse.json(result, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류';
    console.error('Confirm check-out API error:', message);
    return NextResponse.json(
      { error: '하원 처리 중 서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
