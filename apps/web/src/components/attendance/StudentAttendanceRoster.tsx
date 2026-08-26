'use client';

// apps/web/src/components/attendance/StudentAttendanceRoster.tsx
import React, { useMemo, useState } from 'react';
import { Search, ChevronRight, Users } from 'lucide-react';

export interface RosterStudent {
  id: string;
  name: string;
  grade: string;
  /** 오늘 등원 시각 "HH:mm" (없으면 미등원) */
  checkInTime?: string;
  /** 오늘 하원 시각 "HH:mm" */
  checkOutTime?: string;
}

interface Props {
  students: RosterStudent[];
  selectedId: string;
  onSelect: (studentId: string) => void;
  loading?: boolean;
}

const GRADE_ORDER = ['초1', '초2', '초3', '초4', '초5', '초6', '중1', '중2', '중3', '고1', '고2', '고3'];

function gradeRank(grade: string): number {
  const idx = GRADE_ORDER.indexOf(grade);
  return idx === -1 ? GRADE_ORDER.length : idx;
}

/** 오늘 출결 상태 뱃지 */
function TodayBadge({ student }: { student: RosterStudent }) {
  if (student.checkOutTime) {
    return (
      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200 shrink-0">
        하원
      </span>
    );
  }
  if (student.checkInTime) {
    return (
      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-600 border border-blue-200 shrink-0 flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
        등원
      </span>
    );
  }
  return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white text-slate-400 border border-slate-200 shrink-0">
      미등원
    </span>
  );
}

export const StudentAttendanceRoster: React.FC<Props> = ({ students, selectedId, onSelect, loading }) => {
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const groups = useMemo(() => {
    const keyword = search.trim();
    const filtered = keyword ? students.filter((s) => s.name.includes(keyword)) : students;

    const byGrade = new Map<string, RosterStudent[]>();
    filtered.forEach((s) => {
      const grade = s.grade || '미지정';
      if (!byGrade.has(grade)) byGrade.set(grade, []);
      byGrade.get(grade)!.push(s);
    });

    return [...byGrade.entries()]
      .sort((a, b) => gradeRank(a[0]) - gradeRank(b[0]))
      .map(([grade, list]) => ({
        grade,
        list: [...list].sort((a, b) => a.name.localeCompare(b.name, 'ko')),
      }));
  }, [students, search]);

  const attendedCount = students.filter((s) => s.checkInTime).length;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col overflow-hidden max-h-[720px]">
      {/* 헤더 */}
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/70">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-slate-400" />
            학생 명단
          </span>
          <span className="text-[11px] font-bold text-slate-500">
            오늘 등원 <span className="text-blue-600">{attendedCount}</span> / {students.length}명
          </span>
        </div>
      </div>

      {/* 검색 */}
      <div className="px-3 py-2.5 border-b border-slate-100">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="학생 이름 검색"
            className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:bg-white focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* 학년별 목록 */}
      <div className="flex-1 overflow-y-auto py-1">
        {loading ? (
          <p className="text-[11px] text-slate-400 text-center py-8">학생 명단을 불러오는 중...</p>
        ) : groups.length === 0 ? (
          <p className="text-[11px] text-slate-400 text-center py-8">
            {search.trim() ? '검색 결과가 없습니다.' : '등록된 학생이 없습니다.'}
          </p>
        ) : (
          groups.map(({ grade, list }) => {
            const isCollapsed = collapsed[grade] ?? false;

            return (
              <div key={grade}>
                <button
                  type="button"
                  onClick={() => setCollapsed((prev) => ({ ...prev, [grade]: !isCollapsed }))}
                  className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-slate-50 transition group"
                >
                  <span className="flex items-center gap-1">
                    <ChevronRight
                      className={`w-3 h-3 text-slate-300 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
                    />
                    <span className="text-[11px] font-bold text-slate-500">{grade}</span>
                  </span>
                  <span className="text-[11px] text-slate-300">{list.length}명</span>
                </button>

                {!isCollapsed && (
                  <div className="pb-1">
                    {list.map((s) => {
                      const isSelected = s.id === selectedId;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => onSelect(s.id)}
                          className={`w-full flex items-center justify-between gap-2 px-3 py-2 mx-0 text-left transition ${
                            isSelected
                              ? 'bg-blue-50 border-l-2 border-blue-500'
                              : 'border-l-2 border-transparent hover:bg-slate-50'
                          }`}
                        >
                          <span
                            className={`text-xs truncate ${
                              isSelected ? 'font-bold text-blue-700' : 'font-medium text-slate-700'
                            }`}
                          >
                            {s.name}
                          </span>
                          <TodayBadge student={s} />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
