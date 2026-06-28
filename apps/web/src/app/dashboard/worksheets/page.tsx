'use client'

import { useState, useEffect, useCallback } from 'react'
import { UNIT_STEPS, EXAM_STEPS, MOCK_EXAM_TYPES } from '@inlevmath/shared'
import { apiFetch } from '@/lib/api'

type WorksheetCategory = '단원별' | '내신대비'

type Worksheet = {
  id: string; title: string; grade: string; unit: string
  problemCount: number; createdAt: string; source: string
  category: WorksheetCategory; step: string
  examSubType?: string | null
  answersJson?: string | null
}

const GRADE_OPTIONS = ['중1', '중2', '중3', '고1', '고2', '고3']

const STEP_BADGE: Record<string, string> = {
  '기초': 'bg-sky-50 text-sky-600 border-sky-200',
  '기본': 'bg-emerald-50 text-emerald-600 border-emerald-200',
  '발전': 'bg-amber-50 text-amber-600 border-amber-200',
  '최상위': 'bg-rose-50 text-rose-600 border-rose-200',
  '최다빈출': 'bg-violet-50 text-violet-600 border-violet-200',
  '최다오답': 'bg-orange-50 text-orange-600 border-orange-200',
  '서술형': 'bg-pink-50 text-pink-600 border-pink-200',
  '모의고사': 'bg-teal-50 text-teal-600 border-teal-200',
}

const hasAnswers = (w: Worksheet) => {
  if (!w.answersJson) return false
  try {
    const arr: string[] = JSON.parse(w.answersJson)
    return arr.some(a => a.trim() !== '')
  } catch { return false }
}

