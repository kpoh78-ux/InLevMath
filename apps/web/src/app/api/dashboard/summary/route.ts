import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken } from '@/lib/auth'
import { academyTeacher } from '@/lib/academy'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')?.split(' ')[1]
  if (!auth) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  const payload = await verifyToken(auth)
  if (!payload || payload.role !== 'teacher') return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  // 학생·학습지·배포는 학원 공용이라 대표 계정 기준으로 읽는다
  const teacher = await academyTeacher(payload.sub)
  if (!teacher) return NextResponse.json({ error: '선생님 정보 없음' }, { status: 404 })

  // 시간표만은 예외 — 수업은 맡은 선생님 본인 것이다.
  // 여기까지 대표 계정으로 읽으면 다른 선생님이 자기 시간표를 넣어도
  // 본인 학원현황의 "오늘의 수업"에 나오지 않는다.
  const me = await prisma.teacher.findUnique({
    where: { userId: payload.sub },
    select: { id: true },
  })
  const myTeacherId = me?.id ?? teacher.id

  // JS getDay(): 0=일,1=월,...6=토 → 내부 0=월,1=화,...6=일 변환
  const jsDay = new Date().getDay()
  const todayDow = jsDay === 0 ? 6 : jsDay - 1

  const [
    students,
    worksheets,
    distributionStats,
    todaySchedule,
    recentDistributions,
  ] = await Promise.all([
    // 재원 학생 목록 (최근 미션 결과 포함) — 퇴원 학생은 현황에서 제외한다
    prisma.student.findMany({
      where: { teacherId: teacher.id, status: 'active' },
      include: {
        user: { select: { name: true } },
        results: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { currentLevel: 'desc' },
    }),

    // 학습지 전체
    prisma.worksheet.findMany({
      where: { teacherId: teacher.id },
      select: { id: true, grade: true, step: true, answersJson: true },
    }),

    // 배포 통계
    prisma.worksheetDistribution.groupBy({
      by: ['status'],
      where: { worksheet: { teacherId: teacher.id } },
      _count: { _all: true },
    }),

    // 오늘 수업 시간표 — 로그인한 선생님 본인 수업만.
    // 학원 전체를 보려면 학원관리 → 수업 시간표의 "학원 전체" 탭을 쓴다.
    prisma.classSchedule.findMany({
      where: { teacherId: myTeacherId, dayOfWeek: todayDow },
      orderBy: { startTime: 'asc' },
      include: {
        students: { select: { student: { select: { user: { select: { name: true } } } } } },
      },
    }),

    // 최근 배포 10건 (숨김 처리된 건 제외 — 집계 통계에는 그대로 포함)
    prisma.worksheetDistribution.findMany({
      where: { worksheet: { teacherId: teacher.id }, hiddenAt: null },
      include: {
        worksheet: { select: { title: true, step: true, examSubType: true, problemCount: true } },
        student:   { include: { user: { select: { name: true } } } },
        result:    { select: { correctProblems: true } },
      },
      orderBy: { distributedAt: 'desc' },
      take: 10,
    }),
  ])

  const distTotal   = distributionStats.reduce((s, d) => s + d._count._all, 0)
  const distGraded  = distributionStats.find(d => d.status === 'graded')?._count._all ?? 0
  const distPending = distTotal - distGraded

  const worksheetsWithAnswers = worksheets.filter(w => {
    if (!w.answersJson) return false
    try { return (JSON.parse(w.answersJson) as string[]).some(a => a.trim() !== '') }
    catch { return false }
  }).length

  return NextResponse.json({
    studentCount:   students.length,
    worksheetCount: worksheets.length,
    worksheetsWithAnswers,
    distTotal,
    distGraded,
    distPending,

    students: students.map(s => ({
      id:             s.id,
      name:           s.user.name,
      school:         s.school,
      grade:          s.grade,
      currentLevel:   s.currentLevel,
      currentMission: s.currentMission,
      comprehension:  s.comprehension,
      reasoning:      s.reasoning,
      calculation:    s.calculation,
      lastActivity:   s.results[0]?.createdAt ?? null,
    })),

    todaySchedule: todaySchedule.map(s => ({
      id:           s.id,
      dayOfWeek:    s.dayOfWeek,
      startTime:    s.startTime,
      endTime:      s.endTime,
      subject:      s.subject,
      grade:        s.grade,
      studentNames: s.students.map(v => v.student.user.name),
    })),

    recentDistributions: recentDistributions.map(d => ({
      id:             d.id,
      studentName:    d.student.user.name,
      studentGrade:   d.student.grade,
      worksheetTitle: d.worksheet.title,
      step:           d.worksheet.step,
      examSubType:    d.worksheet.examSubType,
      problemCount:   d.worksheet.problemCount,
      status:         d.status,
      correctProblems: d.result?.correctProblems ?? null,
      distributedAt:  d.distributedAt,
    })),
  })
}
