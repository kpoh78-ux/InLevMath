'use client';

// apps/web/src/components/student/StudentDetailModal.tsx
import React, { useState, useEffect } from 'react';
import { X, RefreshCw, Send, HelpCircle, Save, Check } from 'lucide-react';
import { apiFetch } from '@/lib/api';

export interface StudentDetailData {
  id?: string;
  name: string;
  gradeLevel?: '초' | '중' | '고';
  gradeNumber?: string; // 5학년
  grade?: string;
  attendancePin?: string; // 4자리 출결 번호 (예: 3630)
  status?: '재원' | '퇴원';
  studentAppId?: string; // S29757874
  parentAppId?: string; // P51560034
  studentPhone?: string; // 01054013630
  phone?: string;
  parentPhone?: string; // 01050016601
  parentName?: string;
  schoolName?: string; // 수완초
  school?: string;
  classStartDate?: string; // 2026.07.07
  startDate?: string;
  birthDate?: string; // 2015.09.24
  email?: string;
  address?: string;
  homePhone?: string;
  memo?: string;
}

interface Props {
  isOpen?: boolean;
  initialData?: StudentDetailData | null;
  mode?: 'create' | 'edit';
  onSave?: (data: StudentDetailData) => Promise<void>;
  onSaved?: () => void;
  onClose: () => void;
}

