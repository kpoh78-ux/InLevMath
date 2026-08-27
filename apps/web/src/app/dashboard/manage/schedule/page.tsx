'use client'

// apps/web/src/app/dashboard/manage/schedule/page.tsx
//
// 주간 수업 시간표. 원래 학원 현황(대시보드) 안의 모달이었는데,
// 요일·교시·배정 학생을 여러 번 오가며 고치는 화면이라 URL을 가진 페이지로 옮겼다.
//
// 시간표는 선생님마다 다르므로 수업의 소유자는 로그인한 선생님 본인이다.
// 목록은 학원 전체를 보여 주되(한 학생이 여러 선생님 수업을 들을 수 있다),
// 고치는 것은 내 수업만 — 남의 수업은 관리자만 손댈 수 있다.
//
// 학생은 이름을 쉼표로 적는 대신 재원 학생 명단에서 골라 id 로 저장한다.
// 이름 문자열로는 동명이인을 가릴 수 없어 등원 시각과 수업 시작 시각을 맞대어
// 지각 분수를 자동으로 계산할 수 없었다.

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

type ScheduleStudent = { id: string; name: string; grade: string }

type ScheduleEntry = {
  id: string; dayOfWeek: number; startTime: string; endTime: string
  subject: string; grade: string; students: ScheduleStudent[]
  teacherId: string; teacherName: string; mine: boolean; canEdit: boolean
}

type TeacherRef = { id: string; name: string; isAdmin: boolean }
type Me = { teacherId: string; name: string; isAdmin: boolean }

/** 학생 선택기에 쓰는 재원 학생 (GET /api/students?sidebar=1) */
type Roster = { id: string; grade: string; user: { name: string } }

type Form = {
  dayOfWeek: number; startTime: string; endTime: string
  subject: string; grade: string; studentIds: string[]; teacherId: string
}

const EMPTY_FORM: Form = {
  dayOfWeek: 0, startTime: '', endTime: '', subject: '', grade: '중1', studentIds: [], teacherId: '',
}

/** 목록 필터 — 내 수업만 볼지, 학원 전체를 볼지 */
type OwnerFilter = 'mine' | 'all' | string

/** 오늘 요일을 내부 인덱스(0=월 … 6=일)로 */
function todayIndex() {
  const js = new Date().getDay()
  return js === 0 ? 6 : js - 1
}

