import { AttendanceKiosk } from '@/components/kiosk/AttendanceKiosk';

export const metadata = {
  title: 'InLevMath 출결 키오스크 | 스마트 등하원 알림톡 시스템',
  description: '학생 4자리 번호 입력 기반 스마트 출결 및 학부모 알림톡 연동 키오스크',
};

export default function KioskPage() {
  return <AttendanceKiosk />;
}