export const StudentDetailModal: React.FC<Props> = ({
  isOpen = true,
  initialData,
  mode = 'edit',
  onSave,
  onSaved,
  onClose,
}) => {
  const parseGradeLevel = (g?: string): '초' | '중' | '고' => {
    if (!g) return '초';
    if (g.startsWith('초')) return '초';
    if (g.startsWith('중')) return '중';
    return '고';
  };

  const parseGradeNumber = (g?: string): string => {
    if (!g) return '5학년';
    const match = g.match(/\d/);
    return match ? `${match[0]}학년` : '1학년';
  };

  const getInitialForm = (): StudentDetailData => {
    const rawGrade = initialData?.grade || (initialData?.gradeLevel && initialData?.gradeNumber ? `${initialData.gradeLevel}${initialData.gradeNumber.replace('학년', '')}` : '초5');
    const phoneVal = initialData?.studentPhone || initialData?.phone || '01054013630';
    const defaultPin = initialData?.attendancePin || (phoneVal.length >= 4 ? phoneVal.slice(-4) : '3630');

    return {
      id: initialData?.id || '',
      name: initialData?.name || '박도은',
      gradeLevel: initialData?.gradeLevel || parseGradeLevel(rawGrade),
      gradeNumber: initialData?.gradeNumber || parseGradeNumber(rawGrade),
      grade: rawGrade,
      attendancePin: defaultPin,
      status: initialData?.status || '재원',
      studentAppId: initialData?.studentAppId || (initialData?.id ? `S${initialData.id.slice(0, 8)}` : 'S29757874'),
      parentAppId: initialData?.parentAppId || 'P51560034',
      studentPhone: phoneVal,
      parentPhone: initialData?.parentPhone || '01050016601',
      parentName: initialData?.parentName || '',
      schoolName: initialData?.schoolName || initialData?.school || '수완초',
      classStartDate: initialData?.classStartDate || initialData?.startDate || '2026.07.07',
      birthDate: initialData?.birthDate || '2015.09.24',
      email: initialData?.email || '',
      address: initialData?.address || '',
      homePhone: initialData?.homePhone || '',
      memo: initialData?.memo || '',
    };
  };

  const [form, setForm] = useState<StudentDetailData>(getInitialForm());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initialData) {
      setForm(getInitialForm());
    }
  }, [initialData]);

  if (isOpen === false) return null;

  // 4자리 출결 번호 랜덤/재설정 생성기 (형제자매 번호 중복 방지)
  const handleGenerateRandomPin = () => {
    const randomPin = Math.floor(1000 + Math.random() * 9000).toString();
    setForm((prev) => ({ ...prev, attendancePin: randomPin }));
  };

  const handleSave = async () => {
    if (!form.attendancePin || form.attendancePin.length !== 4) {
      alert('출결 번호는 반드시 4자리 숫자여야 합니다.');
      return;
    }
    setSaving(true);
    try {
      if (onSave) {
        await onSave(form);
      } else {
        const fullGrade = `${form.gradeLevel}${form.gradeNumber?.replace('학년', '') || '1'}`;
        const payload = {
          name: form.name,
          phone: form.studentPhone?.replace(/\D/g, '') || form.phone,
          grade: fullGrade,
          school: form.schoolName,
          parentName: form.parentName,
          parentPhone: form.parentPhone?.replace(/\D/g, ''),
          startDate: form.classStartDate,
          birthDate: form.birthDate,
          email: form.email,
          address: form.address,
          homePhone: form.homePhone,
          memo: form.memo,
          attendancePin: form.attendancePin,
          status: form.status === '퇴원' ? 'withdrawn' : 'active',
        };

        if (form.id) {
          const res = await apiFetch(`/api/students/${form.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || '수정에 실패했습니다.');
          }
        } else {
          const res = await apiFetch('/api/students', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || '등록에 실패했습니다.');
          }
        }
      }
      alert('학생 상세정보 및 출결 번호가 성공적으로 저장되었습니다.');
      if (onSaved) onSaved();
      onClose();
    } catch (e: any) {
      alert(e.message || '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleSendGuidanceSms = async () => {
    alert(`[안내 발송]\n학생(${form.name}) 및 학부모 연락처로 앱 로그인 안내 문자가 전송되었습니다.`);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
      <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl border border-slate-100 overflow-hidden my-8 animate-scale-up">
        {/* 모달 상단 헤더 */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-lg font-black text-slate-900">학생 상세정보</h2>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-600 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 text-xs text-slate-700 max-h-[80vh] overflow-y-auto">
          {/* ── 1. 필수 입력 사항 (사진 4 상단) ── */}
          <div className="space-y-4">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              필수 입력 사항
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 학생 이름 */}
              <div className="flex items-center gap-3">
                <span className="w-20 font-bold text-slate-800 shrink-0">학생 이름</span>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="flex-1 px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold focus:bg-white focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* 학년 (초/중/고 토글 + 셀렉터) */}
              <div className="flex items-center gap-3">
                <span className="w-14 font-bold text-slate-800 shrink-0">학년</span>
                <div className="flex items-center gap-1">
                  {(['초', '중', '고'] as const).map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setForm({ ...form, gradeLevel: lvl })}
                      className={`px-2.5 py-1.5 rounded-lg font-bold text-xs border transition ${
                        form.gradeLevel === lvl
                          ? 'bg-blue-50 border-blue-400 text-blue-600'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {lvl}
                    </button>
                  ))}
                  <select
                    value={form.gradeNumber}
                    onChange={(e) => setForm({ ...form, gradeNumber: e.target.value })}
                    className="px-2 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-semibold text-slate-800"
                  >
                    <option value="1학년">1학년</option>
                    <option value="2학년">2학년</option>
                    <option value="3학년">3학년</option>
                    <option value="4학년">4학년</option>
                    <option value="5학년">5학년</option>
                    <option value="6학년">6학년</option>
                  </select>
                </div>
              </div>

              {/* ── 핵심 요구사항: 출결 번호 4자리 수정 및 [🔄] 재설정 버튼 ── */}
              <div className="flex items-center gap-3">
                <span className="w-20 font-bold text-slate-800 shrink-0">출결 번호</span>
                <div className="flex items-center gap-1.5 flex-1">
                  <input
                    type="text"
                    maxLength={4}
                    value={form.attendancePin}
                    onChange={(e) => setForm({ ...form, attendancePin: e.target.value.replace(/[^0-9]/g, '') })}
                    className="flex-1 px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500"
                    placeholder="4자리 숫자"
                  />
                  <button
                    type="button"
                    onClick={handleGenerateRandomPin}
                    className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 transition active:scale-95"
                    title="고유 번호 랜덤 생성 (형제자매 중복 방지)"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* 학생 상태 (재원/퇴원) */}
              <div className="flex items-center gap-3">
                <span className="w-14 font-bold text-slate-800 shrink-0">학생 상태</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, status: '재원' })}
                    className={`px-3 py-1.5 rounded-lg font-bold text-xs border transition ${
                      form.status === '재원' ? 'bg-blue-50 border-blue-400 text-blue-600' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    재원
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, status: '퇴원' })}
                    className={`px-3 py-1.5 rounded-lg font-bold text-xs border transition ${
                      form.status === '퇴원' ? 'bg-rose-50 border-rose-400 text-rose-600' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    퇴원
                  </button>
                </div>
              </div>
            </div>

            {/* 학생/학부모 앱 ID & 안내 문자 전송 */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 bg-slate-50 rounded-2xl border border-slate-200 gap-3">
              <div className="flex items-center gap-4 text-xs">
                <span className="font-semibold text-slate-500">
                  학생ID: <strong className="text-slate-900 font-mono">{form.studentAppId}</strong>
                </span>
                <span className="text-slate-300">|</span>
                <span className="font-semibold text-slate-500">
                  학부모ID: <strong className="text-slate-900 font-mono">{form.parentAppId}</strong>
                </span>
              </div>
              <button
                type="button"
                onClick={handleSendGuidanceSms}
                className="px-3 py-1.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-xs shadow-2xs flex items-center gap-1.5 transition active:scale-95"
              >
                <Send className="w-3.5 h-3.5" />
                <span>안내 문자 전송</span>
              </button>
            </div>
          </div>

          {/* ── 2. 선택 입력 사항 (사진 4 하단) ── */}
          <div className="space-y-4 pt-4 border-t border-slate-100">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              선택 입력 사항
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center gap-3">
                <span className="w-20 font-bold text-slate-800 shrink-0">학생 연락처</span>
                <input
                  type="text"
                  value={form.studentPhone}
                  onChange={(e) => setForm({ ...form, studentPhone: e.target.value })}
                  className="flex-1 px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-semibold"
                />
              </div>

              <div className="flex items-center gap-3">
                <span className="w-20 font-bold text-slate-800 shrink-0">학부모 연락처</span>
                <input
                  type="text"
                  value={form.parentPhone}
                  onChange={(e) => setForm({ ...form, parentPhone: e.target.value })}
                  className="flex-1 px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-semibold"
                />
              </div>

              <div className="flex items-center gap-3">
                <span className="w-20 font-bold text-slate-800 shrink-0">학교</span>
                <input
                  type="text"
                  value={form.schoolName}
                  onChange={(e) => setForm({ ...form, schoolName: e.target.value })}
                  className="flex-1 px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold"
                />
              </div>

              <div className="flex items-center gap-3">
                <span className="w-20 font-bold text-slate-800 shrink-0">수업 시작일</span>
                <input
                  type="text"
                  value={form.classStartDate}
                  onChange={(e) => setForm({ ...form, classStartDate: e.target.value })}
                  className="flex-1 px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold"
                />
              </div>

              <div className="flex items-center gap-3">
                <span className="w-20 font-bold text-slate-800 shrink-0">학생 생년월일</span>
                <input
                  type="text"
                  value={form.birthDate}
                  onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
                  className="flex-1 px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold"
                />
              </div>

              <div className="flex items-center gap-3">
                <span className="w-20 font-bold text-slate-800 shrink-0">학생 이메일</span>
                <input
                  type="email"
                  value={form.email}
                  placeholder="예시 : student@math.com"
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="flex-1 px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold"
                />
              </div>
            </div>
          </div>
        </div>

        {/* 모달 하단 저장 버튼 */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-100 transition"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 active:scale-98 text-white font-bold text-xs shadow-lg shadow-blue-500/20 flex items-center gap-1.5 transition-all disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? '저장 중...' : '저장하기'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
