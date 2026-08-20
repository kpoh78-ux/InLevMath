// 인메모리 SSE 연결 관리자
// 추후 Redis Pub/Sub으로 교체 가능 (다중 서버 확장 시)
//
// ─── 구조 개선 ──────────────────────────────────────────────────────────────
// 기존 broadcastToTeacher 의 client.userId === teacherId 조건은 항상 false:
//   - client.userId = User.id (cuid)
//   - teacherId     = Teacher.id (cuid) — 다른 테이블의 PK
// → role 필드 추가 + teacherClients 보조 맵으로 선생님 클라이언트를 O(1) 조회

type SseClient = {
  userId: string
  teacherId: string   // 학생이면 담당 선생님 Teacher.id, 선생님이면 자신의 Teacher.id
  role: 'teacher' | 'student'
  controller: ReadableStreamDefaultController
}

// key: userId (User.id)
const clients = new Map<string, SseClient>()

// 선생님 전용 보조 인덱스: teacherId → userId 집합 (O(1) 조회)
const teacherClients = new Map<string, Set<string>>()  // key: Teacher.id

export function addClient(
  userId: string,
  teacherId: string,
  role: 'teacher' | 'student',
  controller: ReadableStreamDefaultController,
) {
  clients.set(userId, { userId, teacherId, role, controller })

  if (role === 'teacher') {
    if (!teacherClients.has(teacherId)) teacherClients.set(teacherId, new Set())
    teacherClients.get(teacherId)!.add(userId)
  }
}

export function removeClient(userId: string) {
  const client = clients.get(userId)
  if (!client) return
  clients.delete(userId)

  if (client.role === 'teacher') {
    const set = teacherClients.get(client.teacherId)
    if (set) {
      set.delete(userId)
      if (set.size === 0) teacherClients.delete(client.teacherId)
    }
  }
}

/** 선생님에게만 이벤트 전송 (teacherClients 보조 맵으로 O(1) 조회) */
export function broadcastToTeacher(teacherId: string, event: object) {
  const data = `data: ${JSON.stringify(event)}\n\n`
  const userIds = teacherClients.get(teacherId)
  if (!userIds) return
  for (const userId of userIds) {
    const client = clients.get(userId)
    if (!client) continue
    try { client.controller.enqueue(data) } catch { removeClient(userId) }
  }
}

/** 해당 선생님 담당 학생 전원에게 이벤트 전송 */
export function broadcastToStudentsOfTeacher(teacherId: string, event: object) {
  const data = `data: ${JSON.stringify(event)}\n\n`
  for (const client of clients.values()) {
    if (client.teacherId === teacherId && client.role === 'student') {
      try { client.controller.enqueue(data) } catch { removeClient(client.userId) }
    }
  }
}

export function broadcastToAll(teacherId: string, event: object) {
  broadcastToTeacher(teacherId, event)
  broadcastToStudentsOfTeacher(teacherId, event)
}