export default function WorksheetsPage() {
  const [worksheets, setWorksheets] = useState<Worksheet[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [form, setForm] = useState({
    title: '', grade: '', unit: '', problemCount: '',
    source: 'manual' as string,
    category: '단원별' as WorksheetCategory,
    step: '기초' as string,
    examSubType: '' as string,
  })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [search, setSearch] = useState('')
  const [gradeFilter, setGradeFilter] = useState('')

  // 정답 설정
  const [answerWs, setAnswerWs] = useState<Worksheet | null>(null)
  const [answerInputs, setAnswerInputs] = useState<string[]>([])
  const [loadingAnswers, setLoadingAnswers] = useState(false)
  const [savingAnswers, setSavingAnswers] = useState(false)

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

  const filtered = worksheets.filter(w =>
    (gradeFilter === '' || w.grade === gradeFilter) &&
    (w.title.toLowerCase().includes(search.toLowerCase()) || w.unit.includes(search))
  )

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.grade) { alert('학년을 선택해주세요.'); return }
    if (form.step === '모의고사' && !form.examSubType) { alert('모의고사 유형을 선택해주세요.'); return }
    setSaving(true); setSaveError('')
    try {
      const res = await apiFetch('/api/worksheets', {
        method: 'POST',
        body: JSON.stringify({
          title: form.title, category: form.category, step: form.step,
          examSubType: form.step === '모의고사' ? form.examSubType : null,
          grade: form.grade, unit: form.unit || '종합',
          problemCount: parseInt(form.problemCount), source: form.source,
        }),
      })
      let data: { error?: string } = {}
      try { data = await res.json() } catch { /* empty */ }
      if (!res.ok) { setSaveError(data.error || '등록 실패'); return }
      await fetchWorksheets()
      setForm({ title: '', grade: '', unit: '', problemCount: '', source: 'manual', category: '단원별', step: '기초', examSubType: '' })
      setShowAddModal(false)
    } finally { setSaving(false) }
  }

  const handleDelete = async (w: Worksheet) => {
    if (!confirm(`"${w.title}"을 삭제할까요?`)) return
    await apiFetch(`/api/worksheets/${w.id}`, { method: 'DELETE' })
    setWorksheets(prev => prev.filter(x => x.id !== w.id))
  }

  const openAnswers = async (w: Worksheet) => {
    setAnswerWs(w)
    setLoadingAnswers(true)
    try {
      const res = await apiFetch(`/api/worksheets/${w.id}/answers`)
      if (res.ok) {
        const data = await res.json()
        const arr: string[] = data.answers ?? []
        setAnswerInputs(Array(w.problemCount).fill('').map((_, i) => arr[i] ?? ''))
      }
    } finally { setLoadingAnswers(false) }
  }

  const saveAnswers = async () => {
    if (!answerWs) return
    setSavingAnswers(true)
    try {
      const res = await apiFetch(`/api/worksheets/${answerWs.id}/answers`, {
        method: 'PUT',
        body: JSON.stringify({ answers: answerInputs }),
      })
      if (res.ok) {
        const saved = JSON.stringify(answerInputs)
        setWorksheets(prev => prev.map(w => w.id === answerWs.id ? { ...w, answersJson: saved } : w))
        setAnswerWs(null)
      } else {
        const d = await res.json().catch(() => ({})) as { error?: string }
        alert(d.error || '저장 실패')
      }
    } finally { setSavingAnswers(false) }
  }

  const stepLabel = (w: Worksheet) =>
    w.step === '모의고사' && w.examSubType ? w.examSubType : w.step

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">학습지 관리</h1>
          <p className="text-sm text-gray-500 mt-0.5">정답 설정 후 수업준비 → 학습지 배포에서 학생에게 배포하세요</p>
        </div>
        <button onClick={() => setShowAddModal(true)}
          className="bg-indigo-600 text-white text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-1.5">
          <span className="text-base leading-none">+</span> 학습지 등록
        </button>
      </div>

      {/* 필터 */}
      <div className="flex gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px] bg-white border border-gray-200 rounded-xl px-4 py-2.5 flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input type="text" placeholder="학습지명, 단원 검색" value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 text-sm outline-none text-gray-700 placeholder-gray-400" />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {['', ...GRADE_OPTIONS].map(g => (
            <button key={g} onClick={() => setGradeFilter(g)}
              className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${gradeFilter === g ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 text-gray-500 hover:border-indigo-400'}`}>
              {g || '전체'}
            </button>
          ))}
        </div>
      </div>

      {/* 목록 */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
              <th className="px-5 py-3 text-left font-medium">학습지명</th>
              <th className="px-4 py-3 text-left font-medium">학년</th>
              <th className="px-4 py-3 text-left font-medium">단원</th>
              <th className="px-4 py-3 text-left font-medium">단계</th>
              <th className="px-4 py-3 text-center font-medium">문제 수</th>
              <th className="px-4 py-3 text-center font-medium">정답</th>
              <th className="px-4 py-3 text-left font-medium">등록일</th>
              <th className="px-4 py-3 text-left font-medium">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loadingList ? (
              <tr><td colSpan={8} className="px-5 py-12 text-center text-gray-400 text-sm">불러오는 중...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="px-5 py-12 text-center text-gray-400 text-sm">
                {worksheets.length === 0
                  ? '등록된 학습지가 없습니다. 오른쪽 상단 "+ 학습지 등록"을 눌러 추가하세요.'
                  : '검색 결과가 없습니다.'}
              </td></tr>
            ) : filtered.map(w => (
              <tr key={w.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-3.5">
                  <div className="font-semibold text-gray-800 text-sm">{w.title}</div>
                  {w.source === 'mathflat' && (
                    <span className="text-[10px] text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded mt-0.5 inline-block">매쓰플랫</span>
                  )}
                </td>
                <td className="px-4 py-3.5">
                  <span className="text-xs font-medium bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{w.grade}</span>
                </td>
                <td className="px-4 py-3.5 text-gray-500 text-xs">{w.unit}</td>
                <td className="px-4 py-3.5">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${STEP_BADGE[w.step] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                    {stepLabel(w)}
                  </span>
                </td>
                <td className="px-4 py-3.5 text-center text-gray-700 font-medium text-sm">{w.problemCount}</td>
                <td className="px-4 py-3.5 text-center">
                  {hasAnswers(w)
                    ? <span className="text-[11px] text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded font-medium">입력됨</span>
                    : <span className="text-[11px] text-amber-500 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">미입력</span>}
                </td>
                <td className="px-4 py-3.5 text-gray-400 text-xs">{new Date(w.createdAt).toLocaleDateString('ko-KR')}</td>
                <td className="px-4 py-3.5">
                  <div className="flex gap-2">
                    <button onClick={() => openAnswers(w)}
                      className="text-xs text-emerald-600 hover:text-emerald-700 border border-emerald-200 hover:border-emerald-400 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded transition-colors font-medium whitespace-nowrap">
                      정답 설정
                    </button>
                    <button onClick={() => handleDelete(w)}
                      className="text-xs text-red-400 hover:text-red-600 border border-red-100 hover:border-red-300 px-2 py-1 rounded transition-colors">
                      삭제
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── 학습지 등록 모달 ── */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900">학습지 등록</h2>
              <button onClick={() => { setShowAddModal(false); setSaveError('') }} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">출처 *</label>
                <div className="flex gap-2">
                  {(['manual', 'mathflat'] as const).map(v => (
                    <button key={v} type="button" onClick={() => setForm(f => ({ ...f, source: v }))}
                      className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${form.source === v ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 text-gray-600 hover:border-indigo-400'}`}>
                      {v === 'manual' ? '직접 제작' : '매쓰플랫'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">학습지명 *</label>
                <input type="text" required value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="예) 정수와 유리수 기초 확인"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">학년 *</label>
                <div className="flex flex-wrap gap-2">
                  {GRADE_OPTIONS.map(g => (
                    <button key={g} type="button" onClick={() => setForm(f => ({ ...f, grade: g }))}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${form.grade === g ? 'bg-indigo-600 text-white border-indigo-600' : 'text-gray-600 border-gray-300 hover:border-indigo-400'}`}>
                      {g}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  단원명 <span className="text-gray-400 font-normal">(같은 단원+단계 최대 10개)</span>
                </label>
                <input type="text" value={form.unit}
                  onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                  placeholder="예) 정수와 유리수  (비워두면 '종합')"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">카테고리 *</label>
                <div className="flex gap-2">
                  {(['단원별', '내신대비'] as const).map(cat => (
                    <button key={cat} type="button"
                      onClick={() => setForm(f => ({ ...f, category: cat, step: cat === '단원별' ? '기초' : '최다빈출', examSubType: '' }))}
                      className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${form.category === cat ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 text-gray-600 hover:border-indigo-400'}`}>
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">단계 *</label>
                <div className="flex flex-wrap gap-2">
                  {(form.category === '단원별' ? UNIT_STEPS : EXAM_STEPS).map(step => (
                    <button key={step} type="button"
                      onClick={() => setForm(f => ({ ...f, step, examSubType: '' }))}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${form.step === step ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-gray-300 text-gray-600 hover:border-indigo-400'}`}>
                      {step}
                    </button>
                  ))}
                </div>
              </div>
              {form.step === '모의고사' && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-2">모의고사 유형 *</label>
                  <div className="flex flex-wrap gap-2">
                    {MOCK_EXAM_TYPES.map(t => (
                      <button key={t} type="button"
                        onClick={() => setForm(f => ({ ...f, examSubType: t }))}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${form.examSubType === t ? 'border-teal-600 bg-teal-50 text-teal-700' : 'border-gray-300 text-gray-600 hover:border-teal-400'}`}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">총 문제 수 *</label>
                <input type="number" required min={1} max={200} value={form.problemCount}
                  onChange={e => setForm(f => ({ ...f, problemCount: e.target.value }))}
                  placeholder="예) 24"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
              {saveError && <p className="text-red-500 text-sm">{saveError}</p>}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => { setShowAddModal(false); setSaveError('') }}
                  className="flex-1 border border-gray-300 text-gray-600 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-50 transition-colors">
                  취소
                </button>
                <button type="submit" disabled={saving || !form.grade}
                  className="flex-1 bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                  {saving ? '등록 중...' : '등록 완료'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── 정답 설정 모달 ── */}
      {answerWs && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col" style={{ maxHeight: '90vh' }}>
            <div className="flex items-start justify-between p-6 pb-4 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-bold text-gray-900">정답 설정</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  <span className="font-medium text-gray-700">{answerWs.title}</span>
                  <span className="mx-1.5 text-gray-300">·</span>
                  총 {answerWs.problemCount}문제
                </p>
              </div>
              <button onClick={() => setAnswerWs(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none ml-4">×</button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {loadingAnswers ? (
                <div className="py-12 text-center text-gray-400 text-sm">불러오는 중...</div>
              ) : (
                <>
                  <p className="text-xs text-gray-400 mb-4">
                    각 문제의 정답을 입력하세요
                    <span className="ml-2 text-gray-300">예: ①  ②  15  2x+3  정삼각형</span>
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {answerInputs.map((ans, i) => (
                      <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2.5 border border-gray-200 focus-within:border-indigo-400 focus-within:bg-indigo-50/30 transition-colors">
                        <span className="text-xs font-bold text-gray-400 w-8 shrink-0 tabular-nums">{i + 1}번</span>
                        <input
                          type="text"
                          value={ans}
                          onChange={e => {
                            const v = e.target.value
                            setAnswerInputs(prev => { const n = [...prev]; n[i] = v; return n })
                          }}
                          placeholder="정답"
                          className="flex-1 text-sm outline-none bg-transparent text-gray-800 placeholder-gray-300 min-w-0"
                        />
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="flex gap-3 p-6 pt-4 border-t border-gray-100">
              <button onClick={() => setAnswerWs(null)}
                className="flex-1 border border-gray-300 text-gray-600 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-50 transition-colors">
                취소
              </button>
              <button onClick={saveAnswers} disabled={savingAnswers || loadingAnswers}
                className="flex-1 bg-emerald-600 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                {savingAnswers ? '저장 중...' : '정답 저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
