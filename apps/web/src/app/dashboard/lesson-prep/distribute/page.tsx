'use client'

import { useState } from 'react'
import { UNIT_STEPS, EXAM_STEPS, STEP_CLEAR_THRESHOLD, type WorksheetCategory, type WorksheetStep } from '@inlevmath/shared'

// ── Mock 데이터 ──────────────────────────────────────────────────────────────
type WS = { id: string; title: string; grade: string; unit: string; problemCount: number; category: WorksheetCategory; step: WorksheetStep }

const MOCK_WORKSHEETS: WS[] = [
  // 단원별 - 기초
  { id: 'w01', title: '정수와 유리수 기초 확인', grade: '중1', unit: '정수와 유리수', problemCount: 15, category: '단원별', step: '기초' },
  { id: 'w02', title: '문자와 식 기초 계산', grade: '중1', unit: '문자와 식', problemCount: 12, category: '단원별', step: '기초' },
  { id: 'w03', title: '방정식 기초 연습', grade: '중2', unit: '일차방정식', problemCount: 18, category: '단원별', step: '기초' },
  // 단원별 - 기본
  { id: 'w04', title: '정수와 유리수 기본 문제', grade: '중1', unit: '정수와 유리수', problemCount: 20, category: '단원별', step: '기본' },
  { id: 'w05', title: '소인수분해 기본', grade: '중1', unit: '소인수분해', problemCount: 16, category: '단원별', step: '기본' },
  // 단원별 - 발전
  { id: 'w06', title: '정수와 유리수 발전 문제', grade: '중1', unit: '정수와 유리수', problemCount: 20, category: '단원별', step: '발전' },
  { id: 'w07', title: '일차방정식 응용 발전', grade: '중2', unit: '일차방정식', problemCount: 24, category: '단원별', step: '발전' },
  // 단원별 - 최상위
  { id: 'w08', title: '중1 최상위 종합문제 A', grade: '중1', unit: '종합', problemCount: 20, category: '단원별', step: '최상위' },
  // 내신대비 - 최다빈출
  { id: 'w09', title: '수완하나중 1-1 기말 모의고사_03회', grade: '중1', unit: '종합', problemCount: 24, category: '내신대비', step: '최다빈출' },
  { id: 'w10', title: '수완하나중 1-1 기말 모의고사_04회', grade: '중1', unit: '종합', problemCount: 24, category: '내신대비', step: '최다빈출' },
  { id: 'w11', title: '서강고 공통수학1 기말 모의고사_08회', grade: '고1', unit: '종합', problemCount: 23, category: '내신대비', step: '최다빈출' },
  // 내신대비 - 최다오답
  { id: 'w12', title: '중1 최다오답 집중 공략', grade: '중1', unit: '종합', problemCount: 15, category: '내신대비', step: '최다오답' },
  // 내신대비 - 서술형
  { id: 'w13', title: '중1 서술형 대비 문제', grade: '중1', unit: '종합', problemCount: 10, category: '내신대비', step: '서술형' },
  { id: 'w14', title: '중2 서술형 연습', grade: '중2', unit: '종합', problemCount: 8, category: '내신대비', step: '서술형' },
]

const ATTENDING_STUDENTS = [
  { id: 's1', name: '홍길동', grade: '중2' },
  { id: 's2', name: '김철수', grade: '중1' },
  { id: 's4', name: '박지민', grade: '중2' },
  { id: 's6', name: '정수진', grade: '중3' },
  { id: 's8', name: '이하늘', grade: '고1' },
  { id: 's9', name: '박서준', grade: '중1' },
]

