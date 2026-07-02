'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api'
import { MISSION_LABELS, MissionType } from '@inlevmath/shared'

// ── 상수 ────────────────────────────────────────────────────────────────────
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

const STEP_COLOR: Record<string, string> = {
  '기초':'bg-sky-50 text-sky-600 border-sky-200','기본':'bg-emerald-50 text-emerald-600 border-emerald-200',
  '발전':'bg-amber-50 text-amber-600 border-amber-200','최상위':'bg-rose-50 text-rose-600 border-rose-200',
  '최다빈출':'bg-violet-50 text-violet-600 border-violet-200','최다오답':'bg-orange-50 text-orange-600 border-orange-200',
  '서술형':'bg-pink-50 text-pink-600 border-pink-200','모의고사':'bg-teal-50 text-teal-600 border-teal-200',
}
const MISSION_COLOR: Record<string,string> = {
  concept_learning:'text-sky-600', concept_problem:'text-emerald-600',
  basic_problem:'text-amber-600',  advanced_problem:'text-orange-600', top_problem:'text-rose-600',
}

// ── 타입 ─────────────────────────────────────────────────────────────────────
type ScheduleEntry = { id:string; dayOfWeek:number; startTime:string; endTime:string; subject:string; grade:string; studentNames:string[] }
type Student       = { id:string; name:string; school:string; grade:string; currentLevel:number; currentMission:MissionType; comprehension:number; reasoning:number; calculation:number; lastActivity:string|null }
type Distribution  = { id:string; studentName:string; studentGrade:string; worksheetTitle:string; step:string; examSubType:string|null; problemCount:number; status:'distributed'|'submitted'|'graded'; correctProblems:number|null; distributedAt:string }
type Summary = { studentCount:number; worksheetCount:number; worksheetsWithAnswers:number; distTotal:number; distGraded:number; distPending:number; todaySchedule:ScheduleEntry[]; students:Student[]; recentDistributions:Distribution[] }

const EMPTY_FORM = { dayOfWeek:0, startTime:'', endTime:'', subject:'', grade:'중1', studentNames:'' }

// ── 헬퍼 ─────────────────────────────────────────────────────────────────────
function AbilityMini({ label, value, color }:{ label:string; value:number; color:string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-gray-400 w-8 shrink-0">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width:`${Math.min(value,100)}%` }} />
      </div>
      <span className="text-[10px] font-bold text-gray-500 w-7 text-right">{Math.round(value)}</span>
    </div>
  )
}

function timeAgo(dateStr:string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff/60000)
  if (m<1) return '방금'; if (m<60) return `${m}분 전`
  const h = Math.floor(m/60)
  if (h<24) return `${h}시간 전`; return `${Math.floor(h/24)}일 전`
}

