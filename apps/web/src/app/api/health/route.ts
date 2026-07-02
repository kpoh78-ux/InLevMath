import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET /api/health — Supabase 자동정지 방지용 헬스체크
// cron-job.org에서 5일마다 호출 → DB 쿼리로 Supabase 활성 상태 유지
export async function GET() {
  try {
    const userCount = await prisma.user.count()
    return NextResponse.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      db: 'connected',
      users: userCount,
    })
  } catch (err) {
    return NextResponse.json(
      { status: 'error', message: String(err) },
      { status: 503 }
    )
  }
}
