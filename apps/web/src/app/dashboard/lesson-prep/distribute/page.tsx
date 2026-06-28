'use client'

import { useState, useEffect, useCallback } from 'react'
import { UNIT_STEPS, EXAM_STEPS, STEP_CLEAR_THRESHOLD, type WorksheetCategory, type WorksheetStep } from '@inlevmath/shared'
import { apiFetch } from '@/lib/api'

type WS = {
  id: string; title: string; grade: string; unit: string
  problemCount: number; category: WorksheetCategory; step: WorksheetStep
  examSubType?: string | null
}

type StudentItem = { id: string; name: string; grade: string }

const STEP_STYLE: Record<string, { bg: string; text: string; dot: string }> = {
  '기초':    { bg: 'bg-sky-50',    text: 'text-sky-700',    dot: 'bg-sky-400' },
  '기본':    { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-400' },
  '발전':    { bg: 'bg-amber-50',  text: 'text-amber-700',  dot: 'bg-amber-400' },
  '최상위':  { bg: 'bg-rose-50',   text: 'text-rose-700',   dot: 'bg-rose-400' },
  '최다빈출': { bg: 'bg-violet-50', text: 'text-violet-700', dot: 'bg-violet-400' },
  '최다오답': { bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-400' },
  '서술형':  { bg: 'bg-pink-50',   text: 'text-pink-700',   dot: 'bg-pink-400' },
  '모의고사': { bg: 'bg-teal-50',   text: 'text-teal-700',   dot: 'bg-teal-400' },
}

// 오늘 출석 학생 — 실제 출결 API 연동 시 교체
const ATTENDING_STUDENTS: StudentItem[] = [
  { id: 's1', name: '홍길동', grade: '중2' },
  { id: 's2', name: '김철수', grade: '중1' },
  { id: 's4', name: '박지민', grade: '중2' },
  { id: 's6', name: '정수진', grade: '중3' },
  { id: 's8', name: '이하늘', grade: '고1' },
  { id: 's9', name: '박서준', grade: '중1' },
]

export default function DistributePage() {
  const [activeCategory, setActiveCategory] = useState<WorksheetCategory>('단원별')
  const [activeStep, setActiveStep] = useState<WorksheetStep>('기초')
  const [worksheets, setWorksheets] = useState<WS[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [selectedWS, setSelectedWS] = useState<string | null>(null)
  const [selectedStudents, setSelectedStudents] = useState<string[]>([])
  const [distributing, setDistributing] = useState(false)
  const [justDistributed, setJustDistributed] = useState<string | null>(null)
  const [distributedIds, setDistributedIds] = useState<Set<string>>(new Set())
  const [gradeFilter, setGradeFilter] = useState('')

  const fetchWorksheets = useCallback(async () => {
    setLoadingList(true)
    try {
      const res = await apiFetch('/api/worksheets')
      if (res.ok) setWorksheets(await res.json())
    } finally {
      setLoadingList(false)
    }
  }, [])

  useEffect(() => { fetchWorksheets() }, [fetchWorksheets])

  const steps = activeCategory === '단원별' ? UNIT_STEPS : EXAM_STEPS

  const filteredWS = worksheets.filter(w =>
    w.category === activeCategory && w.step === activeStep &&
    (gradeFilter === '' || w.grade === gradeFilter)
  )

  const toggleStudent = (id: string) =>
    setSelectedStudents(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id])

  const selectAll = () =>
    setSelectedStudents(
      selectedStudents.length === ATTENDING_STUDENTS.length ? [] : ATTENDING_STUDENTS.map(s => s.id)
    )

  const handleDistribute = async () => {
    if (!selectedWS || selectedStudents.length === 0) return
    const ws = worksheets.find(w => w.id === selectedWS)!
    setDistributing(true)
    try {
      const res = await apiFetch('/api/worksheets/distribute', {
        method: 'POST',
        body: JSON.stringify({ worksheetId: selectedWS, studentIds: selectedStudents }),
      })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error || '배포 실패')
        return
      }
      setDistributedIds(prev => new Set([...prev, selectedWS]))
      setJustDistributed(ws.title)
      setSelectedWS(null)
      setSelectedStudents([])
      setTimeout(() => setJustDistributed(null), 3000)
    } finally {
      setDistributing(false)
    }
  }

  const selectedWSData = selectedWS ? worksheets.find(w => w.id === selectedWS) : null
  const threshold = selectedWSData ? STEP_CLEAR_THRESHOLD[selectedWSData.step] : null
  const wsLabel = (w: WS) => w.step === '모의고사' && w.examSubType ? w.examSubType : w.step

  return (
    <div className="flex gap-0 -mt-2 -mx-6 -mb-6" style={{ minHeight: 'calc(100vh - 10rem)' }}>

      {/* 왼쪽: 카테고리 + 스텝 */}
      <div className="w-52 border-r border-gray-200 bg-white shrink-0 flex flex-col">
        <div className="flex border-b border-gray-200">
          {(['단원별', '내신대비'] as WorksheetCategory[]).map(cat => (
            <button key={cat} onClick={() => {
              setActiveCategory(cat)
              setActiveStep(cat === '단원별' ? '기초' : '최다빈출')
              setSelectedWS(null)
            }}
              className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${activeCategory === cat ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
              {cat}
            </button>
          ))}
        </div>
        <nav className="flex-1 py-2">
          <p className="px-4 pt-2 pb-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
            {activeCategory === '단원별' ? '단원별 스텝' : '내신대비 스텝'}
          </p>
          {steps.map((step, idx) => {
            const style = STEP_STYLE[step] ?? STEP_STYLE['기초']
            const count = worksheets.filter(w => w.category === activeCategory && w.step === step).length
            return (
              <button key={step} onClick={() => { setActiveStep(step); setSelectedWS(null) }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${activeStep === step ? `${style.bg} ${style.text} font-semibold` : 'text-gray-600 hover:bg-gray-50'}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${activeStep === step ? `${style.dot} text-white` : 'bg-gray-200 text-gray-500'}`}>{idx + 1}</span>
                <span className="flex-1 text-left">{step}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${activeStep === step ? 'bg-white/60' : 'bg-gray-100 text-gray-400'}`}>{count}</span>
              </button>
            )
          })}
          <div className="mx-3 mt-4 p-3 bg-gray-50 rounded-xl border border-gray-200">
            <p className="text-[10px] font-semibold text-gray-500 mb-2">클리어 기준</p>
            {steps.map(step => (
              <div key={step} className="flex items-center gap-1">
                <span className={`text-[10px] font-medium ${STEP_STYLE[step]?.text ?? 'text-gray-500'}`}>{step}</span>
                <span className="text-[10px] text-gray-300 ml-auto">{STEP_CLEAR_THRESHOLD[step]}%</span>
              </div>
            ))}
          </div>
        </nav>
      </div>

      {/* 가운데: 학습지 목록 */}
      <div className="flex-1 bg-gray-50 flex flex-col">
        <div className="px-5 py-3 bg-white border-b border-gray-200 flex items-center gap-3">
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${STEP_STYLE[activeStep]?.bg ?? 'bg-gray-100'} ${STEP_STYLE[activeStep]?.text ?? 'text-gray-600'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${STEP_STYLE[activeStep]?.dot ?? 'bg-gray-400'}`} />
            {activeCategory} · {activeStep}
          </div>
          {threshold && <span className="text-xs text-gray-400">클리어 기준: {threshold}%</span>}
          <div className="ml-auto flex gap-1.5">
            {['', '중1', '중2', '중3', '고1'].map(g => (
              <button key={g} onClick={() => setGradeFilter(g)}
                className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${gradeFilter === g ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 text-gray-500 hover:border-indigo-300'}`}>
                {g || '전체'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loadingList ? (
            <p className="text-sm text-gray-400 text-center py-12">불러오는 중...</p>
          ) : filteredWS.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400">
              <p className="text-sm">이 스텝에 등록된 학습지가 없습니다.</p>
              <p className="text-xs mt-1">학습지 메뉴에서 먼저 등록해주세요.</p>
            </div>
          ) : filteredWS.map(ws => {
            const isSelected = selectedWS === ws.id
            const alreadyDist = distributedIds.has(ws.id)
            const style = STEP_STYLE[ws.step] ?? STEP_STYLE['기초']
            return (
              <button key={ws.id} onClick={() => setSelectedWS(isSelected ? null : ws.id)}
                className={`w-full text-left bg-white rounded-xl border-2 px-4 py-3.5 transition-all ${isSelected ? 'border-indigo-500 shadow-md shadow-indigo-100' : 'border-gray-200 hover:border-indigo-200'}`}>
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${isSelected ? 'border-indigo-600 bg-indigo-600' : 'border-gray-300'}`}>
                    {isSelected && <span className="w-1.5 h-1.5 bg-white rounded-full" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${style.bg} ${style.text}`}>{wsLabel(ws)}</span>
                      <span className="text-[11px] text-gray-400">{ws.grade}</span>
                      {alreadyDist && <span className="text-[11px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">배포완료</span>}
                    </div>
                    <p className="text-sm font-semibold text-gray-800 truncate">{ws.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{ws.unit} · {ws.problemCount}문제</p>
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {justDistributed && (
          <div className="mx-4 mb-3 bg-emerald-600 text-white text-sm font-medium px-4 py-2.5 rounded-xl flex items-center gap-2">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
            </svg>
            {justDistributed} — 배포 완료!
          </div>
        )}
      </div>

      {/* 오른쪽: 학생 선택 */}
      <div className="w-56 bg-white border-l border-gray-200 flex flex-col shrink-0">
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-gray-700">배포 대상</p>
            <button onClick={selectAll} className="text-[11px] text-indigo-500 hover:text-indigo-700 font-medium">
              {selectedStudents.length === ATTENDING_STUDENTS.length ? '전체 해제' : '전체 선택'}
            </button>
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5">오늘 출석 {ATTENDING_STUDENTS.length}명</p>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {ATTENDING_STUDENTS.map(s => {
            const checked = selectedStudents.includes(s.id)
            return (
              <button key={s.id} onClick={() => toggleStudent(s.id)}
                className={`w-full flex items-center gap-2.5 px-4 py-2 transition-colors ${checked ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}>
                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${checked ? 'border-indigo-600 bg-indigo-600' : 'border-gray-300'}`}>
                  {checked && <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/>
                  </svg>}
                </div>
                <span className={`text-xs flex-1 text-left ${checked ? 'text-indigo-700 font-semibold' : 'text-gray-600'}`}>{s.name}</span>
                <span className="text-[11px] text-gray-300">{s.grade}</span>
              </button>
            )
          })}
        </div>

        {selectedWSData && (
          <div className="mx-3 mb-3 p-3 bg-gray-50 rounded-xl border border-gray-200 text-xs">
            <p className="font-semibold text-gray-700 truncate">{selectedWSData.title}</p>
            <p className="text-gray-400 mt-0.5">{selectedWSData.problemCount}문제 · 클리어 {threshold}%</p>
          </div>
        )}

        <div className="p-3 border-t border-gray-100">
          <button onClick={handleDistribute}
            disabled={!selectedWS || selectedStudents.length === 0 || distributing}
            className="w-full bg-indigo-600 text-white text-sm font-bold py-2.5 rounded-xl hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            {distributing ? '배포 중...' : selectedStudents.length > 0 ? `${selectedStudents.length}명에게 배포` : '학생을 선택하세요'}
          </button>
        </div>
      </div>
    </div>
  )
}
