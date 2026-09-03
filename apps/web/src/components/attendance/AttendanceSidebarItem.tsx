'use client';

// apps/web/src/components/attendance/AttendanceSidebarItem.tsx
import React, { useState, useCallback } from 'react';
import { X, HelpCircle, Trash2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';

export interface StudentAttendanceState {
  id: string;
  name: string;
  isCheckedIn?: boolean;
  attended?: boolean;
  /** "HH:mm" 24시간 형식 */
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

/** 등원 전 → 하원 전 → 하원 완료(수정만 가능) */
type AttendanceMode = 'CHECK_IN' | 'CHECK_OUT' | 'DONE';

/** Date → "HH:mm" (input[type=time]가 요구하는 24시간 형식) */
function toTimeInputValue(date: Date = new Date()): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** "HH:mm" → "오전 02 : 17" (화면 표시용) */
function toKoreanTime(value?: string): string {
  if (!value) return '';
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(value.trim());
  if (!m) return value;
  const hour = Number(m[1]);
  const ampm = hour >= 12 ? '오후' : '오전';
  return `${ampm} ${String(hour % 12 || 12).padStart(2, '0')} : ${m[2].padStart(2, '0')}`;
}

export const AttendanceSidebarItem: React.FC<Props> = ({
  student,
  onUpdateAttendance,
  onSelect,
  onStatusChanged,
  isActive,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [checkInInput, setCheckInInput] = useState<string>('');
  const [checkOutInput, setCheckOutInput] = useState<string>('');
  const [sendSms, setSendSms] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [deleting, setDeleting] = useState<'CHECK_IN' | 'CHECK_OUT' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [todayFormatted, setTodayFormatted] = useState<string>('');

  const hasCheckedIn = Boolean(student.checkInTime);
  const hasCheckedOut = Boolean(student.checkOutTime);
  const mode: AttendanceMode = hasCheckedOut ? 'DONE' : hasCheckedIn ? 'CHECK_OUT' : 'CHECK_IN';
  const busy = loading || deleting !== null;

  const modeLabel = mode === 'CHECK_IN' ? '등원' : mode === 'CHECK_OUT' ? '하원' : '출결 시간 수정';

  // 모달을 열 때 기존 기록 / 현재 시각으로 초기화한다
  const handleOpenModal = (e: React.MouseEvent) => {
    e.stopPropagation();

    const now = new Date();
    const nowValue = toTimeInputValue(now);

    setCheckInInput(student.checkInTime || nowValue);
    setCheckOutInput(student.checkOutTime || nowValue);
    // 이미 끝난 출결을 고치는 중이라면 학부모에게 다시 알리지 않는 쪽이 기본값
    setSendSms(mode !== 'DONE');
    setError(null);

    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    setTodayFormatted(`${y}년 ${m}월 ${d}일`);

    setIsModalOpen(true);
  };

  const setToNow = useCallback(() => {
    const nowValue = toTimeInputValue();
    if (mode === 'CHECK_IN') setCheckInInput(nowValue);
    else setCheckOutInput(nowValue);
  }, [mode]);

  const refreshAfterChange = useCallback(() => {
    if (onStatusChanged) onStatusChanged();
    window.dispatchEvent(new CustomEvent('students-updated'));
  }, [onStatusChanged]);

  const handleConfirm = async () => {
    const isCheckInSubmit = mode === 'CHECK_IN';
    const targetTime = isCheckInSubmit ? checkInInput : checkOutInput;

    if (!targetTime) {
      setError(`${isCheckInSubmit ? '등원' : '하원'} 시간을 입력하세요.`);
      return;
    }
    if (!isCheckInSubmit && checkInInput && checkOutInput < checkInInput) {
      setError('하원 시간은 등원 시간보다 빠를 수 없습니다.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      if (onUpdateAttendance) {
        await onUpdateAttendance(student.id, isCheckInSubmit, targetTime, sendSms);
      } else {
        const res = await apiFetch('/api/attendance/toggle', {
          method: 'POST',
          body: JSON.stringify({
            studentId: student.id,
            type: isCheckInSubmit ? 'CHECK_IN' : 'CHECK_OUT',
            time: targetTime,
            // 하원 처리·수정 시 등원 시각도 함께 고칠 수 있다
            ...(isCheckInSubmit ? {} : { checkInTime: checkInInput }),
            sendNotification: sendSms,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || '출결 처리 실패');
        }
        refreshAfterChange();
      }
      setIsModalOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : '출결 상태 변경에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  /** 잘못 등록한 등원/하원 기록 삭제 */
  const handleDelete = async (target: 'CHECK_IN' | 'CHECK_OUT') => {
    const message =
      target === 'CHECK_IN'
        ? `${student.name} 학생의 오늘 출결 기록을 삭제할까요?\n등원 기록을 지우면 하원 기록도 함께 사라지고 미등원 상태로 돌아갑니다.`
        : `${student.name} 학생의 하원 기록을 삭제할까요?\n등원 기록은 그대로 두고 '하원 전' 상태로 되돌립니다.`;

    if (!window.confirm(message)) return;

    setDeleting(target);
    setError(null);
    try {
      const res = await apiFetch('/api/attendance/record', {
        method: 'DELETE',
        body: JSON.stringify({ studentId: student.id, target }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || '출결 기록 삭제 실패');
      }
      refreshAfterChange();
      setIsModalOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : '출결 기록 삭제에 실패했습니다.');
    } finally {
      setDeleting(null);
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
        <span className="text-sm font-medium truncate flex-1 pr-2">{student.name}</span>

        {/* ── 미등원 [출석] / 등원 완료 [• 하원] / 하원 완료 [완료] ── */}
        <button
          type="button"
          onClick={handleOpenModal}
          title={mode === 'DONE' ? '출결 시간 수정 · 삭제' : undefined}
          className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all active:scale-95 shrink-0 ${
            mode === 'CHECK_OUT'
              ? 'bg-white border-slate-700 text-slate-900 shadow-2xs hover:bg-slate-100 flex items-center gap-1.5'
              : mode === 'DONE'
                ? 'bg-slate-100 border-slate-200 text-slate-500 hover:bg-slate-200 flex items-center gap-1.5'
                : 'bg-white border-slate-300 text-slate-500 hover:border-slate-400 hover:text-slate-700'
          }`}
        >
          {mode === 'CHECK_OUT' && (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-slate-900 inline-block" />
              <span>하원</span>
            </>
          )}
          {mode === 'DONE' && (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 inline-block" />
              <span>완료</span>
            </>
          )}
          {mode === 'CHECK_IN' && <span>출석</span>}
        </button>
      </div>

      {/* ── 등원 / 하원 / 수정 팝업 모달 ── */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setIsModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl w-[min(90vw,26rem)] shadow-2xl border border-slate-100 overflow-hidden animate-scale-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 모달 헤더 */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                {student.name} 학생 {modeLabel}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* 등원 → 하원 타임라인 (조절 중인 시각이 실시간 반영된다) */}
              <div className="flex items-center justify-between bg-slate-50 px-4 py-3 rounded-xl text-xs">
                <span className="flex flex-col items-start gap-0.5 shrink-0 whitespace-nowrap">
                  <span className="flex items-center gap-1.5 font-bold text-blue-600 whitespace-nowrap">
                    <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                    등원
                  </span>
                  <span className="font-mono font-bold text-slate-800 pl-3.5 whitespace-nowrap">
                    {toKoreanTime(checkInInput) || '—'}
                  </span>
                </span>

                <span className="flex-1 mx-3 border-t border-dashed border-slate-300" />

                <span className="flex flex-col items-end gap-0.5 shrink-0 whitespace-nowrap">
                  <span
                    className={`flex items-center gap-1.5 font-bold whitespace-nowrap ${
                      mode === 'CHECK_IN' ? 'text-slate-400' : 'text-slate-800'
                    }`}
                  >
                    하원
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${mode === 'CHECK_IN' ? 'bg-slate-300' : 'bg-slate-700'}`}
                    />
                  </span>
                  <span className="font-mono font-bold text-slate-800 pr-3.5 whitespace-nowrap">
                    {mode === 'CHECK_IN' ? '하원 전' : toKoreanTime(checkOutInput) || '—'}
                  </span>
                </span>
              </div>

              {/* 날짜 */}
              <div className="flex items-center justify-between text-sm">
                <span className="font-bold text-slate-700 shrink-0 whitespace-nowrap">
                  {mode === 'CHECK_IN' ? '등원 날짜' : '하원 날짜'}
                </span>
                <span className="font-semibold text-slate-900 whitespace-nowrap">{todayFormatted}</span>
              </div>

              {/* 등원 시간 — 하원 처리 중에도 잘못 찍힌 등원 시각을 고치거나 지울 수 있다 */}
              <div className="flex items-center justify-between text-sm">
                <span className="font-bold text-slate-700 shrink-0 whitespace-nowrap">등원 시간</span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="time"
                    value={checkInInput}
                    onChange={(e) => setCheckInInput(e.target.value)}
                    className="px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  />
                  {hasCheckedIn && (
                    <button
                      type="button"
                      onClick={() => handleDelete('CHECK_IN')}
                      disabled={busy}
                      title="등원 기록 삭제 (오늘 출결 전체 삭제)"
                      aria-label="등원 기록 삭제"
                      className="p-2 rounded-xl border border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-300 hover:bg-rose-50 transition disabled:opacity-40"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* 하원 시간 */}
              {mode !== 'CHECK_IN' && (
                <div className="flex items-center justify-between text-sm">
                  <span className="font-bold text-slate-700 shrink-0 whitespace-nowrap">하원 시간</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="time"
                      value={checkOutInput}
                      onChange={(e) => setCheckOutInput(e.target.value)}
                      className="px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                    />
                    {hasCheckedOut ? (
                      <button
                        type="button"
                        onClick={() => handleDelete('CHECK_OUT')}
                        disabled={busy}
                        title="하원 기록 삭제 ('하원 전' 상태로 되돌림)"
                        aria-label="하원 기록 삭제"
                        className="p-2 rounded-xl border border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-300 hover:bg-rose-50 transition disabled:opacity-40"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    ) : (
                      // 삭제 버튼 자리를 비워 입력란 위치가 흔들리지 않게 한다
                      <span className="w-9" />
                    )}
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={setToNow}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-[11px] font-bold text-slate-600 hover:bg-slate-50 transition"
                >
                  지금 시각으로
                </button>
              </div>

              {error && (
                <p className="text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                  {error}
                </p>
              )}

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
                    <span>학부모에게 {mode === 'CHECK_IN' ? '등원' : '하원'} 안내 문자/알림톡 전송</span>
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
                disabled={busy}
                className="w-full py-3.5 rounded-xl bg-blue-500 hover:bg-blue-600 active:scale-98 text-white font-bold text-sm shadow-lg shadow-blue-500/20 transition-all disabled:opacity-50"
              >
                {loading
                  ? '처리 중...'
                  : mode === 'CHECK_IN'
                    ? '등원하기'
                    : mode === 'CHECK_OUT'
                      ? '하원하기'
                      : '시간 저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
