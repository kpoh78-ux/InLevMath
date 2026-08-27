'use client';

// apps/web/src/components/attendance/MonthlyAttendanceCalendar.tsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Download, Plus, Trash2, Send } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { AttendanceReportModal } from '@/components/attendance/AttendanceReportModal';

interface Props {
  studentName?: string;
  studentGrade?: string;
  studentId?: string;
  /** 출결을 등록/삭제해 목록 뱃지를 갱신해야 할 때 */
  onChanged?: () => void;
}

interface AttendanceLogItem {
  id: string;
  date: string; // "YYYY-MM-DD"
  status: string;
  checkInTime: string; // "오전 10:11" (없으면 '')
  checkOutTime: string;
  lateMinutes?: number | null;
}

interface MonthlySummary {
  checkIns: number;
  checkOuts: number;
  absents: number;
  late: number;
}

interface CalendarCell {
  day: number;
  date: string;
  inMonth: boolean;
  weekday: number; // 0=일
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toDateString(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** 해당 월의 6주(42칸) 그리드를 실제 날짜로 만든다 */
function buildCalendar(year: number, month: number): CalendarCell[] {
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const daysThisMonth = new Date(year, month, 0).getDate();
  const daysPrevMonth = new Date(year, month - 1, 0).getDate();

  const cells: CalendarCell[] = [];

  for (let i = 0; i < 42; i++) {
    const offset = i - firstWeekday;
    let cellYear = year;
    let cellMonth = month;
    let day: number;
    let inMonth = true;

    if (offset < 0) {
      day = daysPrevMonth + offset + 1;
      cellMonth = month - 1;
      inMonth = false;
    } else if (offset >= daysThisMonth) {
      day = offset - daysThisMonth + 1;
      cellMonth = month + 1;
      inMonth = false;
    } else {
      day = offset + 1;
    }

    if (cellMonth === 0) {
      cellMonth = 12;
      cellYear -= 1;
    } else if (cellMonth === 13) {
      cellMonth = 1;
      cellYear += 1;
    }

    cells.push({
      day,
      date: toDateString(cellYear, cellMonth, day),
      inMonth,
      weekday: i % 7,
    });
  }

  return cells;
}

/** 선생님이 직접 지정할 수 있는 출결 상태 */
const STATUS_OPTIONS = [
  { value: 'ON_TIME', label: '정상', type: 'CHECK_IN', needsTime: true },
  { value: 'LATE', label: '지각', type: 'CHECK_IN', needsTime: true },
  { value: 'ABSENT', label: '결석', type: 'ABSENT', needsTime: false },
  { value: 'MAKEUP', label: '보강', type: 'MAKEUP', needsTime: true },
] as const;

type StatusValue = (typeof STATUS_OPTIONS)[number]['value'];

/** 지각 정도(분). 60은 "60분 이상"을 뜻한다 */
const LATE_MINUTE_OPTIONS = [10, 20, 30, 40, 50, 60] as const;

function lateLabel(m: number): string {
  return m >= 60 ? '60분 이상' : `${m}분`;
}

function statusLabel(status: string): string {
  if (status === 'LATE') return '지각';
  if (status === 'ABSENT') return '결석';
  if (status === 'MAKEUP') return '보강';
  if (status === 'EXCUSED') return '사유결석';
  return '정상';
}

export const MonthlyAttendanceCalendar: React.FC<Props> = ({
  studentName = '',
  studentGrade,
  studentId,
  onChanged,
}) => {
  const today = useMemo(() => new Date(), []);
  const todayString = toDateString(today.getFullYear(), today.getMonth() + 1, today.getDate());

  const [currentYear, setCurrentYear] = useState<number>(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(today.getMonth() + 1);
  const [selectedDate, setSelectedDate] = useState<string>(todayString);

  const [logsByDate, setLogsByDate] = useState<Record<string, AttendanceLogItem>>({});
  const [summary, setSummary] = useState<MonthlySummary>({ checkIns: 0, checkOuts: 0, absents: 0, late: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 수동 등록 폼
  const [addOpen, setAddOpen] = useState(false);
  const [addStatus, setAddStatus] = useState<StatusValue>('ON_TIME');
  const [addLateMinutes, setAddLateMinutes] = useState<number>(10);
  const [addCheckIn, setAddCheckIn] = useState('');
  const [addCheckOut, setAddCheckOut] = useState('');
  const [saving, setSaving] = useState(false);

  // 출결 알림톡 발송 모달
  const [reportOpen, setReportOpen] = useState(false);

  const cells = useMemo(() => buildCalendar(currentYear, currentMonth), [currentYear, currentMonth]);

  const fetchMonthlyData = useCallback(async () => {
    if (!studentId) {
      setLogsByDate({});
      setSummary({ checkIns: 0, checkOuts: 0, absents: 0, late: 0 });
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(
        `/api/attendance/monthly?studentId=${studentId}&year=${currentYear}&month=${currentMonth}`
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || '월별 출결을 불러오지 못했습니다.');
      }

      const data = await res.json();
      const map: Record<string, AttendanceLogItem> = {};
      (data.logs || []).forEach((l: AttendanceLogItem) => {
        map[l.date] = l;
      });

      setLogsByDate(map);
      setSummary(
        data.summary || { checkIns: 0, checkOuts: 0, absents: 0, late: 0 }
      );
    } catch (e) {
      setLogsByDate({});
      setError(e instanceof Error ? e.message : '월별 출결을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [studentId, currentYear, currentMonth]);

  useEffect(() => {
    fetchMonthlyData();
  }, [fetchMonthlyData]);

  // 달을 옮기면 그 달의 1일을 선택한다 (이번 달이면 오늘)
  const goToMonth = (year: number, month: number) => {
    setCurrentYear(year);
    setCurrentMonth(month);
    setAddOpen(false);
    setSelectedDate(
      year === today.getFullYear() && month === today.getMonth() + 1
        ? todayString
        : toDateString(year, month, 1)
    );
  };

  const goPrevMonth = () =>
    currentMonth === 1 ? goToMonth(currentYear - 1, 12) : goToMonth(currentYear, currentMonth - 1);
  const goNextMonth = () =>
    currentMonth === 12 ? goToMonth(currentYear + 1, 1) : goToMonth(currentYear, currentMonth + 1);

  const selectedLog = logsByDate[selectedDate];
  const selectedDay = Number(selectedDate.split('-')[2]);
  const needsTime = STATUS_OPTIONS.find((o) => o.value === addStatus)?.needsTime ?? true;

  /** 선택한 날짜의 출결 기록 삭제 */
  const handleDeleteRecord = async () => {
    if (!studentId || !selectedLog) return;
    if (!window.confirm(`${currentMonth}월 ${selectedDay}일 출결 기록을 삭제할까요?\n등원·하원 기록이 모두 사라집니다.`)) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch('/api/attendance/record', {
        method: 'DELETE',
        body: JSON.stringify({ studentId, target: 'CHECK_IN', date: selectedDate }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || '출결 기록 삭제 실패');
      }
      await fetchMonthlyData();
      if (onChanged) onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : '출결 기록 삭제에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  /** 출결 상태 지정 (정상·지각·결석·보강) */
  const handleSaveRecord = async () => {
    if (!studentId) return;

    const option = STATUS_OPTIONS.find((o) => o.value === addStatus)!;

    if (option.needsTime && !addCheckIn) {
      setError('등원 시간을 입력하세요.');
      return;
    }
    if (addCheckOut && addCheckIn && addCheckOut < addCheckIn) {
      setError('하원 시간은 등원 시간보다 빠를 수 없습니다.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const body = !option.needsTime
        ? // 결석은 등·하원 시각 없이 상태만 기록한다
          { studentId, type: option.type, status: addStatus, date: selectedDate }
        : addCheckOut
          ? {
              studentId,
              type: 'CHECK_OUT',
              status: addStatus,
              date: selectedDate,
              time: addCheckOut,
              checkInTime: addCheckIn,
            }
          : { studentId, type: option.type, status: addStatus, date: selectedDate, time: addCheckIn };

      // 지각일 때만 분을 함께 보낸다
      const payload = addStatus === 'LATE' ? { ...body, lateMinutes: addLateMinutes } : body;

      const res = await apiFetch('/api/attendance/toggle', {
        method: 'POST',
        // 지난 날짜를 정리하는 작업이므로 학부모 알림은 보내지 않는다
        body: JSON.stringify({ ...payload, sendNotification: false }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || '출결 기록 저장 실패');
      }

      setAddOpen(false);
      await fetchMonthlyData();
      if (onChanged) onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : '출결 기록 저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const openAddForm = () => {
    const existing = logsByDate[selectedDate];
    const known = STATUS_OPTIONS.find((o) => o.value === existing?.status);
    setAddStatus(known ? known.value : 'ON_TIME');
    setAddLateMinutes(existing?.lateMinutes ?? 10);
    setAddCheckIn('');
    setAddCheckOut('');
    setError(null);
    setAddOpen((prev) => !prev);
  };

  /** 실제 기록만 CSV로 내려받는다 */
  const handleDownload = () => {
    const rows = Object.values(logsByDate).sort((a, b) => a.date.localeCompare(b.date));
    if (rows.length === 0) {
      setError('내려받을 출결 기록이 없습니다.');
      return;
    }

    const csvContent =
      '﻿' +
      '날짜,학생명,등원시각,하원시각,상태\n' +
      rows
        .map((r) => `${r.date},${studentName},${r.checkInTime || ''},${r.checkOutTime || ''},${statusLabel(r.status)}`)
        .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${studentName}_출결내역_${currentYear}년${currentMonth}월.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!studentId) {
    return (
      <div className="bg-white rounded-3xl p-12 border border-slate-200 shadow-xs text-center text-sm text-slate-400">
        오른쪽 명단에서 학생을 선택하면 출결 캘린더가 표시됩니다.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-6">
      {/* ── 1. 상단 학생 출결 타이틀 & 액션 버튼 ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-bold text-slate-900">{studentName} 학생</h2>
            {studentGrade && (
              <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                {studentGrade}
              </span>
            )}
            <span className="text-sm font-bold text-slate-700 bg-slate-100 px-2.5 py-0.5 rounded-full">
              월 등원 {summary.checkIns}회 | 하원 {summary.checkOuts}회
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {currentYear}년 {currentMonth}월 기준 · 지각 {summary.late}회 · 결석 {summary.absents}회
          </p>
        </div>

        {/* 자주 쓰는 두 가지만 위에 둔다. 좁은 폭에서도 글자가 접히지 않게 shrink 를 막는다 */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setReportOpen(true)}
            className="shrink-0 whitespace-nowrap px-3.5 py-2 rounded-xl bg-amber-400 hover:bg-amber-500 text-slate-900 font-bold text-xs shadow-md shadow-amber-400/20 transition flex items-center gap-1.5"
          >
            <Send className="w-3.5 h-3.5 shrink-0" />
            <span className="whitespace-nowrap">출결 알림톡</span>
          </button>
          <button
            onClick={openAddForm}
            className="shrink-0 whitespace-nowrap px-3.5 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-bold text-xs shadow-md shadow-blue-500/20 transition flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5 shrink-0" />
            <span className="whitespace-nowrap">출결 처리</span>
          </button>
        </div>
      </div>

      {error && (
        <p className="text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
          {error}
        </p>
      )}

      {/* ── 2. 좌측 월별 캘린더 & 우측 선택 일자 기록 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* 월별 캘린더 */}
        <div className="lg:col-span-7 bg-slate-50 p-5 rounded-2xl border border-slate-200">
          <div className="bg-blue-500 text-white px-4 py-3 rounded-xl flex items-center justify-between font-bold text-sm shadow-sm mb-4">
            <button onClick={goPrevMonth} className="px-2 py-1 hover:bg-blue-600 rounded-lg transition flex items-center gap-1">
              <ChevronLeft className="w-4 h-4" />
              {currentMonth === 1 ? '12월' : `${currentMonth - 1}월`}
            </button>
            <span className="text-base font-extrabold">
              {currentYear}년 {currentMonth}월
            </span>
            <button onClick={goNextMonth} className="px-2 py-1 hover:bg-blue-600 rounded-lg transition flex items-center gap-1">
              {currentMonth === 12 ? '1월' : `${currentMonth + 1}월`}
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* 요일 헤더 */}
          <div className="grid grid-cols-7 text-center text-xs font-bold text-slate-500 py-2 border-b border-slate-200">
            <span className="text-rose-500">일</span>
            <span>월</span>
            <span>화</span>
            <span>수</span>
            <span>목</span>
            <span>금</span>
            <span className="text-blue-500">토</span>
          </div>

          {/* 날짜 그리드 */}
          <div className={`grid grid-cols-7 gap-y-1 text-center text-xs pt-2 ${loading ? 'opacity-50' : ''}`}>
            {cells.map((cell) => {
              const log = cell.inMonth ? logsByDate[cell.date] : undefined;
              const isSelected = cell.inMonth && cell.date === selectedDate;
              const isToday = cell.date === todayString;
              const isAbsent = log?.status === 'ABSENT' || log?.status === 'EXCUSED';
              const isLate = log?.status === 'LATE';

              return (
                <button
                  key={cell.date}
                  onClick={() => cell.inMonth && setSelectedDate(cell.date)}
                  disabled={!cell.inMonth}
                  className={`relative py-2 flex flex-col items-center justify-center rounded-xl transition ${
                    !cell.inMonth
                      ? 'text-slate-300 cursor-not-allowed'
                      : isSelected
                        ? 'bg-blue-500 text-white font-bold shadow-md'
                        : isToday
                          ? 'ring-1 ring-blue-400 text-slate-800 hover:bg-slate-200/60'
                          : cell.weekday === 0
                            ? 'text-rose-500 hover:bg-slate-200/60'
                            : cell.weekday === 6
                              ? 'text-blue-600 hover:bg-slate-200/60'
                              : 'text-slate-800 hover:bg-slate-200/60'
                  }`}
                >
                  <span className="text-sm font-semibold">{cell.day}</span>
                  {/* 출결 표시: 등원 있으면 점, 결석이면 빨간 점 */}
                  <span
                    className={`w-1.5 h-1.5 rounded-full mt-0.5 ${
                      !log
                        ? 'bg-transparent'
                        : isSelected
                          ? 'bg-white'
                          : isAbsent
                            ? 'bg-rose-500'
                            : isLate
                              ? 'bg-amber-500'
                              : 'bg-blue-500'
                    }`}
                  />
                </button>
              );
            })}
          </div>

          <p className="text-[11px] text-slate-400 mt-3 flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> 등원
            </span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> 지각
            </span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> 결석
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full ring-1 ring-blue-400 inline-block" /> 오늘
            </span>
          </p>
        </div>

        {/* 선택 일자 상세 */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="grid grid-cols-5 bg-slate-100/70 text-slate-600 text-xs font-bold px-3 py-3 border-b border-slate-200 text-center">
              <span>이름</span>
              <span>상태</span>
              <span>등원</span>
              <span>하원</span>
              <span>삭제</span>
            </div>

            <div className="divide-y divide-slate-100">
              {!selectedLog ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  {currentMonth}월 {selectedDay}일 출결 내역이 없습니다.
                </div>
              ) : (
                <div className="grid grid-cols-5 items-center px-3 py-3.5 text-xs text-slate-800 text-center hover:bg-slate-50/80 transition">
                  <span className="font-bold truncate">{studentName}</span>
                  <span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        selectedLog.status === 'ABSENT' || selectedLog.status === 'EXCUSED'
                          ? 'bg-rose-50 text-rose-600 border-rose-200'
                          : selectedLog.status === 'LATE'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : selectedLog.status === 'MAKEUP'
                              ? 'bg-violet-50 text-violet-600 border-violet-200'
                              : 'bg-blue-50 text-blue-600 border-blue-200'
                      }`}
                    >
                      {selectedLog.status === 'LATE' && selectedLog.lateMinutes
                        ? `지각 ${selectedLog.lateMinutes >= 60 ? '60분+' : selectedLog.lateMinutes + '분'}`
                        : statusLabel(selectedLog.status)}
                    </span>
                  </span>
                  <span className="font-mono text-slate-600">{selectedLog.checkInTime || '—'}</span>
                  <span className="font-mono text-slate-600">{selectedLog.checkOutTime || '—'}</span>
                  <div>
                    <button
                      onClick={handleDeleteRecord}
                      disabled={saving}
                      className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition disabled:opacity-40"
                      title="이 날 출결 기록 삭제"
                    >
                      <Trash2 className="w-4 h-4 mx-auto" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 수동 등록 폼 */}
          {addOpen && (
            <div className="bg-blue-50/60 border border-blue-200/60 rounded-2xl p-4 space-y-3">
              <p className="text-xs font-bold text-blue-900">
                {currentYear}년 {currentMonth}월 {selectedDay}일 출결 처리
              </p>

              {/* 출결 상태 선택 — 정상 / 지각 / 결석 / 보강 */}
              <div className="grid grid-cols-4 gap-1 bg-white p-1 rounded-xl border border-slate-200">
                {STATUS_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setAddStatus(option.value)}
                    className={`py-1.5 rounded-lg text-xs font-bold transition ${
                      addStatus === option.value
                        ? option.value === 'ABSENT'
                          ? 'bg-rose-500 text-white shadow-sm'
                          : option.value === 'LATE'
                            ? 'bg-amber-500 text-white shadow-sm'
                            : option.value === 'MAKEUP'
                              ? 'bg-violet-500 text-white shadow-sm'
                              : 'bg-blue-500 text-white shadow-sm'
                        : 'text-slate-500 hover:bg-slate-100'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              {/* 지각 정도 — 지각을 골랐을 때만 */}
              {addStatus === 'LATE' && (
                <div className="bg-white border border-amber-200 rounded-xl px-3 py-2.5">
                  <p className="text-[11px] font-bold text-amber-800 mb-2">얼마나 늦었나요?</p>
                  <div className="grid grid-cols-6 gap-1">
                    {LATE_MINUTE_OPTIONS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setAddLateMinutes(m)}
                        className={`py-1.5 rounded-lg text-[11px] font-bold transition ${
                          addLateMinutes === m
                            ? 'bg-amber-500 text-white shadow-sm'
                            : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                        }`}
                      >
                        {m >= 60 ? '60+' : m}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1.5">
                    {lateLabel(addLateMinutes)} 지각으로 기록됩니다 · 키오스크로 등원하면
                    수업 시작 시각과 맞대어 <strong>10분 이상</strong> 늦은 경우에만
                    자동으로 지각 처리됩니다
                  </p>
                </div>
              )}

              {needsTime ? (
                <>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-700">등원 시간</span>
                    <input
                      type="time"
                      value={addCheckIn}
                      onChange={(e) => setAddCheckIn(e.target.value)}
                      className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-700">하원 시간 (선택)</span>
                    <input
                      type="time"
                      value={addCheckOut}
                      onChange={(e) => setAddCheckOut(e.target.value)}
                      className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </>
              ) : (
                <p className="text-[11px] text-rose-600 bg-white border border-rose-200 rounded-lg px-3 py-2 font-semibold">
                  결석으로 기록하면 그날 등·하원 시각은 지워집니다.
                </p>
              )}

              <p className="text-[11px] text-slate-500">
                출결을 정리하는 입력이므로 학부모 알림은 즉시 발송되지 않습니다.
                발송은 상단 <b>출결 알림톡</b>에서 일별·월별로 모아 보냅니다.
              </p>

              <div className="flex gap-2">
                <button
                  onClick={handleSaveRecord}
                  disabled={saving}
                  className="flex-1 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-bold text-xs transition disabled:opacity-50"
                >
                  {saving ? '저장 중...' : '저장'}
                </button>
                <button
                  onClick={() => setAddOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-white transition"
                >
                  취소
                </button>
              </div>
            </div>
          )}

          {/* 월간 요약 */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: '등원', value: summary.checkIns, color: 'text-blue-600' },
              { label: '하원', value: summary.checkOuts, color: 'text-slate-700' },
              { label: '지각', value: summary.late, color: 'text-amber-600' },
              { label: '결석', value: summary.absents, color: 'text-rose-600' },
            ].map((item) => (
              <div key={item.label} className="bg-slate-50 border border-slate-200 rounded-xl px-2 py-3 text-center">
                <p className={`text-lg font-black ${item.color}`}>{item.value}</p>
                <p className="text-[11px] text-slate-500 font-bold mt-0.5">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 내역 다운로드 — 자주 쓰지 않으므로 아래에 둔다 */}
      <div className="pt-4 border-t border-slate-100 flex justify-end">
        <button
          onClick={handleDownload}
          className="shrink-0 whitespace-nowrap px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition flex items-center gap-1.5"
        >
          <Download className="w-3.5 h-3.5 shrink-0" />
          <span className="whitespace-nowrap">
            {currentYear}년 {currentMonth}월 내역 다운로드
          </span>
        </button>
      </div>

      <AttendanceReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        date={selectedDate}
        year={currentYear}
        month={currentMonth}
      />
    </div>
  );
};
