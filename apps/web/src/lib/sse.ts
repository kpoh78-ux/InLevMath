// 인메모리 SSE 연결 관리자 (O(1) 다중 세션 인덱스 맵)
// 추후 Redis Pub/Sub으로 교체 가능 (다중 서버 확장 시)

export interface SSEClient {
  id: string
  userId: string
  teacherId?: string // 교사인 경우 Teacher.id, 학생인 경우 담당 Teacher.id
  role: 'teacher' | 'student' | 'TEACHER' | 'STUDENT' | 'ADMIN'
  controller: ReadableStreamDefaultController
}

// ─── O(1) 조회를 위한 인덱스 맵 ──────────────────────────────────────────────
const allClients = new Map<string, SSEClient>()                      // key: clientId (또는 userId)
const teacherClientMap = new Map<string, Set<SSEClient>>()           // key: Teacher.id
const studentClientMap = new Map<string, Set<SSEClient>>()           // key: Teacher.id (담당 학생들)

/** SSE 클라이언트 등록 (다중 세션/브라우저 탭 지원) */
export function registerSSEClient(client: SSEClient) {
  allClients.set(client.id, client)

  const isTeacher = client.role === 'teacher' || client.role === 'TEACHER' || client.role === 'ADMIN'
  if (isTeacher && client.teacherId) {
    if (!teacherClientMap.has(client.teacherId)) {
      teacherClientMap.set(client.teacherId, new Set())
    }
    teacherClientMap.get(client.teacherId)!.add(client)
  } else if (client.teacherId) {
    if (!studentClientMap.has(client.teacherId)) {
      studentClientMap.set(client.teacherId, new Set())
    }
    studentClientMap.get(client.teacherId)!.add(client)
  }
}

/** SSE 클라이언트 연결 해제 */
export function unregisterSSEClient(clientId: string) {
  const client = allClients.get(clientId)
  if (client) {
    if (client.teacherId && teacherClientMap.has(client.teacherId)) {
      teacherClientMap.get(client.teacherId)!.delete(client)
      if (teacherClientMap.get(client.teacherId)!.size === 0) {
        teacherClientMap.delete(client.teacherId)
      }
    }
    if (client.teacherId && studentClientMap.has(client.teacherId)) {
      studentClientMap.get(client.teacherId)!.delete(client)
      if (studentClientMap.get(client.teacherId)!.size === 0) {
        studentClientMap.delete(client.teacherId)
      }
    }
    allClients.delete(clientId)
  }
}

// ── 기존 함수명 하위 호환성 ─────────────────────────────────────────
export function addClient(
  clientIdOrUserId: string,
  teacherId: string,
  role: 'teacher' | 'student',
  controller: ReadableStreamDefaultController,
  userId?: string,
) {
  registerSSEClient({
    id: clientIdOrUserId,
    userId: userId ?? clientIdOrUserId,
    teacherId,
    role,
    controller,
  })
}

export function removeClient(clientIdOrUserId: string) {
  unregisterSSEClient(clientIdOrUserId)
}

function formatPayload(eventOrData: any, data?: any): string {
  if (typeof eventOrData === 'string' && data !== undefined) {
    // event 이름과 data가 분리된 형식
    const jsonStr = typeof data === 'string' ? data : JSON.stringify(data)
    return `event: ${eventOrData}\ndata: ${jsonStr}\n\n`
  }
  // 단일 객체/데이터 형식
  const jsonStr = typeof eventOrData === 'string' ? eventOrData : JSON.stringify(eventOrData)
  return `data: ${jsonStr}\n\n`
}

/** 선생님에게만 이벤트 전송 (O(1) 인덱스 맵 조회로 해당 교사의 모든 활성 세션에 즉시 전달) */
export function broadcastToTeacher(teacherId: string, eventOrData: any, data?: any) {
  const clients = teacherClientMap.get(teacherId)
  if (!clients || clients.size === 0) return

  const payload = formatPayload(eventOrData, data)
  clients.forEach((client) => {
    try {
      client.controller.enqueue(payload)
    } catch {
      unregisterSSEClient(client.id)
    }
  })
}

/** 해당 선생님 담당 학생 전원에게 이벤트 전송 (O(1) 인덱스 맵 조회) */
export function broadcastToStudentsOfTeacher(teacherId: string, eventOrData: any, data?: any) {
  const clients = studentClientMap.get(teacherId)
  if (!clients || clients.size === 0) return

  const payload = formatPayload(eventOrData, data)
  clients.forEach((client) => {
    try {
      client.controller.enqueue(payload)
    } catch {
      unregisterSSEClient(client.id)
    }
  })
}

export function broadcastToAll(teacherId: string, eventOrData: any, data?: any) {
  broadcastToTeacher(teacherId, eventOrData, data)
  broadcastToStudentsOfTeacher(teacherId, eventOrData, data)
}

/** 특정 학생 앱 세션으로 실시간 이벤트 전송 */
export function broadcastToStudentApp(studentIdOrUserId: string, eventOrData: any, data?: any) {
  const payload = formatPayload(eventOrData, data)
  let sent = false

  allClients.forEach((client) => {
    if (client.userId === studentIdOrUserId || client.id === studentIdOrUserId) {
      try {
        client.controller.enqueue(payload)
        sent = true
      } catch {
        unregisterSSEClient(client.id)
      }
    }
  })

  // 만약 개별 세션이 직접 매핑되지 않았더라도 담당 선생님에게도 처방 알림 공유
  return sent
}

