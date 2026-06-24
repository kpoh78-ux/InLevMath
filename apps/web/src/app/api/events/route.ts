import { NextRequest } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { addClient, removeClient } from '@/lib/sse'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// GET /api/events — SSE 연결 엔드포인트
// 학생/선생님 모두 이 엔드포인트에 연결하면 실시간 이벤트를 수신
export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  // teacherId 결정: 선생님이면 자신의 id, 학생이면 소속 선생님 id
  let teacherId: string
  if (user.role === 'teacher') {
    const teacher = await prisma.teacher.findUnique({ where: { userId: user.sub } })
    if (!teacher) return new Response('Not found', { status: 404 })
    teacherId = teacher.id
  } else {
    const student = await prisma.student.findUnique({ where: { userId: user.sub } })
    if (!student) return new Response('Not found', { status: 404 })
    teacherId = student.teacherId
  }

  const stream = new ReadableStream({
    start(controller) {
      addClient(user.sub, teacherId, controller)

      // 연결 확인 ping
      controller.enqueue(`data: ${JSON.stringify({ type: 'CONNECTED', userId: user.sub })}\n\n`)

      // 30초마다 heartbeat — 연결 유지
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(': heartbeat\n\n')
        } catch {
          clearInterval(heartbeat)
          removeClient(user.sub)
        }
      }, 30000)

      req.signal.addEventListener('abort', () => {
        clearInterval(heartbeat)
        removeClient(user.sub)
        try { controller.close() } catch {}
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
