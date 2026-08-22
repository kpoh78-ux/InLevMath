'use client';

import React, { useState } from 'react';
import { Sliders, User, Percent, Save, CheckCircle, Sparkles, HelpCircle, ShieldAlert, Filter } from 'lucide-react';

export interface StudentThresholdItem {
  studentId: string;
  studentName: string;
  grade: string;
  trackType: 'BASIC' | 'STANDARD' | 'ADVANCED'; // 기초/기본/심화
  customThreshold: number; // 선생님이 설정한 취약 기준 정답률 (30% ~ 85%)
  recentAccuracy: number; // 최근 평균 정답률
  weakUnitCount: number; // 현재 기준 미달 취약 단원 수
}

interface Props {
  initialStudents: StudentThresholdItem[];
  onSaveAll?: (updatedList: StudentThresholdItem[]) => Promise<void>;
}

export const TeacherThresholdSettingPanel: React.FC<Props> = ({
  initialStudents,
  onSaveAll
}) => {
  const [students, setStudents] = useState<StudentThresholdItem[]>(initialStudents);
  const [isSaving, setIsSaving] = useState(false);
  const [filterTrack, setFilterTrack] = useState<string>('ALL');

  // 개별 학생 정답률 임계치 변경
  const handleThresholdChange = (studentId: string, newThreshold: number) => {
    setStudents(prev =>
      prev.map(st => (st.studentId === studentId ? { ...st, customThreshold: newThreshold } : st))
    );
  };

  // 트랙별 일괄 기본값 적용 (기초반: 45%, 기본반: 60%, 심화반: 75%)
  const applyPresetByTrack = (track: 'BASIC' | 'STANDARD' | 'ADVANCED', defaultVal: number) => {
    setStudents(prev =>
      prev.map(st => (st.trackType === track ? { ...st, customThreshold: defaultVal } : st))
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (onSaveAll) {
        await onSaveAll(students);
      } else {
        const token = localStorage.getItem('access_token') || localStorage.getItem('token');
        const res = await fetch('/api/teacher/students/thresholds', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({ students })
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData?.error || '저장에 실패했습니다.');
        }
      }
      alert('학생별 맞춤 취약 정답률 기준이 성공적으로 저장되었습니다.');
    } catch (e: any) {
      alert(e?.message || '저장 실패: 네트워크 상태를 확인하세요.');
    } finally {
      setIsSaving(false);
    }
  };

  const filtered = students.filter(st => filterTrack === 'ALL' || st.trackType === filterTrack);

  return (
    <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-6">
      {/* ── 1. 상단 안내 및 일괄 프리셋 바 ── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-teal-50 text-teal-700 border border-teal-200">
              <Sliders className="w-5 h-5" />
            </span>
            <h3 className="text-lg font-bold text-slate-900">
              학생별 맞춤 취약 정답률(%) 임계치 설정
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            학생의 학업 역량에 맞춰 취약 기준을 다르게 설정할 수 있습니다. 해당 정답률 미달 시 AI 자동 처방 미션 및 음성 코칭이 발동됩니다.
          </p>
        </div>

        {/* 원클릭 프리셋 버튼 */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500 font-semibold">학습 레벨별 일괄 설정:</span>
          <button
            type="button"
            onClick={() => applyPresetByTrack('BASIC', 45)}
            className="px-2.5 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-xs font-bold border border-emerald-200 transition-colors cursor-pointer"
          >
            기초반 45%
          </button>
          <button
            type="button"
            onClick={() => applyPresetByTrack('STANDARD', 60)}
            className="px-2.5 py-1.5 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-bold border border-blue-200 transition-colors cursor-pointer"
          >
            기본반 60%
          </button>
          <button
            type="button"
            onClick={() => applyPresetByTrack('ADVANCED', 75)}
            className="px-2.5 py-1.5 rounded-xl bg-purple-50 text-purple-700 hover:bg-purple-100 text-xs font-bold border border-purple-200 transition-colors cursor-pointer"
          >
            심화반 75%
          </button>
        </div>
      </div>

      {/* ── 트랙 필터 탭 ── */}
      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-slate-400" />
        <span className="text-xs text-slate-500 font-semibold">트랙 필터:</span>
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
          {[
            { key: 'ALL', label: `전체 (${students.length})` },
            { key: 'BASIC', label: `기초반 (${students.filter(s => s.trackType === 'BASIC').length})` },
            { key: 'STANDARD', label: `기본반 (${students.filter(s => s.trackType === 'STANDARD').length})` },
            { key: 'ADVANCED', label: `심화반 (${students.filter(s => s.trackType === 'ADVANCED').length})` },
          ].map(tab => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilterTrack(tab.key)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                filterTrack === tab.key
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 2. 학생 목록 및 개별 슬라이더/인풋 테이블 ── */}
      <div className="space-y-3">
        {filtered.map(student => {
          const isTriggered = student.recentAccuracy < student.customThreshold;

          return (
            <div
              key={student.studentId}
              className={`p-4 rounded-2xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                isTriggered 
                  ? 'bg-rose-50/40 border-rose-200 shadow-xs' 
                  : 'bg-slate-50 border-slate-200 hover:bg-white'
              }`}
            >
              {/* 학생 기본 정보 */}
              <div className="flex items-center gap-3 min-w-[220px]">
                <div className="w-10 h-10 rounded-2xl bg-white border border-slate-200 flex items-center justify-center font-bold text-slate-700 text-sm shadow-xs">
                  {student.studentName.slice(0, 1)}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-slate-900 text-sm">{student.studentName}</span>
                    <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-semibold">
                      {student.grade || '미설정'}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                      student.trackType === 'ADVANCED' ? 'bg-purple-100 text-purple-700' :
                      student.trackType === 'BASIC' ? 'bg-emerald-100 text-emerald-700' :
                      'bg-blue-100 text-blue-700'
                    }`}>
                      {student.trackType === 'ADVANCED' ? '심화반' : student.trackType === 'BASIC' ? '기초반' : '기본반'}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                    <span>최근 평균 정답률: <strong className="text-slate-800">{student.recentAccuracy}%</strong></span>
                    {isTriggered && (
                      <span className="text-rose-600 font-bold flex items-center gap-0.5 text-[11px]">
                        <ShieldAlert className="w-3.5 h-3.5" /> 취약 감지됨
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* 슬라이더 및 백분율 인풋 조작부 */}
              <div className="flex-1 max-w-md flex items-center gap-4 bg-white p-3 rounded-xl border border-slate-200">
                <div className="flex-1">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-600 mb-1">
                    <span>취약 판정 기준치</span>
                    <span className="text-indigo-600 font-bold">{student.customThreshold}% 미만 시 처방</span>
                  </div>
                  <input
                    type="range"
                    min="30"
                    max="85"
                    step="5"
                    value={student.customThreshold}
                    onChange={e => handleThresholdChange(student.studentId, Number(e.target.value))}
                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400 mt-0.5 font-mono">
                    <span>30%</span>
                    <span>50%</span>
                    <span>70%</span>
                    <span>85%</span>
                  </div>
                </div>

                {/* 직접 수치 입력 박스 */}
                <div className="w-16 shrink-0">
                  <div className="relative">
                    <input
                      type="number"
                      min="30"
                      max="90"
                      value={student.customThreshold}
                      onChange={e => handleThresholdChange(student.studentId, Math.min(90, Math.max(30, Number(e.target.value))))}
                      className="w-full text-center font-bold text-sm bg-slate-50 border border-slate-300 rounded-lg py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <span className="absolute right-1.5 top-2 text-[10px] text-slate-400 font-bold">%</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── 3. 하단 저장 버튼 ── */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-100">
        <div className="text-xs text-slate-500">
          총 <strong>{students.length}명</strong> 학생의 맞춤 임계치가 관리 중입니다.
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="px-6 py-3 bg-teal-600 hover:bg-teal-700 active:scale-98 text-white text-xs font-bold rounded-2xl shadow-lg shadow-teal-600/20 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save className="w-4 h-4" />
          <span>{isSaving ? '설정값 저장 중...' : '학생별 정답률 기준 전체 저장하기'}</span>
        </button>
      </div>
    </div>
  );
};
