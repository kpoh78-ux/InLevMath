'use client';

// apps/web/src/app/dashboard/manage/attendance/page.tsx
import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { MonthlyAttendanceCalendar } from '@/components/attendance/MonthlyAttendanceCalendar';
import { Users, Calendar, Sparkles } from 'lucide-react';

interface StudentItem {
  id: string;
  name: string;
  grade: string;
  school: string;
  parentPhone: string;
  attendancePin?: string;
}

function AttendanceManagePageInner() {
  const searchParams = useSearchParams();
  const studentParam = searchParams.get('student');

  const [students, setStudents] = useState<StudentItem[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStudents() {
      try {
        const res = await apiFetch('/api/students');
        if (res.ok) {
          const data = await res.json();
          const mapped: StudentItem[] = data.map((s: any) => ({
            id: s.id,
            name: s.user?.name || s.name,
            grade: s.grade || '',
            school: s.school || '',
            parentPhone: s.parentPhone || '',
            attendancePin: s.attendancePin || '',
          }));
          setStudents(mapped);
          if (mapped.length > 0) {
            if (studentParam && mapped.some((s) => s.id === studentParam)) {
              setSelectedStudentId(studentParam);
            } else {
              setSelectedStudentId(mapped[0].id);
            }
          }
        }
      } catch {
        //
      } finally {
        setLoading(false);
      }
    }
    fetchStudents();
  }, [studentParam]);

  const currentStudent = students.find((s) => s.id === selectedStudentId) || {
    id: '',
    name: '박도은',
    grade: '중1',
    school: '수완초',
    parentPhone: '01050016601',
  };

  return (
    <div className="space-y-6">
      {/* 상단 안내 바 및 학생 선택 드롭다운 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <span>출결 관리 및 월별 캘린더</span>
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">
                8월 현황
              </span>
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              원생별 등·하원 캘린더, 실시간 출결 통계 및 상세 타임라인 기록을 확인합니다.
            </p>
          </div>
        </div>

        {/* 학생 선택 셀렉터 */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-600 shrink-0">학생 선택:</span>
          <select
            value={selectedStudentId}
            onChange={(e) => setSelectedStudentId(e.target.value)}
            className="px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500"
          >
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.grade})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 8월 출결 달력 및 통계 타임라인 렌더링 */}
      <MonthlyAttendanceCalendar
        studentId={currentStudent.id}
        studentName={currentStudent.name}
        studentGrade={currentStudent.grade}
      />
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
