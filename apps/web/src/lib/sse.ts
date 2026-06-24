// 인메모리 SSE 연결 관리자
// 추후 Redis Pub/Sub으로 교체 가능 (다중 서버 확장 시)

type SseClient = {
  userId: string
  teacherId: string   // 학생이면 자신의 teacherId, 선생님이면 자신의 id
  controller: ReadableStreamDefaultController
}

const clients = new Map<string, SseClient>()  // key: userId

export function addClient(userId: string, teacherId: string, controller: ReadableStreamDefaultController) {
  clients.set(userId, { userId, teacherId, controller })
}

export function removeClient(userId: string) {
  clients.delete(userId)
}

export function broadcastToTeacher(teacherId: string, event: object) {
  const data = `data: ${JSON.stringify(event)}\n\n`
  for (const client of clients.values()) {
    if (client.teacherId === teacherId && client.userId === teacherId) {
      try { client.controller.enqueue(data) } catch { removeClient(client.userId) }
    }
  }
}

export function broadcastToStudentsOfTeacher(teacherId: string, event: object) {
  const data = `data: ${JSON.stringify(event)}\n\n`
  for (const client of clients.values()) {
    if (client.teacherId === teacherId && client.userId !== teacherId) {
      try { client.controller.enqueue(data) } catch { removeClient(client.userId) }
    }
  }
}

export function broadcastToAll(teacherId: string, event: object) {
  broadcastToTeacher(teacherId, event)
  broadcastToStudentsOfTeacher(teacherId, event)
}
