'use client';

// apps/web/src/app/dashboard/manage/attendance/page.tsx
import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { MonthlyAttendanceCalendar } from '@/components/attendance/MonthlyAttendanceCalendar';
import { StudentAttendanceRoster, RosterStudent } from '@/components/attendance/StudentAttendanceRoster';
import { Calendar, Smartphone, ExternalLink } from 'lucide-react';
import Link from 'next/link';

interface SidebarStudentResponse {
  id: string;
  grade: string;
  attendancePin?: string;
  user: { name: string; phone?: string };
  attendanceLogs?: Array<{ checkInTime?: string; checkOutTime?: string }>;
}

/** ISO 문자열 → "HH:mm" (24시간) */
function toHHmm(value?: string): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function AttendanceManagePageInner() {
  const searchParams = useSearchParams();
  const studentParam = searchParams.get('student');

  const [students, setStudents] = useState<RosterStudent[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const fetchStudents = useCallback(async () => {
    try {
      // sidebar=1 : id·학년·이름 + 오늘 출결 로그만 내려오는 경량 응답
      const res = await apiFetch('/api/students?sidebar=1');
      if (!res.ok) return;

      const data: SidebarStudentResponse[] = await res.json();
      const mapped: RosterStudent[] = data.map((s) => {
        const todayLog = s.attendanceLogs?.[0];
        return {
          id: s.id,
          name: s.user?.name || '이름 없음',
          grade: s.grade || '미지정',
          checkInTime: toHHmm(todayLog?.checkInTime),
          checkOutTime: toHHmm(todayLog?.checkOutTime),
        };
      });

      setStudents(mapped);
      setSelectedStudentId((prev) => {
        if (prev && mapped.some((s) => s.id === prev)) return prev;
        if (studentParam && mapped.some((s) => s.id === studentParam)) return studentParam;
        return mapped[0]?.id || '';
      });
    } catch {
      //
    } finally {
      setLoading(false);
    }
  }, [studentParam]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  const currentStudent = students.find((s) => s.id === selectedStudentId);

  return (
    <div className="space-y-6">
      {/* 상단 안내 바 */}
      <div className="flex items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">출결 관리 및 월별 캘린더</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              오른쪽 명단에서 학생을 고르면 해당 학생의 등·하원 기록이 달력에 표시됩니다.
            </p>
          </div>
        </div>

        {/* 학생이 직접 등·하원을 찍는 로비 화면 */}
        <Link
          href="/kiosk"
          target="_blank"
          className="shrink-0 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-2 shadow-md shadow-indigo-600/20 transition active:scale-95"
        >
          <Smartphone className="w-4 h-4" />
          <span>로비 키오스크 열기</span>
          <ExternalLink className="w-3.5 h-3.5 opacity-70" />
        </Link>
      </div>

      {/* 좌측 캘린더 + 우측 학생 명단 */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div className="xl:col-span-9">
          <MonthlyAttendanceCalendar
            studentId={currentStudent?.id}
            studentName={currentStudent?.name || ''}
            studentGrade={currentStudent?.grade}
            onChanged={fetchStudents}
          />
        </div>

        <div className="xl:col-span-3">
          <StudentAttendanceRoster
            students={students}
            selectedId={selectedStudentId}
            onSelect={setSelectedStudentId}
            loading={loading}
          />
        </div>
      </div>
    </div>
  );
}

export default function AttendanceManagePage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-slate-400 text-sm">출결 캘린더를 불러오는 중...</div>}>
      <AttendanceManagePageInner />
    </Suspense>
  );
}
