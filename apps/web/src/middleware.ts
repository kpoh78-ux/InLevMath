import { NextRequest, NextResponse } from 'next/server'

// 인메모리 rate limit 저장소 (단일 서버용 — 다중 서버 시 Redis로 교체)
const store = new Map<string, { count: number; resetAt: number }>()

const RULES: { pattern: RegExp; limit: number; windowMs: number }[] = [
  { pattern: /^\/api\/auth\/login$/,      limit: 10,  windowMs: 60 * 1000 },       // 로그인: 분당 10회
  { pattern: /^\/api\/students\/bulk$/,   limit: 5,   windowMs: 10 * 60 * 1000 },  // 일괄등록: 10분당 5회
  { pattern: /^\/api\//,                  limit: 200, windowMs: 60 * 1000 },        // 그 외 API: 분당 200회
]

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
          ?? req.headers.get('x-real-ip')
          ?? 'unknown'

  const rule = RULES.find(r => r.pattern.test(pathname))
  if (!rule) return NextResponse.next()

  const key = `${ip}:${pathname}`
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + rule.windowMs })
    return NextResponse.next()
  }

  entry.count++
  if (entry.count > rule.limit) {
    return NextResponse.json(
      { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((entry.resetAt - now) / 1000)),
          'X-RateLimit-Limit': String(rule.limit),
          'X-RateLimit-Remaining': '0',
        },
      }
    )
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/api/:path*'],
}
