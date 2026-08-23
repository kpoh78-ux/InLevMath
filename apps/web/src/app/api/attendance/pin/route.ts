import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { generateUniqueAttendancePin } from '@/lib/attendanceService';

export const dynamic = 'force-dynamic';

// GET /api/attendance/pin?action=generate -> 고유 랜덤 4자리 PIN 생성
export async function GET(req: Request) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');

    if (action === 'generate') {
      const pin = await generateUniqueAttendancePin();
      return NextResponse.json({ pin });
    }

    return NextResponse.json({ error: '유효하지 않은 요청입니다.' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'PIN 생성 실패' }, { status: 500 });
  }
}

// POST /api/attendance/pin -> 학생 출결 4자리 PIN 설정/수정
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { studentId, pin } = await req.json();

    if (!studentId) {
      return NextResponse.json({ error: '학생 ID가 필요합니다.' }, { status: 400 });
    }

    if (pin && (typeof pin !== 'string' || pin.trim().length !== 4 || !/^\d{4}$/.test(pin.trim()))) {
      return NextResponse.json({ error: '출결 번호는 숫자 4자리여야 합니다.' }, { status: 400 });
    }

    const cleanPin = pin ? pin.trim() : null;

    // 다른 학생과의 중복 검사 (동일 학생 제외)
    if (cleanPin) {
      const duplicate = await prisma.student.findFirst({
        where: {
          attendancePin: cleanPin,
          id: { not: studentId },
          status: 'active',
        },
        include: { user: true },
      });

      if (duplicate) {
        return NextResponse.json(
          {
            error: `이미 ${duplicate.user.name} (${duplicate.grade}) 학생에게 등록된 출결 번호입니다. 다른 번호를 입력하거나 랜덤 생성을 눌러주세요.`,
          },
          { status: 409 }
        );
      }
    }

    const updated = await prisma.student.update({
      where: { id: studentId },
      data: { attendancePin: cleanPin },
      include: { user: true },
    });

    return NextResponse.json({
      success: true,
      studentId: updated.id,
      attendancePin: updated.attendancePin,
      name: updated.user.name,
    });
  } catch (error: any) {
    console.error('Update PIN error:', error?.message);
    return NextResponse.json(
      { error: error?.message || '출결 번호 설정 실패' },
      { status: 500 }
    );
  }
}
