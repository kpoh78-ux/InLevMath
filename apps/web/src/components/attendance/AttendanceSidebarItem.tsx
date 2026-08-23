'use client';

// apps/web/src/components/attendance/AttendanceSidebarItem.tsx
import React, { useState, useEffect } from 'react';
import { X, Clock, HelpCircle, Check } from 'lucide-react';
import { apiFetch } from '@/lib/api';

export interface StudentAttendanceState {
  id: string;
  name: string;
  isCheckedIn?: boolean;
  attended?: boolean;
  checkInTime?: string;
  checkOutTime?: string;
  parentPhone?: string;
  grade?: string;
  attendancePin?: string;
}

interface Props {
  student: StudentAttendanceState;
  onUpdateAttendance?: (studentId: string, isCheckIn: boolean, time: string, sendSms: boolean) => Promise<void>;
  onSelect?: () => void;
  onStatusChanged?: () => void;
  isActive?: boolean;
}

export const AttendanceSidebarItem: React.FC<Props> = ({
  student,
  onUpdateAttendance,
  onSelect,
  onStatusChanged,
  isActive,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTime, setSelectedTime] = useState<string>('오전 10 : 12');
  const [sendSms, setSendSms] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [todayFormatted, setTodayFormatted] = useState<string>('2026년 08월 23일');

  const isCheckedIn = student.isCheckedIn ?? Boolean(student.checkInTime && !student.checkOutTime);

  useEffect(() => {
    const now = new Date();
    const hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? '오후' : '오전';
    const displayHour = String(hours % 12 || 12).padStart(2, '0');
    setSelectedTime(`${ampm} ${displayHour} : ${minutes}`);

    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    setTodayFormatted(`${y}년 ${m}월 ${d}일`);
  }, [isModalOpen]);

  const handleOpenModal = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsModalOpen(true);
  };

  const handleConfirm = async () => {
    setLoading(true);
    try {
      if (onUpdateAttendance) {
        await onUpdateAttendance(student.id, !isCheckedIn, selectedTime, sendSms);
      } else {
        const nextType = isCheckedIn ? 'CHECK_OUT' : 'CHECK_IN';
        const res = await apiFetch('/api/attendance/toggle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            studentId: student.id,
            type: nextType,
            sendNotification: sendSms,
          }),
        });
        if (!res.ok) {
          throw new Error('출결 처리 실패');
        }
        if (onStatusChanged) onStatusChanged();
        window.dispatchEvent(new CustomEvent('students-updated'));
      }
      setIsModalOpen(false);
    } catch (e) {
      alert('출결 상태 변경에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div
        onClick={onSelect}
        className={`flex items-center justify-between px-3 py-2 border-b border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer rounded-lg mx-1 ${
          isActive ? 'bg-indigo-50/80 font-bold text-indigo-950' : 'text-slate-800'
        }`}
      >
        <span className="text-xs font-medium truncate flex-1 pr-2">{student.name}</span>

        {/* ── 사진 1 UI 준수: 미등원 시 [출석], 등원 완료 시 [• 하원] 버튼 ── */}
        <button
          type="button"
          onClick={handleOpenModal}
          className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all active:scale-95 shrink-0 ${
            isCheckedIn
              ? 'bg-white border-slate-700 text-slate-900 shadow-2xs hover:bg-slate-100 flex items-center gap-1.5'
              : 'bg-white border-slate-300 text-slate-500 hover:border-slate-400 hover:text-slate-700'
          }`}
        >
          {isCheckedIn ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-slate-900 inline-block" />
              <span>하원</span>
            </>
          ) : (
            <span>출석</span>
          )}
        </button>
      </div>

      {/* ── 사진 2 UI 준수: 등원 / 하원 팝업 모달 ── */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setIsModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-slate-100 overflow-hidden animate-scale-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 모달 헤더 */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                {student.name} 학생 {isCheckedIn ? '하원' : '등원'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* 타임라인 인디케이터 */}
              <div className="flex items-center justify-between bg-slate-50 px-4 py-2.5 rounded-xl text-xs text-slate-600 font-mono">
                <span className="flex items-center gap-1.5 text-blue-600 font-bold">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  {student.checkInTime ? `등원 ${student.checkInTime}` : '등원 대기'}
                </span>
                <span className="text-slate-300">────────────────</span>
                <span className="flex items-center gap-1.5 text-slate-800 font-bold">
                  <span className="w-2 h-2 rounded-full bg-slate-700" />
                  {selectedTime}
                </span>
              </div>

              {/* 등원/하원 날짜 */}
              <div className="flex items-center justify-between text-sm">
                <span className="font-bold text-slate-700">{isCheckedIn ? '하원 날짜' : '등원 날짜'}</span>
                <span className="font-semibold text-slate-900">{todayFormatted}</span>
              </div>

              {/* 등원/하원 시간 셀렉터 */}
              <div className="flex items-center justify-between text-sm">
                <span className="font-bold text-slate-700">{isCheckedIn ? '하원 시간' : '등원 시간'}</span>
                <select
                  value={selectedTime}
                  onChange={(e) => setSelectedTime(e.target.value)}
                  className="px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                >
                  <option value="오전 09 : 00">오전 09 : 00</option>
                  <option value="오전 09 : 30">오전 09 : 30</option>
                  <option value="오전 10 : 00">오전 10 : 00</option>
                  <option value="오전 10 : 12">오전 10 : 12</option>
                  <option value="오후 01 : 00">오후 01 : 00</option>
                  <option value="오후 02 : 30">오후 02 : 30</option>
                  <option value="오후 04 : 00">오후 04 : 00</option>
                  <option value="오후 05 : 30">오후 05 : 30</option>
                  <option value="오후 07 : 00">오후 07 : 00</option>
                </select>
              </div>

              {/* 학부모 알림 문자/알림톡 전송 체크박스 */}
              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-blue-50/50 border border-blue-100 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={sendSms}
                  onChange={(e) => setSendSms(e.target.checked)}
                  className="mt-0.5 w-4 h-4 text-blue-600 rounded-sm focus:ring-blue-500"
                />
                <div>
                  <div className="text-xs font-bold text-slate-800 flex items-center gap-1">
                    <span>학부모에게 {isCheckedIn ? '하원' : '등원'} 안내 문자/알림톡 전송</span>
                    <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                  <span className="text-[11px] text-slate-500 block mt-0.5">
                    [문자 1건당 SMS 11원 / LMS 33원 • 알림톡 6.5원]
                  </span>
                </div>
              </label>

              {/* 제출 버튼 */}
              <button
                type="button"
                onClick={handleConfirm}
                disabled={loading}
                className="w-full py-3.5 rounded-xl bg-blue-500 hover:bg-blue-600 active:scale-98 text-white font-bold text-sm shadow-lg shadow-blue-500/20 transition-all disabled:opacity-50"
              >
                {loading ? '처리 중...' : isCheckedIn ? '하원하기' : '등원하기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
