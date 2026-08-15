// 학원 공용 데이터 범위 (서버 전용)
//
// 이 앱은 학원 하나를 쓴다. 관리자가 등록한 선생님은 모두 같은 학원 소속이므로
// 학생·학습지·교재·시간표·채점 결과를 전부 공유해야 한다.
//
// 그런데 각 테이블은 teacherId로 소유자를 구분하고, 모든 조회가 거기에 걸려 있다.
// 조회 조건을 일일이 고치는 대신 "소유자 = 학원 대표 계정" 하나로 통일한다.
//   · 어떤 선생님이 만들든 teacherId는 대표 계정을 가리킨다
//   · 어떤 선생님이 조회하든 같은 대표 계정 기준으로 읽는다
//   → 배포·채점 결과가 즉시 모든 선생님에게 공유되고,
//     SSE 채널도 하나로 묶여 학생 제출 알림이 전원에게 간다
//
// 대표 계정 = 가장 먼저 만들어진 관리자 (없으면 가장 먼저 만들어진 선생님).
// 로그인한 본인 계정 정보가 필요하면 teacherAuth.ts의 getTeacherAuth를 쓴다.

import { prisma } from './db'

type TeacherRef = { id: string }

// 대표 계정은 거의 바뀌지 않으므로 잠깐 캐시한다
let cachedOwnerId: string | null = null
let cachedAt = 0
const CACHE_MS = 60_000

async function academyOwnerId(): Promise<string | null> {
  if (cachedOwnerId && Date.now() - cachedAt < CACHE_MS) return cachedOwnerId

  const admin = await prisma.teacher.findFirst({
    where: { isAdmin: true },
    orderBy: { user: { createdAt: 'asc' } },
    select: { id: true },
  })
  const owner = admin ?? await prisma.teacher.findFirst({
    orderBy: { user: { createdAt: 'asc' } },
    select: { id: true },
  })

  cachedOwnerId = owner?.id ?? null
  cachedAt = Date.now()
  return cachedOwnerId
}

/** 선생님 계정 등록·삭제 후 대표 계정이 바뀔 수 있으므로 캐시를 비운다 */
export function clearAcademyOwnerCache() {
  cachedOwnerId = null
  cachedAt = 0
}

/**
 * 기존 `prisma.teacher.findUnique({ where: { userId } })` 자리를 대체한다.
 * 호출자가 선생님이 아니면 null (기존 권한 검사 동작 유지),
 * 맞으면 학원 대표 계정을 돌려준다.
 */
export async function academyTeacher(userId: string): Promise<TeacherRef | null> {
  const me = await prisma.teacher.findUnique({
    where: { userId },
    select: { id: true },
  })
  if (!me) return null

  const ownerId = await academyOwnerId()
  return { id: ownerId ?? me.id }
}