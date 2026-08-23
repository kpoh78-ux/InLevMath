// apps/web/scripts/test-kiosk-attendance.ts
import { prisma } from '../src/lib/db';
import { handleKioskPin, confirmCheckOut } from '../src/lib/attendanceService';

async function runVerification() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  🔍 [검증 시작] 로비 키오스크 4자리 PIN 등·하원 & 학부모 알림톡 자동 발송');
  console.log('═══════════════════════════════════════════════════════════════\n');

  try {
    // 1. 테스트용 재원 학생 및 학부모 데이터 조회
    let testStudent = await prisma.student.findFirst({
      where: { status: { in: ['active', 'ENROLLED'] } },
      include: { user: true },
    });

    if (!testStudent) {
      console.log('⚠️ 테스트용 재원 학생이 없어 임시 학생을 조회합니다.');
      testStudent = await prisma.student.findFirst({
        include: { user: true },
      });
    }

    if (!testStudent) {
      throw new Error('데이터베이스에 학생 데이터가 존재하지 않습니다.');
    }

    const testPin = testStudent.attendancePin || testStudent.user.phone.replace(/[^0-9]/g, '').slice(-4);
    const todayStr = new Date().toISOString().slice(0, 10);

    console.log(`👤 대상 학생: ${testStudent.user.name} (${testStudent.grade})`);
    console.log(`📱 학생 전화번호: ${testStudent.user.phone} -> 끝 4자리 PIN: [${testPin}]`);
    console.log(`📞 학부모 연락처: ${testStudent.parentPhone}`);
    console.log(`📅 테스트 일자: ${todayStr}\n`);

    // 기존 당일 출결 기록 정리 (클린 테스트를 위해)
    await prisma.attendanceLog.deleteMany({
      where: {
        studentId: testStudent.id,
        date: todayStr,
      },
    });

    // ─────────────────────────────────────────────────────────────
    // 시나리오 1: 1차 PIN 입력 -> 등원 확인 및 학부모 알림톡 자동 발송 검증
    // ─────────────────────────────────────────────────────────────
    console.log(`👉 [시나리오 1] 학생이 키오스크에 4자리 PIN [${testPin}] 1차 입력 (등원)`);
    
    const checkInResult = await handleKioskPin(testPin);

    console.log('  ├── 반환 결과 Type:', checkInResult.type);
    console.log('  ├── 등원 시각:', checkInResult.checkInTime);
    console.log('  ├── 학부모 수신번호 마스킹:', checkInResult.parentPhoneMasked);
    console.log('  ├── 알림톡 발송 여부:', checkInResult.alimtalkSent ? '✅ 발송 성공 (비즈엠 템플릿: INLEV_ATTEND_IN)' : '❌ 실패');
    console.log('  └── 안내 메시지:', checkInResult.message);

    if (checkInResult.type !== 'CHECK_IN' || !checkInResult.alimtalkSent) {
      throw new Error('❌ 시나리오 1 실패: 1차 입력 시 등원 처리 및 알림톡 발송이 되지 않았습니다.');
    }
    console.log('  🎉 [시나리오 1 통과] 1차 입력 시 정상 등원 완료 및 학부모 알림톡 자동 발송 확인!\n');

    // DB 기록 확인
    const logAfterCheckIn = await prisma.attendanceLog.findFirst({
      where: { studentId: testStudent.id, date: todayStr },
    });
    console.log('  [DB 검증] AttendanceLog:', {
      type: logAfterCheckIn?.type,
      status: logAfterCheckIn?.status,
      checkInTime: logAfterCheckIn?.checkInTime,
      alimtalkSent: logAfterCheckIn?.alimtalkSent,
    });
    console.log('');

    // ─────────────────────────────────────────────────────────────
    // 시나리오 2: 등원 중 상태에서 2차 PIN 입력 -> [퇴원하기] 팝업 대기 상태 검증
    // ─────────────────────────────────────────────────────────────
    console.log(`👉 [시나리오 2] 등원 상태에서 학생이 키오스크에 4자리 PIN [${testPin}] 2차 입력 (수업 종료 후)`);
    const intermediateResult = await handleKioskPin(testPin);

    console.log('  ├── 반환 결과 Type:', intermediateResult.type);
    console.log('  ├── 기존 등원 시각:', intermediateResult.checkInTime);
    console.log('  └── 안내 메시지:', intermediateResult.message);

    if (intermediateResult.type !== 'NEED_CHECK_OUT') {
      throw new Error('❌ 시나리오 2 실패: 등원 중 2차 입력 시 NEED_CHECK_OUT(퇴원하기 팝업 버튼) 상태가 아닙니다.');
    }
    console.log('  🎉 [시나리오 2 통과] 2차 입력 시 [퇴원하기] 대형 팝업 버튼 유도 정상 동작!\n');

    // ─────────────────────────────────────────────────────────────
    // 시나리오 3: [지금 퇴원하기] 버튼 터치 -> 하원 완료 & 하원 알림톡 자동 발송 검증
    // ─────────────────────────────────────────────────────────────
    console.log('👉 [시나리오 3] 키오스크 화면의 대형 [지금 퇴원하기] 버튼 클릭');
    const checkOutResult = await confirmCheckOut(testPin);

    console.log('  ├── 반환 결과 Type:', checkOutResult.type);
    console.log('  ├── 등원 시각:', checkOutResult.checkInTime);
    console.log('  ├── 하원 시각:', checkOutResult.checkOutTime);
    console.log('  ├── 하원 알림톡 발송 여부:', checkOutResult.alimtalkSent ? '✅ 발송 성공 (비즈엠 템플릿: INLEV_ATTEND_OUT)' : '❌ 실패');
    console.log('  └── 안내 메시지:', checkOutResult.message);

    if (checkOutResult.type !== 'CHECK_OUT' || !checkOutResult.alimtalkSent) {
      throw new Error('❌ 시나리오 3 실패: 퇴원하기 버튼 터치 시 하원 완료 및 알림톡 발송이 되지 않았습니다.');
    }
    console.log('  🎉 [시나리오 3 통과] 하원 확정 및 하원 알림톡 자동 발송 확인!\n');

    // ─────────────────────────────────────────────────────────────
    // 시나리오 4: 하원 완료 후 재입력 -> 이미 하원 완료 안내 검증
    // ─────────────────────────────────────────────────────────────
    console.log(`👉 [시나리오 4] 하원 완료 후 다시 PIN [${testPin}] 입력 시`);
    const alreadyResult = await handleKioskPin(testPin);
    console.log('  ├── 반환 결과 Type:', alreadyResult.type);
    console.log('  └── 안내 메시지:', alreadyResult.message);

    if (alreadyResult.type !== 'ALREADY_CHECKED_OUT') {
      throw new Error('❌ 시나리오 4 실패: 하원 완료 상태 판별 오류');
    }
    console.log('  🎉 [시나리오 4 통과] 중복 입력 방지 및 당일 하원 완료 상태 정확 판별!\n');

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  🏆 [최종 검증 완료] 모든 키오스크 등·하원 및 학부모 알림톡 시나리오가 100% 정상 작동합니다!');
    console.log('═══════════════════════════════════════════════════════════════');
  } catch (err) {
    console.error('검증 중 오류 발생:', err);
  } finally {
    await prisma.$disconnect();
  }
}

runVerification();
