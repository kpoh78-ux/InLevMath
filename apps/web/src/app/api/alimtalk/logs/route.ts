import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const logs = await prisma.alimtalkSendLog.findMany({
      orderBy: { sentAt: 'desc' },
      take: 100,
    });

    return NextResponse.json({ logs });
  } catch (error: any) {
    console.error('Fetch alimtalk logs error:', error?.message);
    return NextResponse.json(
      { error: error?.message || '알림톡 내역 조회 실패' },
      { status: 500 }
    );
  }
}