export default function SchedulePage() {
  const [schedules, setSchedules] = useState<ScheduleEntry[]>([])
  const [roster, setRoster] = useState<Roster[]>([])
  const [teachers, setTeachers] = useState<TeacherRef[]>([])
  const [me, setMe] = useState<Me | null>(null)
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>('mine')
  const [pickerQuery, setPickerQuery] = useState('')
  const [activeDay, setActiveDay] = useState(todayIndex)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<Form>(EMPTY_FORM)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch('/api/schedule')
      if (res.ok) {
        const data = await res.json()
        setSchedules(data.schedules ?? [])
        setTeachers(data.teachers ?? [])
        setMe(data.me ?? null)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // 재원 학생 명단 — 선택기에서 쓴다
  useEffect(() => {
    apiFetch('/api/students?sidebar=1')
      .then(res => res.ok ? res.json() : [])
      .then(setRoster)
      .catch(() => setRoster([]))
  }, [])

  const visible = schedules.filter(s =>
    ownerFilter === 'all' ? true : ownerFilter === 'mine' ? s.mine : s.teacherId === ownerFilter
  )

  const dayEntries = visible
    .filter(s => s.dayOfWeek === activeDay)
    .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.teacherName.localeCompare(b.teacherName, 'ko'))

  const openAdd = () => {
    setEditId(null)
    setForm({
      ...EMPTY_FORM,
      dayOfWeek: activeDay,
      // 관리자가 특정 선생님으로 걸러 보는 중이면 그 선생님 수업으로 만든다
      teacherId: ownerFilter !== 'mine' && ownerFilter !== 'all' ? ownerFilter : (me?.teacherId ?? ''),
    })
    setPickerQuery('')
    setError(null)
    setShowForm(true)
  }

  const openEdit = (s: ScheduleEntry) => {
    setEditId(s.id)
    setForm({
      dayOfWeek: s.dayOfWeek, startTime: s.startTime, endTime: s.endTime,
      subject: s.subject, grade: s.grade, studentIds: s.students.map(v => v.id),
      teacherId: s.teacherId,
    })
    setPickerQuery('')
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
        studentIds: form.studentIds,
        teacherId: form.teacherId || undefined,
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

  const toggleStudent = (id: string) =>
    setForm(f => ({
      ...f,
      studentIds: f.studentIds.includes(id)
        ? f.studentIds.filter(v => v !== id)
        : [...f.studentIds, id],
    }))

  const selectedStudents = form.studentIds
    .map(id => roster.find(r => r.id === id))
    .filter((r): r is Roster => r != null)

  // 수업 학년과 같은 학생을 위로 올린다 — 대부분 그 학년에서 고르기 때문이다
  const pickerList = roster
    .filter(r => r.user.name.includes(pickerQuery.trim()))
    .sort((a, b) => {
      const ga = a.grade === form.grade ? 0 : 1
      const gb = b.grade === form.grade ? 0 : 1
      return ga !== gb ? ga - gb : a.user.name.localeCompare(b.user.name, 'ko')
    })

  const totalClasses = visible.length

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">수업 시간표</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {ownerFilter === 'mine' ? '내 수업' : ownerFilter === 'all' ? '학원 전체' : `${teachers.find(t => t.id === ownerFilter)?.name ?? ''} 선생님`}
            {' '}{totalClasses}개 · 여기에 등록한 수업이 학원 현황의 <strong>오늘의 수업</strong>에 표시됩니다.
          </p>
        </div>
        <button
          onClick={openAdd}
          className="bg-indigo-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors">
          + 수업 추가
        </button>
      </div>

      {/* 누구 시간표를 볼지 — 시간표는 선생님마다 다르다 */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button onClick={() => setOwnerFilter('mine')}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors
            ${ownerFilter === 'mine' ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
          내 시간표
        </button>
        <button onClick={() => setOwnerFilter('all')}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors
            ${ownerFilter === 'all' ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
          학원 전체
        </button>
        {teachers.filter(t => t.id !== me?.teacherId).map(t => {
          const n = schedules.filter(v => v.teacherId === t.id).length
          return (
            <button key={t.id} onClick={() => setOwnerFilter(t.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors
                ${ownerFilter === t.id ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
              {t.name}
              {n > 0 && <span className={`ml-1 ${ownerFilter === t.id ? 'text-indigo-200' : 'text-gray-400'}`}>{n}</span>}
            </button>
          )
        })}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {/* 요일 탭 */}
        <div className="flex border-b border-gray-100 px-4 overflow-x-auto">
          {DAYS.map((d, i) => {
            const count = visible.filter(s => s.dayOfWeek === i).length
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
                    <span className={`text-[11px] px-2 py-0.5 rounded-full border ${
                      s.mine ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                             : 'bg-gray-50 border-gray-200 text-gray-500'}`}>
                      {s.teacherName}{s.mine ? ' (나)' : ''}
                    </span>
                  </div>
                  {s.students.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {s.students.map(st => (
                        <span key={st.id} className="text-[11px] bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded-full">{st.name}</span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-amber-600">
                      배정된 학생이 없습니다 — 지각 여부가 자동으로 계산되지 않습니다
                    </p>
                  )}
                </div>
                {/* 액션 */}
                <div className="flex gap-1.5 shrink-0">
                  {s.canEdit ? (
                    <>
                      <button onClick={() => openEdit(s)}
                        className="text-xs text-indigo-600 border border-indigo-200 hover:bg-indigo-50 px-2 py-1 rounded transition-colors">수정</button>
                      <button onClick={() => handleDelete(s)}
                        className="text-xs text-red-400 border border-red-100 hover:bg-red-50 px-2 py-1 rounded transition-colors">삭제</button>
                    </>
                  ) : (
                    <span className="text-[11px] text-gray-400 px-2 py-1">{s.teacherName} 선생님 수업</span>
                  )}
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

              {/* 담당 선생님 — 관리자만 다른 선생님 앞으로 돌릴 수 있다 */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">담당 선생님</label>
                {me?.isAdmin ? (
                  <select value={form.teacherId} onChange={e => setForm(f => ({ ...f, teacherId: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400">
                    {teachers.map(t => (
                      <option key={t.id} value={t.id}>{t.name}{t.id === me.teacherId ? ' (나)' : ''}</option>
                    ))}
                  </select>
                ) : (
                  <p className="border border-gray-200 bg-white rounded-lg px-3 py-2 text-sm text-gray-600">
                    {me?.name ?? ''} <span className="text-gray-400 text-xs">— 내 시간표로 저장됩니다</span>
                  </p>
                )}
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
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-gray-500">
                    수업 학생 <span className="text-gray-400 font-normal">({form.studentIds.length}명 선택)</span>
                  </label>
                  {form.studentIds.length > 0 && (
                    <button type="button" onClick={() => setForm(f => ({ ...f, studentIds: [] }))}
                      className="text-[11px] text-gray-400 hover:text-gray-600">모두 해제</button>
                  )}
                </div>

                {/* 고른 학생 */}
                {selectedStudents.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {selectedStudents.map(st => (
                      <button key={st.id} type="button" onClick={() => toggleStudent(st.id)}
                        className="flex items-center gap-1 text-[11px] bg-indigo-600 text-white pl-2 pr-1.5 py-1 rounded-full hover:bg-indigo-700 transition-colors">
                        {st.user.name}
                        <span className="text-indigo-200">✕</span>
                      </button>
                    ))}
                  </div>
                )}

                <input type="search" value={pickerQuery} placeholder="학생 이름으로 찾기"
                  onChange={e => setPickerQuery(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 mb-2" />

                {/* 재원 학생 명단 — 같은 학년을 먼저 보여 준다 */}
                <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg bg-white divide-y divide-gray-100">
                  {pickerList.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-6">
                      {roster.length === 0 ? '재원 학생을 불러오는 중입니다.' : '찾는 학생이 없습니다.'}
                    </p>
                  ) : pickerList.map(st => {
                    const on = form.studentIds.includes(st.id)
                    return (
                      <label key={st.id}
                        className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${on ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}>
                        <input type="checkbox" checked={on} onChange={() => toggleStudent(st.id)}
                          className="w-4 h-4 accent-indigo-600" />
                        <span className="text-sm text-gray-800">{st.user.name}</span>
                        <span className="text-[11px] text-gray-400 ml-auto">{st.grade}</span>
                      </label>
                    )
                  })}
                </div>
                <p className="text-[11px] text-gray-400 mt-1">
                  등원 시각을 이 수업의 시작 시각과 맞대어 지각 여부를 자동으로 계산합니다.
                </p>
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
