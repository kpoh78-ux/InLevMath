import { prisma } from '@/lib/db'

// 수업 시간표의 공용 조회·변환.
//
// 소유자(teacherId)는 **수업을 맡은 선생님 본인**이다. 학생·학습지·교재처럼
// 학원 대표 계정으로 몰지 않는다 — 시간표는 선생님마다 다르고, 누구 수업인지가
// 지각 판정과 하원 리포트의 기준이 되기 때문이다.
//
// 다만 조회는 학원 전체를 준다. 한 학생이 여러 선생님 수업을 들을 수 있어,
// 그날 그 학생의 수업을 모두 모아야 등원 시각을 첫 수업과 맞댈 수 있다.
//
// 수업에 붙는 학생은 ClassScheduleStudent 관계로 잡는다. 이름 문자열로는
// 동명이인을 가릴 수 없어 지각 분수를 자동 계산할 수 없었다.

export const WITH_SCHEDULE_RELATIONS = {
  teacher: { select: { id: true, user: { select: { name: true } } } },
  students: {
    select: {
      student: {
        select: { id: true, grade: true, user: { select: { name: true } } },
      },
    },
  },
} as const

export type RawSchedule = {
  teacherId: string
  teacher: { id: string; user: { name: string } }
  students: { student: { id: string; grade: string; user: { name: string } } }[]
  [key: string]: unknown
}

/** DB 행 → 화면이 쓰는 형태 */
export function toEntry(s: RawSchedule, viewer: { teacherId: string; isAdmin: boolean }) {
  const { students, teacher, studentNames: _legacy, ...rest } = s as RawSchedule & { studentNames?: string }
  const list = students.map(({ student }) => ({
    id: student.id,
    name: student.user.name,
    grade: student.grade,
  }))
  const mine = s.teacherId === viewer.teacherId
  return {
    ...rest,
    teacherName: teacher.user.name,
    mine,
    // 남의 수업은 관리자만 고칠 수 있다
    canEdit: mine || viewer.isAdmin,
    students: list,
    studentIds: list.map(v => v.id),
    // 이름만 필요한 화면을 위해 관계에서 만들어 내려준다
    studentNames: list.map(v => v.name),
  }
}

/** 요청 본문의 학생 id 목록에서 이 학원 재원생만 남긴다 */
export async function resolveStudentIds(raw: unknown): Promise<string[]> {
  const ids = Array.isArray(raw)
    ? [...new Set(raw.filter((v): v is string => typeof v === 'string' && v !== ''))]
    : []
  if (ids.length === 0) return []

  // 학생은 학원 공용이므로 teacherId 로 좁히지 않는다 (재원 여부만 확인)
  const owned = await prisma.student.findMany({
    where: { id: { in: ids }, status: 'active' },
    select: { id: true },
  })
  return owned.map(o => o.id)
}

/**
 * 수업을 맡을 선생님을 정한다.
 * 관리자만 다른 선생님 이름으로 수업을 만들거나 옮길 수 있다.
 */
export async function resolveOwnerTeacherId(
  viewer: { teacherId: string; isAdmin: boolean },
  requested: unknown
): Promise<string | null> {
  if (typeof requested !== 'string' || requested === '' || requested === viewer.teacherId) {
    return viewer.teacherId
  }
  if (!viewer.isAdmin) return null

  const exists = await prisma.teacher.findUnique({ where: { id: requested }, select: { id: true } })
  return exists?.id ?? null
}
