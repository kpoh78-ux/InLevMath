// apps/web/scripts/test-sibling-pin.ts
import { prisma } from '../src/lib/db';
import { handleKioskPin, generateUniqueAttendancePin } from '../src/lib/attendanceService';

async function runSiblingVerification() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  🔍 [검증 시작] 형제자매 번호 중복 해결: [3630] [🔄] 커스텀 PIN 지정 & 키오스크 분기');
  console.log('═══════════════════════════════════════════════════════════════\n');

  try {
    const teacher = await prisma.teacher.findFirst();
    if (!teacher) throw new Error('교사 데이터가 필요합니다.');

    // ─────────────────────────────────────────────────────────────
    // 1. 동일 학부모 연락처를 공유하는 형제/자매 2명 설정
    //    형(오빠): 박도은 (초5, 기본 4자리: 6601)
    //    동생: 박서진 (초3, 기본 번호 중복 6601 -> 커스텀 PIN: 3630)
    // ─────────────────────────────────────────────────────────────
    const parentPhone = '01050016601';

    // 형제 A
    let userA = await prisma.user.findFirst({ where: { phone: '01050016601_A' } });
    if (!userA) {
      userA = await prisma.user.create({
        data: { name: '박도은', phone: '01050016601_A', role: 'student', password: 'dummy' },
      });
    }

    let studentA = await prisma.student.findFirst({ where: { userId: userA.id } });
    if (!studentA) {
      studentA = await prisma.student.create({
        data: {
          userId: userA.id,
          teacherId: teacher.id,
          grade: '초5',
          gradeLevel: '초',
          school: '수완초',
          parentName: '박학부모',
          parentPhone,
          attendancePin: '6601',
          status: 'ENROLLED',
        },
      });
    }

    // 형제 B
    let userB = await prisma.user.findFirst({ where: { phone: '01050016601_B' } });
    if (!userB) {
      userB = await prisma.user.create({
        data: { name: '박서진', phone: '01050016601_B', role: 'student', password: 'dummy' },
      });
    }

    let studentB = await prisma.student.findFirst({ where: { userId: userB.id } });
    if (!studentB) {
      studentB = await prisma.student.create({
        data: {
          userId: userB.id,
          teacherId: teacher.id,
          grade: '초3',
          gradeLevel: '초',
          school: '수완초',
          parentName: '박학부모',
          parentPhone,
          attendancePin: '6601', // 초기 상태: 형과 동일한 4자리로 중복 발생
          status: 'ENROLLED',
        },
      });
    }

    console.log('👥 [형제자매 초기 상태]');
    console.log(`  - 첫째 학생: ${userA.name} (출결 번호: ${studentA.attendancePin}, 학부모: ${studentA.parentPhone})`);
    console.log(`  - 둘째 학생: ${userB.name} (출결 번호: ${studentB.attendancePin}, 학부모: ${studentB.parentPhone})`);
    console.log('  ⚠️ 문제점: 두 학생 모두 [6601]로 번호가 충돌하여 키오스크 입력 시 구분 필요!\n');

    // ─────────────────────────────────────────────────────────────
    // 2. 선생님 앱 [학생 상세정보]에서 [🔄 랜덤 생성] 버튼 클릭 시뮬레이션
    // ─────────────────────────────────────────────────────────────
    console.log('👉 [단계 1] 선생님 앱 학생 상세정보 모달에서 [🔄] 버튼 클릭하여 고유 4자리 PIN 생성');
    const randomGeneratedPin = await generateUniqueAttendancePin();
    console.log(`  ├── 생성된 난수 PIN: [${randomGeneratedPin}]`);

    // 사용자가 직접 [3630]을 지정하여 저장하는 시나리오
    const customPin = '3630';
    console.log(`👉 [단계 2] 둘째 학생(박서진)의 출결 번호를 [${customPin}]으로 수정 후 [저장하기] 실행`);

    const updatedStudentB = await prisma.student.update({
      where: { id: studentB.id },
      data: { attendancePin: customPin },
      include: { user: true },
    });

    console.log(`  ├── DB 저장 완료: 학생 ID: ${updatedStudentB.id} -> attendancePin: [${updatedStudentB.attendancePin}]`);
    console.log('  🎉 둘째 학생에게 고유 출결 번호 [3630] 등록 완료!\n');

    // ─────────────────────────────────────────────────────────────
    // 3. 키오스크 4자리 입력 분기 검증
    // ─────────────────────────────────────────────────────────────
    console.log('👉 [단계 3] 키오스크에서 [3630] 입력 시 둘째(박서진)가 정확히 매칭되는지 검증');
    const matchB = await handleKioskPin('3630');
    console.log('  ├── 매칭된 학생 이름:', matchB.studentName);
    console.log('  ├── 학년:', matchB.grade);
    console.log('  ├── 처리 상태:', matchB.type);
    console.log('  └── 학부모 알림톡 발송 대상:', matchB.parentPhoneMasked);

    if (matchB.studentName !== '박서진') {
      throw new Error(`❌ 실패: 3630 입력 시 박서진 학생이 매칭되어야 하나 ${matchB.studentName}이(가) 매칭됨`);
    }
    console.log('  ✅ [3630] 입력 ➡️ 둘째(박서진) 정상 출결 확인!\n');

    console.log('👉 [단계 4] 키오스크에서 [6601] 입력 시 첫째(박도은)가 정확히 매칭되는지 검증');
    const matchA = await handleKioskPin('6601');
    console.log('  ├── 매칭된 학생 이름:', matchA.studentName);
    console.log('  ├── 학년:', matchA.grade);
    console.log('  ├── 처리 상태:', matchA.type);
    console.log('  └── 학부모 알림톡 발송 대상:', matchA.parentPhoneMasked);

    if (matchA.studentName !== '박도은') {
      throw new Error(`❌ 실패: 6601 입력 시 박도은 학생이 매칭되어야 하나 ${matchA.studentName}이(가) 매칭됨`);
    }
    console.log('  ✅ [6601] 입력 ➡️ 첫째(박도은) 정상 출결 확인!\n');

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  🏆 [최종 검증 완료] 형제자매 번호 중복 시 [3630] [🔄] 개별 PIN 지정 및 키오스크 분기 100% 정상 작동!');
    console.log('═══════════════════════════════════════════════════════════════');
  } catch (err) {
    console.error('검증 중 오류 발생:', err);
  } finally {
    await prisma.$disconnect();
  }
}

runSiblingVerification();
