'use client'

// apps/web/src/app/dashboard/manage/schedule/page.tsx
//
// 주간 수업 시간표. 원래 학원 현황(대시보드) 안의 모달이었는데,
// 요일·교시·배정 학생을 여러 번 오가며 고치는 화면이라 URL을 가진 페이지로 옮겼다.

import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'

const DAYS = ['월', '화', '수', '목', '금', '토', '일']
const GRADE_OPTIONS = ['초1','초2','초3','초4','초5','초6','중1','중2','중3','고1','고2','고3']

function timeOptions() {
  const opts: string[] = []
  for (let h = 9; h <= 24; h++) {
    opts.push(`${String(h).padStart(2,'0')}:00`)
    if (h < 24) opts.push(`${String(h).padStart(2,'0')}:30`)
  }
  return opts
}
const TIME_OPTIONS = timeOptions()

type ScheduleEntry = {
  id: string; dayOfWeek: number; startTime: string; endTime: string
  subject: string; grade: string; studentNames: string[]
}

const EMPTY_FORM = { dayOfWeek: 0, startTime: '', endTime: '', subject: '', grade: '중1', studentNames: '' }

/** 오늘 요일을 내부 인덱스(0=월 … 6=일)로 */
function todayIndex() {
  const js = new Date().getDay()
  return js === 0 ? 6 : js - 1
}

