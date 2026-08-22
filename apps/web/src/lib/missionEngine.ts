// apps/web/src/lib/missionEngine.ts
import { prisma } from '@/lib/prisma';
import { broadcastToStudentApp, broadcastToTeacher } from './sse';

export async function checkAndTriggerWeaknessMission(
  studentId: string,
  subUnitId: string,
  currentAccuracy: number
) {
  try {
    // 1. 해당 학생의 개별 설정 취약 기준 정답률 조회 (설정 없으면 기본 60.0%)
    const studentConfig = await prisma.studentWeaknessConfig.findUnique({
      where: { studentId },
    });

    const effectiveThreshold = studentConfig?.customThreshold ?? 60.0;

    // 학생의 개별 설정 기준치 이상이면 처방 미션 미생성
    if (currentAccuracy >= effectiveThreshold) {
      return { triggered: false, threshold: effectiveThreshold };
    }

    const [student, subUnit] = await Promise.all([
      prisma.student.findUnique({
        where: { id: studentId },
        include: { user: { select: { name: true } } },
      }),
      prisma.mathSubUnit.findUnique({
        where: { id: subUnitId },
        include: { middleUnit: { include: { majorUnit: true } } },
      }),
    ]);

    if (!subUnit) return { triggered: false, threshold: effectiveThreshold };

    const studentName = student?.user?.name || '학생';
    const subUnitName = subUnit.name;
    const majorUnitName = subUnit.middleUnit.majorUnit.name;
    const missionTitle = `[맞춤 클리닉] ${subUnitName} 정답률 복구 5제`;
    const voiceScript = `안녕하세요 ${studentName} 학생! 최근 ${subUnitName} 소단원의 정답률이 ${currentAccuracy}%로 선생님이 설정한 목표 기준(${effectiveThreshold}%)보다 다소 낮게 측정되었습니다. 약점을 빠르게 보완할 수 있는 5개의 맞춤형 클리닉 문제를 생성했습니다. 지금 도전해보세요!`;

    // 2. 처방 미션 생성
    const mission = await prisma.prescriptiveMission.create({
      data: {
        studentId,
        subUnitId,
        missionType: 'AI_AUTO_CLINIC',
        title: missionTitle,
        targetAccuracy: Math.min(100, effectiveThreshold + 20), // 설정 기준보다 +20% 높은 목표치 부여
        voiceMessage: voiceScript,
        isCompleted: false,
      },
    });

    // 3. 학생 앱으로 실시간 팝업 및 TTS 이벤트 발송
    broadcastToStudentApp(studentId, 'PRESCRIPTION_MISSION_ALERT', {
      missionId: mission.id,
      title: missionTitle,
      studentName,
      subUnitName,
      majorUnitName,
      accuracyRate: currentAccuracy,
      thresholdRate: effectiveThreshold,
      customThreshold: effectiveThreshold,
      voiceBriefing: voiceScript,
      voiceScript: voiceScript,
      problemCount: 5,
      actionUrl: `/student/missions/${mission.id}`,
    });

    // 4. 담당 교사 대시보드에도 실시간 취약 감지 팝업 전달
    if (student?.teacherId) {
      broadcastToTeacher(student.teacherId, {
        type: 'WEAKNESS_TRIGGERED',
        missionId: mission.id,
        studentId,
        studentName,
        subUnitId,
        subUnitName,
        majorUnitName,
        accuracyRate: currentAccuracy,
        customThreshold: effectiveThreshold,
        missionTitle,
        voiceBriefing: voiceScript,
        timestamp: new Date().toISOString(),
      });
    }

    return {
      triggered: true,
      missionId: mission.id,
      threshold: effectiveThreshold,
      missionTitle,
      voiceScript,
    };
  } catch (error) {
    console.error('[missionEngine] checkAndTriggerWeaknessMission error:', error);
    return { triggered: false };
  }
}