// ── 주간시간표 모달 ───────────────────────────────────────────────────────────
function ScheduleModal({ onClose, onUpdated }:{ onClose:()=>void; onUpdated:()=>void }) {
  const [schedules, setSchedules] = useState<ScheduleEntry[]>([])
  const [activeDay, setActiveDay] = useState(0)
  const [editId, setEditId]   = useState<string|null>(null)
  const [form, setForm]       = useState(EMPTY_FORM)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving]   = useState(false)

  const load = useCallback(async () => {
    const res = await apiFetch('/api/schedule')
    if (res.ok) setSchedules(await res.json())
  }, [])

  useEffect(() => { load() }, [load])

  const dayEntries = schedules.filter(s => s.dayOfWeek === activeDay)
    .sort((a,b) => a.startTime.localeCompare(b.startTime))

  const openAdd = () => {
    setEditId(null)
    setForm({ ...EMPTY_FORM, dayOfWeek: activeDay })
    setShowForm(true)
  }

  const openEdit = (s: ScheduleEntry) => {
    setEditId(s.id)
    setForm({ dayOfWeek:s.dayOfWeek, startTime:s.startTime, endTime:s.endTime, subject:s.subject, grade:s.grade, studentNames:s.studentNames.join(', ') })
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('이 수업을 삭제할까요?')) return
    await apiFetch(`/api/schedule/${id}`, { method:'DELETE' })
    await load(); onUpdated()
  }

  const handleSave = async () => {
    if (!form.subject.trim()) { alert('수업 과목을 입력하세요.'); return }
    if (form.startTime >= form.endTime) { alert('종료 시간이 시작 시간보다 늦어야 합니다.'); return }
    setSaving(true)
    const body = {
      dayOfWeek: form.dayOfWeek,
      startTime: form.startTime,
      endTime:   form.endTime,
      subject:   form.subject.trim(),
      grade:     form.grade,
      studentNames: form.studentNames.split(',').map(s => s.trim()).filter(Boolean),
    }
    if (editId) {
      await apiFetch(`/api/schedule/${editId}`, { method:'PUT', body:JSON.stringify(body) })
    } else {
      await apiFetch('/api/schedule', { method:'POST', body:JSON.stringify(body) })
    }
    setSaving(false); setShowForm(false); await load(); onUpdated()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col" style={{ maxHeight:'90vh' }}>

        {/* 모달 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">주간 수업 시간표</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        {/* 요일 탭 */}
        <div className="flex border-b border-gray-100 px-6">
          {DAYS.map((d,i) => (
            <button key={i} onClick={() => { setActiveDay(i); setShowForm(false) }}
              className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors mr-1
                ${activeDay===i ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
              {d}
              {schedules.filter(s=>s.dayOfWeek===i).length > 0 && (
                <span className="ml-1 text-[10px] bg-indigo-100 text-indigo-600 rounded-full px-1.5">
                  {schedules.filter(s=>s.dayOfWeek===i).length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* 수업 목록 */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          {dayEntries.length === 0 && !showForm && (
            <p className="text-sm text-gray-400 text-center py-8">{DAYS[activeDay]}요일 수업이 없습니다.</p>
          )}
          {dayEntries.map(s => (
            <div key={s.id} className="flex items-start gap-3 bg-gray-50 rounded-xl px-4 py-3 border border-gray-200">
              {/* 시간 */}
              <div className="shrink-0 text-center">
                <p className="text-sm font-bold text-gray-800">{s.startTime}</p>
                <p className="text-[10px] text-gray-400">~{s.endTime}</p>
              </div>
              {/* 과목·학년 */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">{s.grade}</span>
                  <span className="text-sm font-semibold text-gray-800">{s.subject}</span>
                </div>
                {s.studentNames.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {s.studentNames.map((n,i) => (
                      <span key={i} className="text-[11px] bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded-full">{n}</span>
                    ))}
                  </div>
                )}
              </div>
              {/* 액션 */}
              <div className="flex gap-1.5 shrink-0">
                <button onClick={() => openEdit(s)}
                  className="text-xs text-indigo-600 border border-indigo-200 hover:bg-indigo-50 px-2 py-1 rounded transition-colors">수정</button>
                <button onClick={() => handleDelete(s.id)}
                  className="text-xs text-red-400 border border-red-100 hover:bg-red-50 px-2 py-1 rounded transition-colors">삭제</button>
              </div>
            </div>
          ))}

          {/* 수업 추가/수정 폼 */}
          {showForm && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-4 space-y-3">
              <p className="text-sm font-semibold text-indigo-800">{editId ? '수업 수정' : '수업 추가'}</p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">시작 시간</label>
                  <select value={form.startTime} onChange={e => setForm(f=>({...f, startTime:e.target.value}))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white">
                    <option value="">시작 시간 선택</option>
                    {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">종료 시간</label>
                  <select value={form.endTime} onChange={e => setForm(f=>({...f, endTime:e.target.value}))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white">
                    <option value="">종료 시간 선택</option>
                    {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">학년</label>
                  <select value={form.grade} onChange={e => setForm(f=>({...f, grade:e.target.value}))}
                    className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white">
                    {GRADE_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">수업 과목</label>
                  <input type="text" value={form.subject} placeholder="예) 수학 심화"
                    onChange={e => setForm(f=>({...f, subject:e.target.value}))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">수업 학생 <span className="text-gray-400 font-normal">(쉼표로 구분: 홍길동, 김철수)</span></label>
                <input type="text" value={form.studentNames} placeholder="홍길동, 김철수, 이영희"
                  onChange={e => setForm(f=>({...f, studentNames:e.target.value}))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>

              <div className="flex gap-2 pt-1">
                <button onClick={() => setShowForm(false)}
                  className="flex-1 border border-gray-300 text-gray-600 rounded-lg py-2 text-sm hover:bg-gray-50 transition-colors">취소</button>
                <button onClick={handleSave} disabled={saving}
                  className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                  {saving ? '저장 중...' : '저장'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 하단 추가 버튼 */}
        {!showForm && (
          <div className="px-6 py-4 border-t border-gray-100">
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

// ── 메인 페이지 ──────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [summary, setSummary]       = useState<Summary|null>(null)
  const [loading, setLoading]       = useState(true)
  const [showSchedule, setShowSchedule] = useState(false)

  const fetchSummary = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch('/api/dashboard/summary')
      if (res.ok) setSummary(await res.json())
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchSummary() }, [fetchSummary])

  const today = new Date().toLocaleDateString('ko-KR',{ year:'numeric', month:'long', day:'numeric', weekday:'short' })
  const todayDow = (() => { const d = new Date().getDay(); return d === 0 ? 6 : d - 1 })()

  if (loading || !summary) {
    return <div className="flex items-center justify-center h-48 text-gray-400 text-sm">학원 현황을 불러오는 중...</div>
  }

  const { studentCount, worksheetCount, worksheetsWithAnswers, distTotal, distGraded, distPending,
          todaySchedule, students, recentDistributions } = summary

  const statsCards = [
    { label:'등록 학생',  value:studentCount,         unit:'명', sub:`/ 최대 300명`,                              color:'text-indigo-600', bg:'border-indigo-100', dot:'bg-indigo-500', href:'/dashboard/manage/students' },
    { label:'등록 학습지', value:worksheetCount,       unit:'개', sub:`정답 완료 ${worksheetsWithAnswers}개`,       color:'text-teal-600',   bg:'border-teal-100',   dot:'bg-teal-500',   href:'/dashboard/worksheets' },
    { label:'학습지 배포', value:distTotal,            unit:'건', sub:`미채점 ${distPending}건`,                    color:'text-amber-600',  bg:'border-amber-100',  dot:'bg-amber-500',  href:'/dashboard/lesson-prep/distribute' },
    { label:'채점 완료',   value:distGraded,           unit:'건', sub:`전체의 ${distTotal>0?Math.round(distGraded/distTotal*100):0}%`, color:'text-emerald-600', bg:'border-emerald-100', dot:'bg-emerald-500', href:'/dashboard/lesson-prep/distribute' },
  ]

  const stepLabel = (d:Distribution) => d.step==='모의고사'&&d.examSubType ? d.examSubType : d.step
  const correctRate = (d:Distribution) => d.correctProblems!=null ? Math.round(d.correctProblems/d.problemCount*100) : null

  return (
    <div className="space-y-6">

      {/* ── 헤더 ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">학원 현황</h1>
          <p className="text-sm text-gray-400 mt-0.5">{today}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchSummary}
            className="text-xs text-gray-400 hover:text-indigo-600 border border-gray-200 hover:border-indigo-300 px-3 py-1.5 rounded-lg transition-colors">
            새로고침
          </button>
          <button onClick={() => setShowSchedule(true)}
            className="text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 px-4 py-1.5 rounded-lg transition-colors flex items-center gap-1.5">
            📅 주간시간표
          </button>
        </div>
      </div>

      {/* ── 오늘의 수업 ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-indigo-50/50">
          <div className="flex items-center gap-2">
            <span className="text-base">📚</span>
            <h2 className="font-bold text-gray-900">오늘의 수업</h2>
            <span className="text-xs text-gray-400">{DAYS[todayDow]}요일</span>
            {todaySchedule.length > 0 && (
              <span className="text-xs bg-indigo-100 text-indigo-700 font-semibold px-2 py-0.5 rounded-full">
                {todaySchedule.length}교시
              </span>
            )}
          </div>
          <button onClick={() => setShowSchedule(true)}
            className="text-xs text-indigo-500 hover:text-indigo-700 hover:underline">
            시간표 편집 →
          </button>
        </div>

        {todaySchedule.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-gray-400 text-sm mb-2">오늘({DAYS[todayDow]}요일) 등록된 수업이 없습니다.</p>
            <button onClick={() => setShowSchedule(true)}
              className="text-xs text-indigo-500 hover:underline">주간시간표에서 추가하기 →</button>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {todaySchedule.map(s => (
              <div key={s.id} className="flex items-center gap-2 px-5 py-3 hover:bg-gray-50/60 transition-colors flex-wrap">
                <span className="shrink-0 text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-md px-2 py-0.5">
                  {s.startTime}~{s.endTime}
                </span>
                <span className="shrink-0 text-[11px] text-gray-400">{s.grade}</span>
                <span className="shrink-0 text-sm font-semibold text-gray-800">{s.subject}</span>
                <span className="shrink-0 text-gray-200 text-xs">|</span>
                {s.studentNames.length === 0
                  ? <span className="text-xs text-gray-300 italic">학생 미등록</span>
                  : s.studentNames.map((n,i) => (
                      <span key={i} className="text-xs bg-white border border-gray-200 text-gray-700 px-2.5 py-0.5 rounded-full font-medium shadow-sm">{n}</span>
                    ))
                }
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 통계 카드 ── */}
      <div className="grid grid-cols-4 gap-4">
        {statsCards.map(s => (
          <Link key={s.label} href={s.href}
            className={`bg-white rounded-xl border ${s.bg} p-5 hover:shadow-md transition-all block`}>
            <div className="flex items-center gap-1.5 mb-2">
              <span className={`w-2 h-2 rounded-full ${s.dot}`} />
              <p className="text-xs font-medium text-gray-500">{s.label}</p>
            </div>
            <p className={`text-3xl font-black ${s.color}`}>
              {s.value}<span className="text-base font-bold ml-1 text-gray-400">{s.unit}</span>
            </p>
            <p className="text-xs text-gray-400 mt-1.5">{s.sub}</p>
          </Link>
        ))}
      </div>

      {/* ── 2단 레이아웃 ── */}
      <div className="grid grid-cols-5 gap-5">

        {/* 학생 현황 */}
        <div className="col-span-3 bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-gray-800">학생 현황</h2>
              <span className="text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full font-medium">{studentCount}명</span>
            </div>
            <Link href="/dashboard/manage/students" className="text-xs text-indigo-500 hover:underline">전체보기 →</Link>
          </div>
          {students.length === 0 ? (
            <div className="px-5 py-10 text-center text-gray-400 text-sm">
              등록된 학생이 없습니다.
              <Link href="/dashboard/manage/students" className="block mt-2 text-indigo-500 hover:underline text-xs">학생 등록하기 →</Link>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {students.map(s => (
                <Link key={s.id} href={`/dashboard/manage/students/${s.id}`}
                  className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors group">
                  <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
                    <span className="text-xs font-black text-indigo-700">Lv{s.currentLevel}</span>
                  </div>
                  <div className="w-24 shrink-0">
                    <p className="text-sm font-semibold text-gray-800 group-hover:text-indigo-600 transition-colors">{s.name}</p>
                    <p className="text-[11px] text-gray-400">{s.grade}</p>
                  </div>
                  <div className="w-24 shrink-0">
                    <p className="text-[11px] text-gray-400 mb-0.5">현재 미션</p>
                    <p className={`text-xs font-semibold ${MISSION_COLOR[s.currentMission]??'text-gray-600'}`}>{MISSION_LABELS[s.currentMission]}</p>
                  </div>
                  <div className="flex-1 space-y-1">
                    <AbilityMini label="이해" value={s.comprehension} color="bg-sky-400" />
                    <AbilityMini label="추론" value={s.reasoning}     color="bg-violet-400" />
                    <AbilityMini label="계산" value={s.calculation}   color="bg-amber-400" />
                  </div>
                  <div className="w-14 text-right shrink-0">
                    {s.lastActivity
                      ? <span className="text-[11px] text-gray-400">{timeAgo(s.lastActivity)}</span>
                      : <span className="text-[11px] text-gray-300">활동없음</span>}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* 사이드 패널 */}
        <div className="col-span-2 space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
            <p className="text-xs font-bold text-gray-500 mb-3">바로가기</p>
            {[
              { href:'/dashboard/lesson-prep/distribute', label:'학습지 배포', desc:'학생에게 학습지 배포',  color:'text-indigo-600', bg:'bg-indigo-50 hover:bg-indigo-100 border-indigo-100' },
              { href:'/dashboard/worksheets',             label:'학습지 관리', desc:'등록·정답 설정',       color:'text-teal-600',   bg:'bg-teal-50 hover:bg-teal-100 border-teal-100' },
              { href:'/dashboard/textbooks',              label:'교재',        desc:'교재 목록 관리',       color:'text-amber-600',  bg:'bg-amber-50 hover:bg-amber-100 border-amber-100' },
              { href:'/dashboard/manage/students',        label:'학생 관리',   desc:'학생 등록·학습 내역',  color:'text-gray-700',   bg:'bg-gray-50 hover:bg-gray-100 border-gray-200' },
            ].map(m => (
              <Link key={m.href} href={m.href}
                className={`flex items-center justify-between ${m.bg} border rounded-xl px-4 py-3 transition-colors`}>
                <div>
                  <p className={`text-sm font-semibold ${m.color}`}>{m.label}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{m.desc}</p>
                </div>
                <span className="text-gray-300">→</span>
              </Link>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-bold text-gray-500 mb-3">학습지 정답 설정</p>
            <div className="flex items-end gap-3 mb-2">
              <span className="text-2xl font-black text-teal-600">{worksheetsWithAnswers}</span>
              <span className="text-sm text-gray-400 mb-0.5">/ {worksheetCount}개 완료</span>
            </div>
            <div className="bg-gray-100 rounded-full h-2 overflow-hidden">
              <div className="bg-teal-400 h-full rounded-full transition-all"
                style={{ width:`${worksheetCount>0?(worksheetsWithAnswers/worksheetCount)*100:0}%` }} />
            </div>
            <Link href="/dashboard/worksheets" className="block text-xs text-teal-600 hover:underline mt-2.5">
              미설정 {worksheetCount-worksheetsWithAnswers}개 설정하기 →
            </Link>
          </div>
        </div>
      </div>

      {/* ── 최근 배포 현황 ── */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-gray-800">최근 학습지 배포 현황</h2>
            <span className="text-xs text-gray-400">최근 10건</span>
          </div>
          <Link href="/dashboard/lesson-prep/distribute" className="text-xs text-indigo-500 hover:underline">배포 관리 →</Link>
        </div>
        {recentDistributions.length === 0 ? (
          <div className="px-5 py-10 text-center text-gray-400 text-sm">
            배포된 학습지가 없습니다.
            <Link href="/dashboard/lesson-prep/distribute" className="block mt-2 text-indigo-500 hover:underline text-xs">학습지 배포하기 →</Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-400">
                <th className="px-5 py-2.5 text-left font-medium">학생</th>
                <th className="px-4 py-2.5 text-left font-medium">학습지</th>
                <th className="px-4 py-2.5 text-left font-medium">단계</th>
                <th className="px-4 py-2.5 text-center font-medium">상태</th>
                <th className="px-4 py-2.5 text-center font-medium">결과</th>
                <th className="px-4 py-2.5 text-left font-medium">배포</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {recentDistributions.map(d => {
                const rate = correctRate(d)
                return (
                  <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3">
                      <span className="font-semibold text-gray-800">{d.studentName}</span>
                      <span className="text-xs text-gray-400 ml-1.5">{d.studentGrade}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs max-w-[160px] truncate">{d.worksheetTitle}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${STEP_COLOR[d.step]??'bg-gray-100 text-gray-600 border-gray-200'}`}>{stepLabel(d)}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {d.status==='graded'
                        ? <span className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded font-medium">채점완료</span>
                        : <span className="text-xs text-amber-500 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">미채점</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {rate!=null
                        ? <span className={`font-bold text-sm ${rate>=80?'text-emerald-600':rate>=70?'text-amber-500':'text-red-500'}`}>{d.correctProblems}/{d.problemCount} <span className="text-xs font-medium">({rate}%)</span></span>
                        : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">{timeAgo(d.distributedAt)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* 주간시간표 모달 */}
      {showSchedule && (
        <ScheduleModal
          onClose={() => setShowSchedule(false)}
          onUpdated={() => { fetchSummary() }}
        />
      )}
    </div>
  )
}
