// apps/web/src/lib/dailyClasses.ts
//
// 한 학생의 "그날 수업"을 선생님 구분 없이 한 덩어리로 모은다.
//
// 시간표는 선생님마다 따로 만들지만, 학생 입장에서 하루는 하나다.
// 같은 날 A선생님 수업(15:00~17:00) 뒤에 B선생님 수업(17:00~19:00)이 이어지면
// 학생은 15:00에 한 번 등원해서 19:00에 한 번 하원한다. 그래서
//   · 지각은 "그날 첫 수업" 기준으로 한 번만 판정하고
//   · 하원 리포트의 숫자는 그날 전체를 합산해야 한다
// 수업마다 따로 세면 같은 하루가 두 번 보고되거나, 뒤 수업 시작 시각과 맞대어
// 멀쩡히 온 학생이 지각으로 찍힌다.
//
// 5대 학습데이터(숙제·교재·오답클리닉·단원평가)는 모두 날짜(YYYY-MM-DD) 단위라
// 이 모듈이 정한 "그날"과 같은 눈금을 쓰면 자동으로 합산된다.

import { prisma } from './db'

/** 앞 수업이 끝나고 이 시간 안에 다음 수업이 시작하면 연강으로 본다 (분) */
export const CONSECUTIVE_GAP_MINUTES = 60

export type DailyClass = {
  scheduleId: string
  teacherId: string
  teacherName: string
  subject: string
  grade: string
  startTime: string
  endTime: string
}

/** 쉬는 시간 없이 이어지는 수업 묶음 */
export type ClassBlock = {
  startTime: string
  endTime: string
  classes: DailyClass[]
}

export type DailyClassPlan = {
  date: string
  /** 시작 시각 순 */
  classes: DailyClass[]
  /** 연강끼리 묶은 구간 */
  blocks: ClassBlock[]
  /** 그날 첫 수업 시작 시각. 수업이 없으면 null */
  firstStart: string | null
  /** 그날 마지막 수업 종료 시각 */
  lastEnd: string | null
  /** 그날 가르친 선생님 (중복 제거, 수업 순서) */
  teacherNames: string[]
  /** 그날 과목 (중복 제거, 수업 순서) */
  subjects: string[]
}

export const EMPTY_PLAN = (date: string): DailyClassPlan => ({
  date,
  classes: [],
  blocks: [],
  firstStart: null,
  lastEnd: null,
  teacherNames: [],
  subjects: [],
})

/** 'YYYY-MM-DD' → 내부 요일 인덱스(0=월 … 6=일). 형식이 틀리면 null */
export function dayOfWeekOf(dateStr: string): number | null {
  const [y, m, d] = dateStr.split('-').map(Number)
  if (!y || !m || !d) return null
  const js = new Date(y, m - 1, d).getDay()
  return js === 0 ? 6 : js - 1
}