export default function SchedulePage() {
  const [schedules, setSchedules] = useState<ScheduleEntry[]>([])
  const [activeDay, setActiveDay] = useState(todayIndex)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch('/api/schedule')
      if (res.ok) setSchedules(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const dayEntries = schedules
    .filter(s => s.dayOfWeek === activeDay)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))

  const openAdd = () => {
    setEditId(null)
    setForm({ ...EMPTY_FORM, dayOfWeek: activeDay })
    setError(null)
    setShowForm(true)
  }

  const openEdit = (s: ScheduleEntry) => {
    setEditId(s.id)
    setForm({
      dayOfWeek: s.dayOfWeek, startTime: s.startTime, endTime: s.endTime,
      subject: s.subject, grade: s.grade, studentNames: s.studentNames.join(', '),
    })
    setError(null)
    setShowForm(true)
  }

  const handleDelete = async (s: ScheduleEntry) => {
    if (!confirm(`${DAYS[s.dayOfWeek]}요일 ${s.startTime} ${s.subject} 수업을 삭제할까요?`)) return
    await apiFetch(`/api/schedule/${s.id}`, { method: 'DELETE' })
    await load()
  }

  const handleSave = async () => {
    if (!form.subject.trim()) { setError('수업 과목을 입력하세요.'); return }
    if (!form.startTime || !form.endTime) { setError('시작·종료 시간을 선택하세요.'); return }
    if (form.startTime >= form.endTime) { setError('종료 시간이 시작 시간보다 늦어야 합니다.'); return }

    setSaving(true)
    setError(null)
    try {
      const body = {
        dayOfWeek: form.dayOfWeek,
        startTime: form.startTime,
        endTime: form.endTime,
        subject: form.subject.trim(),
        grade: form.grade,
        studentNames: form.studentNames.split(',').map(s => s.trim()).filter(Boolean),
      }
      const res = editId
        ? await apiFetch(`/api/schedule/${editId}`, { method: 'PUT', body: JSON.stringify(body) })
        : await apiFetch('/api/schedule', { method: 'POST', body: JSON.stringify(body) })

      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        setError(d.error ?? '저장에 실패했습니다.')
        return
      }

      setShowForm(false)
      await load()
    } finally {
      setSaving(false)
    }
  }

  const totalClasses = schedules.length

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">수업 시간표</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            주간 수업 {totalClasses}개 · 여기에 등록한 수업이 학원 현황의 <strong>오늘의 수업</strong>에 표시됩니다.
          </p>
        </div>
        <button
          onClick={openAdd}
          className="bg-indigo-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors">
          + 수업 추가
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {/* 요일 탭 */}
        <div className="flex border-b border-gray-100 px-4 overflow-x-auto">
          {DAYS.map((d, i) => {
            const count = schedules.filter(s => s.dayOfWeek === i).length
            return (
              <button key={i} onClick={() => { setActiveDay(i); setShowForm(false) }}
                className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors mr-1 whitespace-nowrap
                  ${activeDay === i ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
                {d}
                {count > 0 && (
                  <span className="ml-1 text-[10px] bg-indigo-100 text-indigo-600 rounded-full px-1.5">{count}</span>
                )}
              </button>
            )
          })}
        </div>

        {/* 수업 목록 */}
        <div className="px-5 py-4 space-y-2">
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-10">불러오는 중...</p>
          ) : dayEntries.length === 0 && !showForm ? (
            <div className="text-center py-10">
              <p className="text-sm text-gray-400 mb-2">{DAYS[activeDay]}요일에 등록된 수업이 없습니다.</p>
              <button onClick={openAdd} className="text-xs text-indigo-500 hover:underline">
                {DAYS[activeDay]}요일 수업 추가하기 →
              </button>
            </div>
          ) : (
            dayEntries.map(s => (
              <div key={s.id} className="flex items-start gap-3 bg-gray-50 rounded-xl px-4 py-3 border border-gray-200">
                {/* 시간 */}
                <div className="shrink-0 text-center w-14">
                  <p className="text-sm font-bold text-gray-800">{s.startTime}</p>
                  <p className="text-[10px] text-gray-400">~{s.endTime}</p>
                </div>
                {/* 과목·학년·학생 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">{s.grade}</span>
                    <span className="text-sm font-semibold text-gray-800">{s.subject}</span>
                  </div>
                  {s.studentNames.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {s.studentNames.map((n, i) => (
                        <span key={i} className="text-[11px] bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded-full">{n}</span>
                      ))}
                    </div>
                  )}
                </div>
                {/* 액션 */}
                <div className="flex gap-1.5 shrink-0">
                  <button onClick={() => openEdit(s)}
                    className="text-xs text-indigo-600 border border-indigo-200 hover:bg-indigo-50 px-2 py-1 rounded transition-colors">수정</button>
                  <button onClick={() => handleDelete(s)}
                    className="text-xs text-red-400 border border-red-100 hover:bg-red-50 px-2 py-1 rounded transition-colors">삭제</button>
                </div>
              </div>
            ))
          )}

          {/* 추가/수정 폼 */}
          {showForm && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-indigo-800">{editId ? '수업 수정' : '수업 추가'}</p>
                <select value={form.dayOfWeek} onChange={e => setForm(f => ({ ...f, dayOfWeek: Number(e.target.value) }))}
                  className="border border-gray-300 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400">
                  {DAYS.map((d, i) => <option key={i} value={i}>{d}요일</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">시작 시간</label>
                  <select value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white">
                    <option value="">시작 시간 선택</option>
                    {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">종료 시간</label>
                  <select value={form.endTime} onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white">
                    <option value="">종료 시간 선택</option>
                    {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">학년</label>
                  <select value={form.grade} onChange={e => setForm(f => ({ ...f, grade: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white">
                    {GRADE_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">수업 과목</label>
                  <input type="text" value={form.subject} placeholder="예) 수학 심화"
                    onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  수업 학생 <span className="text-gray-400 font-normal">(쉼표로 구분: 홍길동, 김철수)</span>
                </label>
                <input type="text" value={form.studentNames} placeholder="홍길동, 김철수, 이영희"
                  onChange={e => setForm(f => ({ ...f, studentNames: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>

              {error && (
                <p className="text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <div className="flex gap-2 pt-1">
                <button onClick={() => setShowForm(false)}
                  className="flex-1 border border-gray-300 text-gray-600 rounded-lg py-2 text-sm hover:bg-white transition-colors">취소</button>
                <button onClick={handleSave} disabled={saving}
                  className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                  {saving ? '저장 중...' : '저장'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 하단 추가 버튼 */}
        {!showForm && !loading && dayEntries.length > 0 && (
          <div className="px-5 pb-5">
            <button onClick={openAdd}
              className="w-full border-2 border-dashed border-indigo-300 text-indigo-600 hover:bg-indigo-50 rounded-xl py-2.5 text-sm font-semibold transition-colors">
              + {DAYS[activeDay]}요일 수업 추가
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
