import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTeacherAuth } from '@/lib/teacherAuth';
import { LearningTrackType } from '@prisma/client';

// GET /api/teacher/students/thresholds — 담당 학생별 취약 기준 정답률 목록 조회
export async function GET(req: NextRequest) {
  try {
    const auth = await getTeacherAuth(req);
    if (!auth) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });

    const students = await prisma.student.findMany({
      where: { teacherId: auth.teacherId, status: 'active' },
      include: {
        user: { select: { name: true } },
        weaknessConfig: true,
        subUnitStats: {
          select: { accuracyRate: true, totalSolved: true },
        },
      },
      orderBy: { user: { name: 'asc' } },
    });

    const result = students.map(st => {
      const config = st.weaknessConfig;
      const customThreshold = config?.customThreshold ?? 60.0;
      const trackType = (config?.trackType as 'BASIC' | 'STANDARD' | 'ADVANCED') ?? 'STANDARD';

      // 최근 평균 정답률 계산
      const solvedStats = st.subUnitStats.filter(s => s.totalSolved >= 3);
      const recentAccuracy = solvedStats.length > 0
        ? Math.round(solvedStats.reduce((sum, s) => sum + s.accuracyRate, 0) / solvedStats.length)
        : Math.round(st.avgCorrectRate ?? 70);

      // 현재 기준치 미달 취약 소단원 수 계산
      const weakUnitCount = st.subUnitStats.filter(
        s => s.totalSolved >= 5 && s.accuracyRate < customThreshold
      ).length;

      return {
        studentId: st.id,
        studentName: st.user.name,
        grade: st.grade || '',
        trackType,
        customThreshold,
        recentAccuracy,
        weakUnitCount,
      };
    });

    return NextResponse.json({ students: result });
  } catch (error: any) {
    console.error('[GET /api/teacher/students/thresholds] 에러:', error);
    return NextResponse.json({ error: error.message || '조회 실패' }, { status: 500 });
  }
}

// PUT /api/teacher/students/thresholds — 학생별 취약 기준 정답률 일괄 저장
export async function PUT(req: NextRequest) {
  try {
    const auth = await getTeacherAuth(req);
    if (!auth) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });

    const body = await req.json();
    const students: Array<{
      studentId: string;
      customThreshold: number;
      trackType?: 'BASIC' | 'STANDARD' | 'ADVANCED';
    }> = body.students || [];

    if (!Array.isArray(students) || students.length === 0) {
      return NextResponse.json({ error: '저장할 학생 데이터가 없습니다.' }, { status: 400 });
    }

    // 트랜잭션으로 upsert 처리
    await prisma.$transaction(
      students.map(st =>
        prisma.studentWeaknessConfig.upsert({
          where: { studentId: st.studentId },
          create: {
            studentId: st.studentId,
            customThreshold: Number(st.customThreshold) || 60.0,
            trackType: (st.trackType as LearningTrackType) || LearningTrackType.STANDARD,
          },
          update: {
            customThreshold: Number(st.customThreshold) || 60.0,
            ...(st.trackType ? { trackType: st.trackType as LearningTrackType } : {}),
          },
        })
      )
    );

    return NextResponse.json({ success: true, count: students.length });
  } catch (error: any) {
    console.error('[PUT /api/teacher/students/thresholds] 에러:', error);
    return NextResponse.json({ error: error.message || '저장 실패' }, { status: 500 });
  }
}