/** "HH:mm" → 자정 기준 분. 형식이 틀리면 null */
export function minutesOf(time: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(time).trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

/** 연강끼리 묶는다. classes 는 시작 시각 순으로 정렬돼 있어야 한다 */
export function groupIntoBlocks(classes: DailyClass[]): ClassBlock[] {
  const blocks: ClassBlock[] = []

  for (const c of classes) {
    const last = blocks[blocks.length - 1]
    const prevEnd = last ? minutesOf(last.endTime) : null
    const start = minutesOf(c.startTime)

    const continues =
      last != null && prevEnd != null && start != null && start - prevEnd <= CONSECUTIVE_GAP_MINUTES

    if (continues) {
      last.classes.push(c)
      // 앞 수업이 더 늦게 끝나는 경우(겹치는 수업)도 있으므로 더 큰 쪽을 남긴다
      if ((minutesOf(c.endTime) ?? 0) > (prevEnd ?? 0)) last.endTime = c.endTime
    } else {
      blocks.push({ startTime: c.startTime, endTime: c.endTime, classes: [c] })
    }
  }

  return blocks
}

/**
 * 그날 그 학생이 듣는 수업 전체 — 선생님을 가리지 않는다.
 *
 * 한 학생이 여러 선생님 수업을 들을 수 있으므로 teacherId 로 좁히지 않는다.
 * 이 함수를 거치지 않고 ClassSchedule 을 직접 조회하면 다른 선생님 수업이 빠져
 * 지각 판정과 리포트가 어긋난다.
 */
export async function getStudentDayClasses(studentId: string, dateStr: string): Promise<DailyClassPlan> {
  const dow = dayOfWeekOf(dateStr)
  if (dow === null) return EMPTY_PLAN(dateStr)

  const rows = await prisma.classSchedule.findMany({
    where: { dayOfWeek: dow, students: { some: { studentId } } },
    select: {
      id: true,
      teacherId: true,
      subject: true,
      grade: true,
      startTime: true,
      endTime: true,
      teacher: { select: { user: { select: { name: true } } } },
    },
  })
  if (rows.length === 0) return EMPTY_PLAN(dateStr)

  const classes: DailyClass[] = rows
    .map(r => ({
      scheduleId: r.id,
      teacherId: r.teacherId,
      teacherName: r.teacher.user.name,
      subject: r.subject,
      grade: r.grade,
      startTime: r.startTime,
      endTime: r.endTime,
    }))
    .sort((a, b) => (minutesOf(a.startTime) ?? 0) - (minutesOf(b.startTime) ?? 0))

  const blocks = groupIntoBlocks(classes)

  return {
    date: dateStr,
    classes,
    blocks,
    firstStart: classes[0].startTime,
    lastEnd: blocks[blocks.length - 1].endTime,
    teacherNames: [...new Set(classes.map(c => c.teacherName))],
    subjects: [...new Set(classes.map(c => c.subject))],
  }
}

/** 여러 학생의 그날 수업을 한 번에 — 리포트처럼 전원을 도는 곳에서 쓴다 */
export async function getDayClassesForStudents(
  studentIds: string[],
  dateStr: string
): Promise<Map<string, DailyClassPlan>> {
  const out = new Map<string, DailyClassPlan>()
  studentIds.forEach(id => out.set(id, EMPTY_PLAN(dateStr)))

  const dow = dayOfWeekOf(dateStr)
  if (dow === null || studentIds.length === 0) return out

  const rows = await prisma.classSchedule.findMany({
    where: { dayOfWeek: dow, students: { some: { studentId: { in: studentIds } } } },
    select: {
      id: true,
      teacherId: true,
      subject: true,
      grade: true,
      startTime: true,
      endTime: true,
      teacher: { select: { user: { select: { name: true } } } },
      students: { select: { studentId: true } },
    },
  })

  const wanted = new Set(studentIds)
  const byStudent = new Map<string, DailyClass[]>()

  for (const r of rows) {
    const cls: DailyClass = {
      scheduleId: r.id,
      teacherId: r.teacherId,
      teacherName: r.teacher.user.name,
      subject: r.subject,
      grade: r.grade,
      startTime: r.startTime,
      endTime: r.endTime,
    }
    for (const { studentId } of r.students) {
      if (!wanted.has(studentId)) continue
      if (!byStudent.has(studentId)) byStudent.set(studentId, [])
      byStudent.get(studentId)!.push(cls)
    }
  }

  for (const [studentId, list] of byStudent) {
    const classes = [...list].sort((a, b) => (minutesOf(a.startTime) ?? 0) - (minutesOf(b.startTime) ?? 0))
    const blocks = groupIntoBlocks(classes)
    out.set(studentId, {
      date: dateStr,
      classes,
      blocks,
      firstStart: classes[0].startTime,
      lastEnd: blocks[blocks.length - 1].endTime,
      teacherNames: [...new Set(classes.map(c => c.teacherName))],
      subjects: [...new Set(classes.map(c => c.subject))],
    })
  }

  return out
}

/** 알림톡 한 줄 — "15:00~17:00 초등수학(오근표) · 17:00~19:00 중등수학(김선생)" */
export function describeClasses(plan: DailyClassPlan): string {
  return plan.classes
    .map(c => `${c.startTime}~${c.endTime} ${c.subject}(${c.teacherName})`)
    .join(' · ')
}
