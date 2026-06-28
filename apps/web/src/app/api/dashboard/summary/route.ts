import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')?.split(' ')[1]
  if (!auth) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  const payload = await verifyToken(auth)
  if (!payload || payload.role !== 'teacher') return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const teacher = await prisma.teacher.findFirst({ where: { userId: payload.sub } })
  if (!teacher) return NextResponse.json({ error: '선생님 정보 없음' }, { status: 404 })

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
    // 학생 전체 목록 (최근 미션 결과 포함)
    prisma.student.findMany({
      where: { teacherId: teacher.id },
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

    // 오늘 수업 시간표
    prisma.classSchedule.findMany({
      where: { teacherId: teacher.id, dayOfWeek: todayDow },
      orderBy: { startTime: 'asc' },
    }),

    // 최근 배포 10건
    prisma.worksheetDistribution.findMany({
      where: { worksheet: { teacherId: teacher.id } },
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
      studentNames: JSON.parse(s.studentNames) as string[],
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
