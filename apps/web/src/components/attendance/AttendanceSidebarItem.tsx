'use client';

// apps/web/src/components/attendance/AttendanceSidebarItem.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, HelpCircle, Trash2, Check } from 'lucide-react';
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
  memo?: string;
}

interface Props {
  student: StudentAttendanceState;
  onUpdateAttendance?: (studentId: string, isCheckIn: boolean, time: string, sendSms: boolean) => Promise<void>;
  onSelect?: () => void;
  onStatusChanged?: () => void;
  isActive?: boolean;
}

/** 등하원 1회 완료 기록 */
export interface CompletedRound {
  round: number;
  checkIn: string;
  checkOut: string;
  comment?: string;
}

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
  const [mounted, setMounted] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [checkInInput, setCheckInInput] = useState<string>('');
  const [checkOutInput, setCheckOutInput] = useState<string>('');
  const [memoInput, setMemoInput] = useState<string>('');
  const [sendSms, setSendSms] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [deleting, setDeleting] = useState<'CHECK_IN' | 'CHECK_OUT' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [todayFormatted, setTodayFormatted] = useState<string>('');
  const [completedRounds, setCompletedRounds] = useState<CompletedRound[]>([]);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 오늘 날짜 키 (YYYY-MM-DD)
  const getTodayKey = () => new Date().toLocaleDateString('sv-SE');

  // 다회차 완료 기록 로컬스토리지 헬퍼
  const loadCompletedRounds = useCallback((studentId: string): CompletedRound[] => {
    const todayKey = new Date().toLocaleDateString('sv-SE');
    const storageKey = `inlev_attendance_rounds_${studentId}_${todayKey}`;
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore
    }

    // 로컬스토리지에 없지만 student에 checkInTime과 checkOutTime이 모두 있다면 1차 완료로 복원
    if (student.checkInTime && student.checkOutTime) {
      const defaultRound: CompletedRound[] = [
        { round: 1, checkIn: student.checkInTime, checkOut: student.checkOutTime }
      ];
      try {
        localStorage.setItem(storageKey, JSON.stringify(defaultRound));
      } catch {}
      return defaultRound;
    }

    return [];
  }, [student.checkInTime, student.checkOutTime]);

  const saveCompletedRounds = (studentId: string, rounds: CompletedRound[]) => {
    const todayKey = new Date().toLocaleDateString('sv-SE');
    const storageKey = `inlev_attendance_rounds_${studentId}_${todayKey}`;
    try {
      localStorage.setItem(storageKey, JSON.stringify(rounds));
    } catch {}
  };

  // 모달 열릴 때 및 학생 prop 변경 시 completedRounds 동기화
  useEffect(() => {
    const rounds = loadCompletedRounds(student.id);
    setCompletedRounds(rounds);
  }, [student.id, student.checkInTime, student.checkOutTime, loadCompletedRounds]);

  /**
   * 현재 학생 출결 상태 판정
   * - isAttending: 현재 등원 상태 (checkInTime은 있고 checkOutTime은 없음)
   *   -> 하원 입력 화면 노출
   * - !isAttending: 등원 전이거나 이전 등하원이 완료된 상태
   *   -> 다음 등원 입력 화면 노출
   */
  const isAttending = Boolean(student.checkInTime && !student.checkOutTime);
  const currentRoundNumber = isAttending ? (completedRounds.length + 1) : (completedRounds.length + 1);
  const activeStep: 'CHECK_IN' | 'CHECK_OUT' = isAttending ? 'CHECK_OUT' : 'CHECK_IN';
  const busy = loading || deleting !== null;

  // 학생별 알림톡 자동 발송 체크 상태 로컬스토리지 헬퍼
  const getStudentSmsPref = (studentId: string): boolean => {
    try {
      const stored = localStorage.getItem(`inlev_student_sms_${studentId}`);
      if (stored !== null) {
        return stored === 'true';
      }
    } catch {}
    return true; // 기본값: 켜짐
  };

  const saveStudentSmsPref = (studentId: string, val: boolean) => {
    try {
      localStorage.setItem(`inlev_student_sms_${studentId}`, String(val));
    } catch {}
  };

  // 모달을 열 때 기존 기록 / 현재 시각으로 초기화한다
  const handleOpenModal = (e: React.MouseEvent) => {
    e.stopPropagation();

    const now = new Date();
    const nowValue = toTimeInputValue(now);

    const rounds = loadCompletedRounds(student.id);
    setCompletedRounds(rounds);

    if (isAttending) {
      setCheckInInput(student.checkInTime || nowValue);
      setCheckOutInput(nowValue);
    } else {
      setCheckInInput(nowValue);
      setCheckOutInput('');
    }

    setMemoInput(student.memo || '');
    setSendSms(getStudentSmsPref(student.id));
    setError(null);

    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
    const day = DAYS[now.getDay()];
    setTodayFormatted(`${y}년 ${m}월 ${d}일 (${day})`);

    setIsModalOpen(true);
  };

  const handleToggleSendSms = (checked: boolean) => {
    setSendSms(checked);
    saveStudentSmsPref(student.id, checked);
  };

  const setToNow = useCallback(() => {
    const nowValue = toTimeInputValue();
    if (activeStep === 'CHECK_IN') setCheckInInput(nowValue);
    else setCheckOutInput(nowValue);
  }, [activeStep]);

  const refreshAfterChange = useCallback(() => {
    if (onStatusChanged) onStatusChanged();
    window.dispatchEvent(new CustomEvent('students-updated'));
  }, [onStatusChanged]);

  const [savingMemo, setSavingMemo] = useState(false);
  const [memoSavedSuccess, setMemoSavedSuccess] = useState(false);

  /** 선생님 코멘트 단독 중간 저장 */
  const handleSaveMemo = async () => {
    setSavingMemo(true);
    setError(null);
    try {
      const todayDate = getTodayKey();
      const res = await apiFetch('/api/attendance/toggle', {
        method: 'POST',
        body: JSON.stringify({
          studentId: student.id,
          date: todayDate,
          type: 'MEMO',
          memo: memoInput.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '코멘트 저장에 실패했습니다.');
      }

      setMemoSavedSuccess(true);
      setTimeout(() => setMemoSavedSuccess(false), 2000);
      refreshAfterChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : '코멘트 저장에 실패했습니다.');
    } finally {
      setSavingMemo(false);
    }
  };

  const handleConfirm = async () => {
    const isCheckInSubmit = activeStep === 'CHECK_IN';
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
      const todayDate = getTodayKey();
      const targetType = isCheckInSubmit ? 'CHECK_IN' : 'CHECK_OUT';

      saveStudentSmsPref(student.id, sendSms);

      const res = await apiFetch('/api/attendance/toggle', {
        method: 'POST',
        body: JSON.stringify({
          studentId: student.id,
          date: todayDate,
          type: targetType,
          status: 'ON_TIME',
          time: targetTime,
          checkInTime: !isCheckInSubmit ? (checkInInput || student.checkInTime) : undefined,
          sendNotification: sendSms,
          memo: memoInput.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '출결 처리에 실패했습니다.');
      }

      // 하원 완료 시 completedRounds에 새 회차 추가 저장 (코멘트도 함께 기록)
      if (!isCheckInSubmit) {
        const effectiveCheckIn = checkInInput || student.checkInTime || targetTime;
        const newRound: CompletedRound = {
          round: completedRounds.length + 1,
          checkIn: effectiveCheckIn,
          checkOut: targetTime,
          comment: memoInput.trim() || undefined,
        };
        const updated = [...completedRounds, newRound];
        setCompletedRounds(updated);
        saveCompletedRounds(student.id, updated);
        // 학생이 하원하면 팝업 창에서는 선생님 코멘트 입력창 초기화
        setMemoInput('');
      }

      setIsModalOpen(false);
      refreshAfterChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : '출결 처리에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  /** 현재 등원 중인 기록 삭제 (등원 취소) */
  const handleDeleteCurrentCheckIn = async () => {
    if (!window.confirm(`${student.name} 학생의 현재 등원 기록을 취소하시겠습니까?`)) {
      return;
    }

    setDeleting('CHECK_IN');
    setError(null);

    try {
      const todayDate = getTodayKey();
      const res = await apiFetch('/api/attendance/record', {
        method: 'DELETE',
        body: JSON.stringify({
          studentId: student.id,
          target: 'CHECK_IN',
          date: todayDate,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '기록 삭제에 실패했습니다.');
      }

      setIsModalOpen(false);
      refreshAfterChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : '기록 삭제에 실패했습니다.');
    } finally {
      setDeleting(null);
    }
  };

  /** 완료된 특정 회차 등하원 기록 삭제 */
  const handleDeleteCompletedRound = (roundIdx: number) => {
    if (!window.confirm(`${roundIdx + 1}회차 등하원 기록을 목록에서 삭제하시겠습니까?`)) {
      return;
    }
    const updated = completedRounds.filter((_, idx) => idx !== roundIdx).map((r, idx) => ({
      ...r,
      round: idx + 1,
    }));
    setCompletedRounds(updated);
    saveCompletedRounds(student.id, updated);
  };

  return (
    <>
      <div
        onClick={onSelect}
        className={`flex items-center justify-between px-2 py-1.5 border-b border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer rounded-lg mx-0.5 ${
          isActive ? 'bg-indigo-50/80 font-bold text-indigo-950' : 'text-slate-800'
        }`}
      >
        <span className="text-xs font-medium truncate flex-1 pr-1">{student.name}</span>

        {/* ── 버튼 크기 고정(46x24): 등원 시 밝은 파란색, 하원 시 원래 색 복귀 ── */}
        <button
          type="button"
          onClick={handleOpenModal}
          title={isAttending ? '하원 시간 설정' : (completedRounds.length > 0 ? `${completedRounds.length}회차 완료 • 다음 등원 설정` : '등원 시간 설정')}
          className={`w-[46px] h-[24px] flex items-center justify-center rounded-full text-[11px] font-semibold border transition-all active:scale-95 shrink-0 ${
            isAttending
              ? 'bg-white border-blue-400 text-blue-500 hover:border-blue-500 hover:text-blue-600'
              : 'bg-white border-slate-300 text-slate-500 hover:border-slate-400 hover:text-slate-700'
          }`}
        >
          {isAttending ? '등원' : (completedRounds.length > 0 ? '하원' : '출석')}
        </button>
      </div>

      {/* ── 등원 / 하원 팝업 모달 (화면 중앙 정사각형 형태) ── */}
      {isModalOpen && mounted && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-[2px] p-4 transition-opacity"
          onClick={() => setIsModalOpen(false)}
        >
          <div
            className="w-full max-w-[480px] aspect-square max-h-[92vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col justify-between overflow-hidden transition-transform"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 1. 최상단 헤더: 구형 타이틀 제거, 파란 원형 '김' 제거, 학생명 + 학년 + 현재 상태 + [X] 닫기 */}
            <div className="flex items-center justify-between px-6 py-4 bg-slate-50/90 border-b border-slate-200 shrink-0">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-base text-slate-900">{student.name} 학생</span>
                {student.grade && (
                  <span className="text-xs text-blue-600 bg-white px-2 py-0.5 rounded-md font-bold border border-blue-200 shadow-2xs">
                    {student.grade}
                  </span>
                )}
                <span
                  className={`text-xs px-2.5 py-0.5 rounded-md font-bold border shadow-2xs ${
                    activeStep === 'CHECK_OUT'
                      ? 'bg-blue-50 text-blue-600 border-blue-200'
                      : 'bg-white text-slate-700 border-slate-200'
                  }`}
                >
                  {currentRoundNumber > 1 ? `${currentRoundNumber}차 ` : ''}
                  {activeStep === 'CHECK_OUT' ? '하원' : '등원'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
                aria-label="닫기"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 모달 본문 */}
            <div className="p-6 flex-1 flex flex-col justify-between gap-3 text-xs overflow-y-auto">
              {/* 2. 두번째 줄: 이전 완료된 등하원 기록 표시 & 현재 진행 상태 */}
              <div className="space-y-1.5 shrink-0">
                {completedRounds.length > 0 ? (
                  <div className="bg-slate-50 border border-slate-200/90 rounded-xl p-2.5 divide-y divide-slate-100">
                    <div className="text-[11px] font-bold text-slate-500 pb-1 flex items-center justify-between">
                      <span>오늘 완료된 등하원 기록</span>
                      <span className="text-blue-600 font-semibold">{completedRounds.length}회 완료</span>
                    </div>
                    {completedRounds.map((r, idx) => (
                      <div key={idx} className="py-1.5 text-xs flex flex-col gap-0.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-600 bg-white px-1.5 py-0.5 rounded border border-slate-200 text-[11px]">
                              {idx + 1}회차
                            </span>
                            <span className="text-slate-700">
                              등원 <strong className="text-blue-600">{toKoreanTime(r.checkIn)}</strong>
                              <span className="mx-1.5 text-slate-300">|</span>
                              하원 <strong className="text-slate-900">{toKoreanTime(r.checkOut)}</strong>
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteCompletedRound(idx)}
                            className="text-slate-300 hover:text-rose-500 p-1 rounded transition-colors"
                            title={`${idx + 1}회차 기록 삭제`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {r.comment && (
                          <div className="text-[11px] text-slate-500 bg-white/80 rounded-md px-2 py-1 border border-slate-200/60 mt-0.5 ml-1 leading-relaxed">
                            <span className="font-semibold text-slate-600">코멘트:</span> {r.comment}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-slate-50/70 border border-slate-100 rounded-xl px-3 py-2 text-center text-slate-400 text-xs">
                    오늘 등록된 등하원 기록이 없습니다.
                  </div>
                )}
              </div>

              {/* 날짜 표시 */}
              <div className="flex items-center justify-between text-sm px-1 shrink-0">
                <span className="font-bold text-slate-700 shrink-0 whitespace-nowrap">
                  {activeStep === 'CHECK_IN' ? '등원 날짜' : '하원 날짜'}
                </span>
                <span className="font-semibold text-slate-900 whitespace-nowrap">{todayFormatted}</span>
              </div>

              {/* 3. 등원/하원 시간 설정 분리 (동시에 나타나지 않고 상태에 따라 단독 노출) */}
              {activeStep === 'CHECK_IN' ? (
                /* ── 등원 전(출석하기 전): 등원 시간 설정만 단독 표시 ── */
                <div className="flex items-center justify-between text-sm px-1 shrink-0 bg-blue-50/40 p-3 rounded-xl border border-blue-100">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />
                    <span className="font-bold text-blue-950 shrink-0 whitespace-nowrap">
                      {currentRoundNumber > 1 ? `${currentRoundNumber}차 ` : ''}등원 시간
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="time"
                      value={checkInInput}
                      onChange={(e) => setCheckInInput(e.target.value)}
                      className="px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              ) : (
                /* ── 등원 후: 하원 시간 설정만 단독 표시 ── */
                <div className="flex items-center justify-between text-sm px-1 shrink-0 bg-indigo-50/40 p-3 rounded-xl border border-indigo-100">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 shrink-0" />
                      <span className="font-bold text-indigo-950 shrink-0 whitespace-nowrap">
                        {currentRoundNumber > 1 ? `${currentRoundNumber}차 ` : ''}하원 시간
                      </span>
                    </div>
                    {student.checkInTime && (
                      <span className="text-[11px] text-slate-400 pl-4.5 pt-0.5">
                        (등원 {toKoreanTime(student.checkInTime)})
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="time"
                      value={checkOutInput}
                      onChange={(e) => setCheckOutInput(e.target.value)}
                      className="px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={handleDeleteCurrentCheckIn}
                      disabled={busy}
                      title="현재 등원 취소"
                      aria-label="현재 등원 취소"
                      className="p-1.5 rounded-xl border border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-300 hover:bg-rose-50 transition-colors disabled:opacity-40"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* 지금 시각으로 버튼 */}
              <div className="flex justify-end shrink-0">
                <button
                  type="button"
                  onClick={setToNow}
                  className="px-3 py-1 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  지금 시각으로
                </button>
              </div>

              {/* 선생님 코멘트 3줄 작성란 (하원 시 포함 발송 & 수업 중 저장 유지) */}
              <div className="flex flex-col gap-1.5 shrink-0">
                <div className="flex items-center justify-between text-xs px-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-slate-700">선생님 코멘트</span>
                    <span className="text-[11px] text-slate-400 font-medium">(작성 시 알림톡 포함 발송)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {memoSavedSuccess && (
                      <span className="text-[11px] text-emerald-600 font-bold flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" /> 저장됨
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={handleSaveMemo}
                      disabled={savingMemo || !memoInput.trim()}
                      className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 text-xs font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                      title="하원 전 학생 관찰 코멘트를 미리 저장해둡니다 (하원 시 자동 발송)"
                    >
                      {savingMemo ? '저장 중...' : '코멘트 저장'}
                    </button>
                  </div>
                </div>
                <textarea
                  rows={3}
                  value={memoInput}
                  onChange={(e) => setMemoInput(e.target.value)}
                  placeholder="오늘 학습 태도, 진도 등 학부모님께 전달할 코멘트를 입력해주세요. (작성 후 '코멘트 저장'을 누르면 학생이 하원할 때까지 안전하게 보관됩니다)"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 transition-all resize-none leading-relaxed"
                />
              </div>

              {error && (
                <p className="text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 shrink-0">
                  {error}
                </p>
              )}

              {/* 학부모 알림 문자/알림톡 전송 체크박스 */}
              <label className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer select-none hover:bg-slate-100/80 transition-colors shrink-0">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-slate-800 flex items-center gap-1">
                    <span>학부모 알림톡 / SMS 문자 자동 발송</span>
                    <HelpCircle className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  </div>
                  <span className="text-[11px] text-slate-500 block mt-0.5">
                    [문자 1건당 SMS 11원 / LMS 33원 • 알림톡 6.5원]
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={sendSms}
                  onChange={(e) => handleToggleSendSms(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 shrink-0 cursor-pointer"
                />
              </label>
            </div>

            {/* 모달 하단 액션 버튼 */}
            <div className="flex items-center justify-end gap-2.5 px-6 py-3.5 bg-slate-50 border-t border-slate-200 shrink-0">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={busy}
                className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition-colors disabled:opacity-50"
              >
                {loading
                  ? '처리 중...'
                  : activeStep === 'CHECK_IN'
                    ? (currentRoundNumber > 1 ? `${currentRoundNumber}차 등원 처리 및 알림톡 발송` : '등원 처리 및 알림톡 발송')
                    : (currentRoundNumber > 1 ? `${currentRoundNumber}차 하원 처리 및 알림톡 발송` : '하원 처리 및 알림톡 발송')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
