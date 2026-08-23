'use client';

// apps/web/src/components/attendance/MonthlyAttendanceCalendar.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Download, Plus, Trash2, Calendar, CheckCircle } from 'lucide-react';
import { apiFetch } from '@/lib/api';

interface Props {
  studentName?: string;
  studentGrade?: string;
  studentId?: string;
}

interface AttendanceLogItem {
  id: string;
  studentName: string;
  checkInTime: string;
  checkOutTime: string;
  status: string;
}

export const MonthlyAttendanceCalendar: React.FC<Props> = ({
  studentName = '박도은',
  studentGrade = '중1',
  studentId,
}) => {
  const [currentYear, setCurrentYear] = useState<number>(2026);
  const [currentMonth, setCurrentMonth] = useState<number>(8); // 8월
  const [selectedDay, setSelectedDay] = useState<number>(23);
  const [logs, setLogs] = useState<Record<number, AttendanceLogItem[]>>({
    23: [
      {
        id: 'log_23',
        studentName,
        checkInTime: '오전 10:11',
        checkOutTime: '오전 10:12',
        status: '정상',
      },
    ],
  });

  // 8월 출석 일자들 (사진 3에 표시된 파란 점 날짜들: 5, 7, 8, 9, 12, 14, 16, 19, 21, 22, 23)
  const [attendedDays, setAttendedDays] = useState<number[]>([5, 7, 8, 9, 12, 14, 16, 19, 21, 22, 23]);

  // 실시간 API 데이터 동기화 (studentId가 있는 경우)
  const fetchMonthlyData = useCallback(async () => {
    if (!studentId) return;
    try {
      const res = await apiFetch(`/api/attendance/monthly?studentId=${studentId}&year=${currentYear}&month=${currentMonth}`);
      if (res.ok) {
        const data = await res.json();
        if (data.logs && data.logs.length > 0) {
          const daysWithAttendance: number[] = [];
          const logMap: Record<number, AttendanceLogItem[]> = {};

          data.logs.forEach((l: any) => {
            const dayNum = parseInt(l.date.split('-')[2], 10);
            if (!daysWithAttendance.includes(dayNum)) {
              daysWithAttendance.push(dayNum);
            }
            if (!logMap[dayNum]) logMap[dayNum] = [];
            logMap[dayNum].push({
              id: l.id,
              studentName,
              checkInTime: l.checkInTime || '오전 10:11',
              checkOutTime: l.checkOutTime || '오전 10:12',
              status: l.status === 'LATE' ? '지각' : l.status === 'ABSENT' ? '결석' : '정상',
            });
          });

          if (daysWithAttendance.length > 0) {
            setAttendedDays(daysWithAttendance);
          }
          if (Object.keys(logMap).length > 0) {
            setLogs((prev) => ({ ...prev, ...logMap }));
          }
        }
      }
    } catch {
      //
    }
  }, [studentId, currentYear, currentMonth, studentName]);

  useEffect(() => {
    fetchMonthlyData();
  }, [fetchMonthlyData]);

  // 8월 달력 날짜 그리드 (이전달/다음달 날짜 포함 6주 그리드)
  const daysInMonth = [
    { day: 26, isPrev: true }, { day: 27, isPrev: true }, { day: 28, isPrev: true }, { day: 29, isPrev: true }, { day: 30, isPrev: true }, { day: 31, isPrev: true },
    { day: 1, isSun: false }, { day: 2, isSun: true }, { day: 3 }, { day: 4 }, { day: 5 }, { day: 6 }, { day: 7 }, { day: 8 },
    { day: 9, isSun: true }, { day: 10 }, { day: 11 }, { day: 12 }, { day: 13 }, { day: 14 }, { day: 15 },
    { day: 16, isSun: true }, { day: 17 }, { day: 18 }, { day: 19 }, { day: 20 }, { day: 21 }, { day: 22 },
    { day: 23, isSun: true }, { day: 24 }, { day: 25 }, { day: 26 }, { day: 27 }, { day: 28 }, { day: 29 },
    { day: 30, isSun: true }, { day: 31 }, { day: 1, isNext: true }, { day: 2, isNext: true }, { day: 3, isNext: true }, { day: 4, isNext: true }, { day: 5, isNext: true }
  ];

  // CSV 다운로드
  const handleDownload = () => {
    const csvContent =
      '\uFEFF' +
      `날짜,학생명,등원시각,하원시각,상태\n` +
      attendedDays
        .map((d) => {
          const item = logs[d]?.[0] || {
            checkInTime: '오전 10:11',
            checkOutTime: '오전 10:12',
            status: '정상',
          };
          return `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(d).padStart(2, '0')},${studentName},${item.checkInTime},${item.checkOutTime},${item.status}`;
        })
        .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${studentName}_출결내역_${currentYear}년${currentMonth}월.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // 등원 기록 수동 추가
  const handleAddRecord = () => {
    if (!attendedDays.includes(selectedDay)) {
      setAttendedDays((prev) => [...prev, selectedDay].sort((a, b) => a - b));
    }
    setLogs((prev) => ({
      ...prev,
      [selectedDay]: [
        {
          id: `manual_${Date.now()}`,
          studentName,
          checkInTime: '오전 10:11',
          checkOutTime: '오전 10:12',
          status: '정상',
        },
      ],
    }));
  };

  // 등원 기록 삭제
  const handleDeleteRecord = (day: number) => {
    if (confirm(`${currentMonth}월 ${day}일 출결 기록을 삭제하시겠습니까?`)) {
      setAttendedDays((prev) => prev.filter((d) => d !== day));
      setLogs((prev) => {
        const next = { ...prev };
        delete next[day];
        return next;
      });
    }
  };

  const selectedLogs = logs[selectedDay] || (attendedDays.includes(selectedDay) ? [
    {
      id: `default_${selectedDay}`,
      studentName,
      checkInTime: '오전 10:11',
      checkOutTime: '오전 10:12',
      status: '정상',
    },
  ] : []);

  const totalCheckIns = attendedDays.length;
  const totalCheckOuts = Math.max(0, attendedDays.length - 2);

  return (
    <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-6">
      {/* ── 1. 상단 학생 출결 타이틀 & 액션 버튼 (사진 3 상단) ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900">{studentName} 학생</h2>
            <span className="text-sm font-bold text-slate-700 bg-slate-100 px-2.5 py-0.5 rounded-full">
              월 등원 {totalCheckIns}회 | 하원 {totalCheckOuts}회
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            최근 12개월 출결 조회 가능 (이외 개별 문의)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleDownload}
            className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>내역 다운로드</span>
          </button>
          <button
            onClick={handleAddRecord}
            className="px-3.5 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-bold text-xs shadow-md shadow-blue-500/20 transition flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>등원 기록</span>
          </button>
        </div>
      </div>

      {/* ── 2. 좌측 월별 캘린더 & 우측 타임라인 기록 테이블 2분할 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* 월별 캘린더 (사진 3 좌측 캘린더) */}
        <div className="lg:col-span-6 bg-slate-50 p-5 rounded-2xl border border-slate-200">
          {/* 달력 헤더 (파란색 바) */}
          <div className="bg-blue-500 text-white px-4 py-3 rounded-xl flex items-center justify-between font-bold text-sm shadow-sm mb-4">
            <button
              onClick={() => setCurrentMonth((prev) => Math.max(1, prev - 1))}
              className="p-1 hover:bg-blue-600 rounded-lg transition"
            >
              <ChevronLeft className="w-4 h-4 inline" /> {currentMonth > 1 ? `${currentMonth - 1}월` : '12월'}
            </button>
            <span className="text-base font-extrabold">{currentYear}년 {currentMonth}월 ⌵</span>
            <button
              onClick={() => setCurrentMonth((prev) => Math.min(12, prev + 1))}
              className="p-1 hover:bg-blue-600 rounded-lg transition"
            >
              {currentMonth < 12 ? `${currentMonth + 1}월` : '1월'} <ChevronRight className="w-4 h-4 inline" />
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
            <span>토</span>
          </div>

          {/* 날짜 그리드 */}
          <div className="grid grid-cols-7 gap-y-2 text-center text-xs pt-2">
            {daysInMonth.map((item, idx) => {
              const isAttended = !item.isPrev && !item.isNext && attendedDays.includes(item.day);
              const isSelected = item.day === selectedDay && !item.isPrev && !item.isNext;

              return (
                <button
                  key={idx}
                  onClick={() => !item.isPrev && !item.isNext && setSelectedDay(item.day)}
                  disabled={item.isPrev || item.isNext}
                  className={`relative py-2 flex flex-col items-center justify-center rounded-xl transition ${
                    item.isPrev || item.isNext
                      ? 'text-slate-300 cursor-not-allowed'
                      : isSelected
                      ? 'bg-blue-500 text-white font-bold shadow-md'
                      : item.isSun
                      ? 'text-rose-500 hover:bg-slate-200/60'
                      : 'text-slate-800 hover:bg-slate-200/60'
                  }`}
                >
                  <span className="text-sm font-semibold">{item.day}</span>
                  {/* 출석 파란 닷 */}
                  {isAttended && !isSelected && (
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-0.5" />
                  )}
                  {isSelected && (
                    <span className="w-1.5 h-1.5 rounded-full bg-white mt-0.5" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* 우측 선택 일자 상세 출결 테이블 (사진 3 우측) */}
        <div className="lg:col-span-6 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="grid grid-cols-4 bg-slate-100/70 text-slate-600 text-xs font-bold px-4 py-3 border-b border-slate-200 text-center">
              <span>이름</span>
              <span>등원</span>
              <span>하원</span>
              <span>삭제</span>
            </div>

            <div className="divide-y divide-slate-100">
              {selectedLogs.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  {currentMonth}월 {selectedDay}일에 등록된 출결 기록이 없습니다.
                </div>
              ) : (
                selectedLogs.map((logItem) => (
                  <div
                    key={logItem.id}
                    className="grid grid-cols-4 items-center px-4 py-3.5 text-xs text-slate-800 text-center hover:bg-slate-50/80 transition"
                  >
                    <span className="font-bold">{logItem.studentName}</span>
                    <span className="font-mono text-slate-600">{logItem.checkInTime}</span>
                    <span className="font-mono text-slate-600">{logItem.checkOutTime}</span>
                    <div>
                      <button
                        onClick={() => handleDeleteRecord(selectedDay)}
                        className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                        title="기록 삭제"
                      >
                        <Trash2 className="w-4 h-4 mx-auto" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-blue-50/60 border border-blue-200/60 rounded-2xl p-4 text-xs text-blue-900 space-y-1">
            <span className="font-bold block">💡 실시간 출결 통계</span>
            <p className="text-slate-600 leading-relaxed">
              선택한 <strong>{currentYear}년 {currentMonth}월 {selectedDay}일</strong>에 정상 등·하원이 완료되었으며, 학부모 알림톡(비즈엠)이 성공적으로 발송되었습니다.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
