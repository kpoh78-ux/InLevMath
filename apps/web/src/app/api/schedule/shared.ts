import { prisma } from '@/lib/db'

// 수업에 붙는 학생은 ClassScheduleStudent 관계로 잡는다. 예전에는 studentNames 에
// 이름 문자열 배열로 들고 있었는데, 동명이인이면 어느 학생인지 가릴 수 없어
// 지각 분수를 자동 계산할 수 없었다.
//
// 화면과 주고받는 형태는 { studentIds, students: [{ id, name, grade }] } 다.
// studentNames 는 이관 전 원본으로 DB 에 남아 있지만 더 이상 읽지 않는다.

export const WITH_STUDENTS = {
  students: {
    select: {
      student: {
        select: { id: true, grade: true, user: { select: { name: true } } },
      },
    },
  },
} as const

export type RawSchedule = {
  students: { student: { id: string; grade: string; user: { name: string } } }[]
  [key: string]: unknown
}

/** DB 행 → 화면이 쓰는 형태 */
export function toEntry(s: RawSchedule) {
  const { students, studentNames: _legacy, ...rest } = s as RawSchedule & { studentNames?: string }
  const list = students.map(({ student }) => ({
    id: student.id,
    name: student.user.name,
    grade: student.grade,
  }))
  return {
    ...rest,
    students: list,
    studentIds: list.map(v => v.id),
    // 이름만 필요한 화면을 위해 관계에서 만들어 내려준다
    studentNames: list.map(v => v.name),
  }
}

/** 요청 본문의 학생 id 목록에서 이 학원 재원생만 남긴다 */
export async function resolveStudentIds(teacherId: string, raw: unknown): Promise<string[]> {
  const ids = Array.isArray(raw)
    ? [...new Set(raw.filter((v): v is string => typeof v === 'string' && v !== ''))]
    : []
  if (ids.length === 0) return []

  const owned = await prisma.student.findMany({
    where: { id: { in: ids }, teacherId, status: 'active' },
    select: { id: true },
  })
  return owned.map(o => o.id)
}