const STEP_STYLE: Record<WorksheetStep, { bg: string; text: string; dot: string }> = {
  '기초':    { bg: 'bg-sky-50',    text: 'text-sky-700',    dot: 'bg-sky-400' },
  '기본':    { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-400' },
  '발전':    { bg: 'bg-amber-50',  text: 'text-amber-700',  dot: 'bg-amber-400' },
  '최상위':  { bg: 'bg-rose-50',   text: 'text-rose-700',   dot: 'bg-rose-400' },
  '최다빈출': { bg: 'bg-violet-50', text: 'text-violet-700', dot: 'bg-violet-400' },
  '최다오답': { bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-400' },
  '서술형':  { bg: 'bg-pink-50',   text: 'text-pink-700',   dot: 'bg-pink-400' },
}

type DistributedItem = { worksheetId: string; studentIds: string[]; distributedAt: string }

export default function DistributePage() {
  const [activeCategory, setActiveCategory] = useState<WorksheetCategory>('단원별')
  const [activeStep, setActiveStep] = useState<WorksheetStep>('기초')
  const [selectedWS, setSelectedWS] = useState<string | null>(null)
  const [selectedStudents, setSelectedStudents] = useState<string[]>([])
  const [distributed, setDistributed] = useState<DistributedItem[]>([])
  const [gradeFilter, setGradeFilter] = useState('')
  const [justDistributed, setJustDistributed] = useState<string | null>(null)

  const steps = activeCategory === '단원별' ? UNIT_STEPS : EXAM_STEPS
  const filteredWS = MOCK_WORKSHEETS.filter(w =>
    w.category === activeCategory && w.step === activeStep &&
    (gradeFilter === '' || w.grade === gradeFilter)
  )

  const toggleStudent = (id: string) =>
    setSelectedStudents(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id])

  const selectAll = () =>
    setSelectedStudents(
      selectedStudents.length === ATTENDING_STUDENTS.length ? [] : ATTENDING_STUDENTS.map(s => s.id)
    )

  const handleDistribute = () => {
    if (!selectedWS || selectedStudents.length === 0) return
    const ws = MOCK_WORKSHEETS.find(w => w.id === selectedWS)!
    setDistributed(prev => [...prev, {
      worksheetId: selectedWS,
      studentIds: [...selectedStudents],
      distributedAt: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
    }])
    setJustDistributed(ws.title)
    setSelectedWS(null)
    setSelectedStudents([])
    setTimeout(() => setJustDistributed(null), 3000)
  }

  const selectedWSData = selectedWS ? MOCK_WORKSHEETS.find(w => w.id === selectedWS) : null
  const threshold = selectedWSData ? STEP_CLEAR_THRESHOLD[selectedWSData.step] : null

  return (
    <div className="flex gap-0 -mt-2 -mx-6 -mb-6" style={{ minHeight: 'calc(100vh - 10rem)' }}>

      {/* ── 왼쪽: 카테고리 + 스텝 선택 ── */}
      <div className="w-52 border-r border-gray-200 bg-white shrink-0 flex flex-col">
        {/* 카테고리 탭 */}
        <div className="flex border-b border-gray-200">
          {(['단원별', '내신대비'] as WorksheetCategory[]).map(cat => (
            <button key={cat} onClick={() => { setActiveCategory(cat); setActiveStep(cat === '단원별' ? '기초' : '최다빈출'); setSelectedWS(null) }}
              className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${
                activeCategory === cat ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-50'
              }`}>
              {cat}
            </button>
          ))}
        </div>

        {/* 스텝 목록 */}
        <nav className="flex-1 py-2">
          <p className="px-4 pt-2 pb-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
            {activeCategory === '단원별' ? '단원별 스텝' : '내신대비 스텝'}
          </p>
          {steps.map((step, idx) => {
            const style = STEP_STYLE[step]
            const count = MOCK_WORKSHEETS.filter(w => w.category === activeCategory && w.step === step).length
            return (
              <button key={step} onClick={() => { setActiveStep(step); setSelectedWS(null) }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                  activeStep === step ? `${style.bg} ${style.text} font-semibold` : 'text-gray-600 hover:bg-gray-50'
                }`}>
                {/* 스텝 순서 표시 */}
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                  activeStep === step ? `${style.dot} text-white` : 'bg-gray-200 text-gray-500'
                }`}>{idx + 1}</span>
                <span className="flex-1 text-left">{step}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  activeStep === step ? 'bg-white/60' : 'bg-gray-100 text-gray-400'
                }`}>{count}</span>
              </button>
            )
          })}

          {/* 스텝 흐름 안내 */}
          <div className="mx-3 mt-4 p-3 bg-gray-50 rounded-xl border border-gray-200">
            <p className="text-[10px] font-semibold text-gray-500 mb-2">레벨 업 흐름</p>
            {steps.map((step, i) => (
              <div key={step} className="flex items-center gap-1">
                <span className={`text-[10px] font-medium ${STEP_STYLE[step].text}`}>{step}</span>
                <span className="text-[10px] text-gray-300">{STEP_CLEAR_THRESHOLD[step]}%</span>
                {i < steps.length - 1 && <span className="text-[10px] text-gray-300 ml-auto">↓</span>}
              </div>
            ))}
          </div>
        </nav>
      </div>

      {/* ── 가운데: 학습지 목록 ── */}
      <div className="flex-1 bg-gray-50 flex flex-col">
        {/* 필터 헤더 */}
        <div className="px-5 py-3 bg-white border-b border-gray-200 flex items-center gap-3">
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${STEP_STYLE[activeStep].bg} ${STEP_STYLE[activeStep].text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${STEP_STYLE[activeStep].dot}`} />
            {activeCategory} · {activeStep}
          </div>
          {threshold && (
            <span className="text-xs text-gray-400">클리어 기준: {threshold}%</span>
          )}
          <div className="ml-auto flex gap-1.5">
            {['', '중1', '중2', '중3', '고1'].map(g => (
              <button key={g} onClick={() => setGradeFilter(g)}
                className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                  gradeFilter === g ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 text-gray-500 hover:border-indigo-300'
                }`}>{g || '전체'}</button>
            ))}
          </div>
        </div>

        {/* 학습지 목록 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {filteredWS.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400">
              <p className="text-sm">이 스텝에 등록된 학습지가 없습니다.</p>
            </div>
          ) : filteredWS.map(ws => {
            const isSelected = selectedWS === ws.id
            const alreadyDist = distributed.some(d => d.worksheetId === ws.id)
            const style = STEP_STYLE[ws.step]
            return (
              <button key={ws.id} onClick={() => setSelectedWS(isSelected ? null : ws.id)}
                className={`w-full text-left bg-white rounded-xl border-2 px-4 py-3.5 transition-all ${
                  isSelected ? 'border-indigo-500 shadow-md shadow-indigo-100' : 'border-gray-200 hover:border-indigo-200'
                }`}>
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    isSelected ? 'border-indigo-600 bg-indigo-600' : 'border-gray-300'
                  }`}>
                    {isSelected && <span className="w-1.5 h-1.5 bg-white rounded-full" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${style.bg} ${style.text}`}>{ws.step}</span>
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

        {/* 배포 완료 알림 */}
        {justDistributed && (
          <div className="mx-4 mb-3 bg-emerald-600 text-white text-sm font-medium px-4 py-2.5 rounded-xl flex items-center gap-2">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
            </svg>
            {justDistributed} — 배포 완료!
          </div>
        )}
      </div>

      {/* ── 오른쪽: 학생 선택 + 배포 ── */}
      <div className="w-56 bg-white border-l border-gray-200 flex flex-col shrink-0">
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-gray-700">배포 대상</p>
            <button onClick={selectAll}
              className="text-[11px] text-indigo-500 hover:text-indigo-700 font-medium">
              {selectedStudents.length === ATTENDING_STUDENTS.length ? '전체 해제' : '전체 선택'}
            </button>
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5">오늘 출석 {ATTENDING_STUDENTS.length}명</p>
        </div>

        {/* 학생 목록 */}
        <div className="flex-1 overflow-y-auto py-2">
          {ATTENDING_STUDENTS.map(s => {
            const checked = selectedStudents.includes(s.id)
            return (
              <button key={s.id} onClick={() => toggleStudent(s.id)}
                className={`w-full flex items-center gap-2.5 px-4 py-2 transition-colors ${
                  checked ? 'bg-indigo-50' : 'hover:bg-gray-50'
                }`}>
                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                  checked ? 'border-indigo-600 bg-indigo-600' : 'border-gray-300'
                }`}>
                  {checked && (
                    <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/>
                    </svg>
                  )}
                </div>
                <span className={`text-xs flex-1 text-left ${checked ? 'text-indigo-700 font-semibold' : 'text-gray-600'}`}>
                  {s.name}
                </span>
                <span className="text-[11px] text-gray-300">{s.grade}</span>
              </button>
            )
          })}
        </div>

        {/* 선택된 학습지 미리보기 */}
        {selectedWSData && (
          <div className="mx-3 mb-3 p-3 bg-gray-50 rounded-xl border border-gray-200 text-xs">
            <p className="font-semibold text-gray-700 truncate">{selectedWSData.title}</p>
            <p className="text-gray-400 mt-0.5">{selectedWSData.problemCount}문제 · 클리어 {threshold}%</p>
          </div>
        )}

        {/* 배포 버튼 */}
        <div className="p-3 border-t border-gray-100">
          <button
            onClick={handleDistribute}
            disabled={!selectedWS || selectedStudents.length === 0}
            className="w-full bg-indigo-600 text-white text-sm font-bold py-2.5 rounded-xl
              hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {selectedStudents.length > 0
              ? `${selectedStudents.length}명에게 배포`
              : '학생을 선택하세요'}
          </button>
        </div>

        {/* 오늘 배포 이력 */}
        {distributed.length > 0 && (
          <div className="border-t border-gray-100 px-4 py-3">
            <p className="text-[11px] font-bold text-gray-500 mb-2">오늘 배포 ({distributed.length}건)</p>
            {distributed.map((d, i) => {
              const ws = MOCK_WORKSHEETS.find(w => w.id === d.worksheetId)!
              return (
                <div key={i} className="mb-1.5">
                  <p className="text-[11px] text-gray-700 truncate font-medium">{ws.title}</p>
                  <p className="text-[10px] text-gray-400">{d.studentIds.length}명 · {d.distributedAt}</p>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
