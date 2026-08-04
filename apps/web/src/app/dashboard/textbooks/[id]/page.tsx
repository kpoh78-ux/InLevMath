'use client'

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { apiFetch } from '@/lib/api'
import {
  IMAGE_ANSWER_MARKER, isImageAnswer, TEXTBOOK_SECTION_PRESETS,
  PROBLEM_PAGE_SIZE_MAX, MAX_BOOK_PAGE, type TextbookProblemType,
} from '@/lib/answers'
import {
  AnswerLightbox, AnswerThumb, SymbolPalette, SnapshotHint,
  AttachImageButton, RemoveImageButton, SectionPresetPicker,
  useSymbolPalette, useImageAttach,
} from '@/components/AnswerInput'

type Problem = {
  id: string; number: number; bookPage: number
  majorUnit: string; middleUnit: string; minorUnit: string; section: string; subSection: string
  type: TextbookProblemType; answer: string
}

type PageGroup = {
  bookPage: number; count: number; answered: number; firstNumber: number
  majorUnit: string; middleUnit: string; minorUnit: string
}

type UnitGroup = {
  majorUnit: string; middleUnit: string; minorUnit: string; section: string
  count: number; answered: number; firstNumber: number; lastNumber: number
}

type Student = { id: string; name: string; grade: string }

type ResultSummary = {
  studentId: string; studentName: string; wrongCount: number; submittedAt: string
}

type TextbookOverview = {
  id: string; title: string; grade: string; publisher: string
  problemCount: number; answeredCount: number
  pages: PageGroup[]
  units: UnitGroup[]
  results: ResultSummary[]
  students: Student[]
}

type Tab = 'answers' | 'grading'
type NavMode = 'page' | 'unit'
type UnitFilter = { majorUnit: string; middleUnit: string; minorUnit: string; section: string }

/** 한 페이지 안에서 소단원·문제유형으로 나뉜 입력 구역 */
type Block = {
  id: string
  bookPage: number
  minorUnit: string
  section: string
  subSection: string
  numbers: number[]
}

const filterKey = (f: UnitFilter) => [f.majorUnit, f.middleUnit, f.minorUnit, f.section].join(' ')
const unitOf = (u: UnitGroup): UnitFilter => ({
  majorUnit: u.majorUnit, middleUnit: u.middleUnit, minorUnit: u.minorUnit, section: u.section,
})
const labelOf = (v: string, fallback: string) => v || fallback
const pageLabel = (p: number) => (p > 0 ? `${p}P` : '페이지 미지정')

/** 불러온 문제들을 (소단원 · 유형) 기준 구역으로 묶는다. 순서는 문제 번호 순 */
function buildBlocks(problems: Problem[]): Block[] {
  const map = new Map<string, Block>()
  for (const p of problems) {
    const id = `${p.bookPage}|${p.minorUnit}|${p.section}|${p.subSection}`
    if (!map.has(id)) {
      map.set(id, {
        id, bookPage: p.bookPage, minorUnit: p.minorUnit,
        section: p.section, subSection: p.subSection, numbers: [],
      })
    }
    map.get(id)!.numbers.push(p.number)
  }
  return [...map.values()].sort((a, b) => a.numbers[0] - b.numbers[0])
}

function TextbookDetailPageInner() {
  const { id } = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const preselectedStudent = searchParams.get('student')

  const [overview, setOverview] = useState<TextbookOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>(preselectedStudent ? 'grading' : 'answers')

  const [navMode, setNavMode] = useState<NavMode>('page')
  const [selectedPage, setSelectedPage] = useState<number | null>(null)
  const [selectedUnit, setSelectedUnit] = useState<UnitFilter | null>(null)

  const [problems, setProblems] = useState<Problem[]>([])
  const [blocks, setBlocks] = useState<Block[]>([])
  const [images, setImages] = useState<Record<number, string>>({})
  const [loadingProblems, setLoadingProblems] = useState(false)

  // 이 화면에서 값이 바뀐 문제 번호 — 저장 시 변경분만 전송
  const [dirtyNos, setDirtyNos] = useState<Set<number>>(new Set())
  const [newImageNos, setNewImageNos] = useState<Set<number>>(new Set())
  const [saving, setSaving] = useState(false)
  const [zoomSrc, setZoomSrc] = useState<string | null>(null)

  // 구역 추가 폼
  const [addOpen, setAddOpen] = useState(false)
  const [addForm, setAddForm] = useState({
    bookPage: '', majorUnit: '', middleUnit: '', minorUnit: '', section: '', subSection: '', count: '10',
    type: 'multiple' as TextbookProblemType,
  })
  const [adding, setAdding] = useState(false)
  // 구역별 "추가/삭제할 문제 수" 입력값
  const [blockAddCount, setBlockAddCount] = useState<Record<string, string>>({})

  // 문제유형 목록 — 선생님 계정에 저장되며 직접 추가·삭제한다
  const [sectionPresets, setSectionPresets] = useState<string[]>(TEXTBOOK_SECTION_PRESETS)

  // 채점 탭
  const [selectedStudentId, setSelectedStudentId] = useState<string>(preselectedStudent ?? '')
  const [wrongSet, setWrongSet] = useState<Set<number>>(new Set())
  const [initialWrongSet, setInitialWrongSet] = useState<Set<number>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [gradedResult, setGradedResult] = useState<{
    correctRate: number
    newAbility: { comprehension: number; reasoning: number; calculation: number }
  } | null>(null)

  // ── 데이터 로딩 ───────────────────────────────────────────────

  const fetchOverview = useCallback(async () => {
    const res = await apiFetch(`/api/textbooks/${id}`)
    if (res.ok) setOverview(await res.json())
    setLoading(false)
  }, [id])

  useEffect(() => { fetchOverview() }, [fetchOverview])

  useEffect(() => {
    apiFetch('/api/teacher/section-presets')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.presets) setSectionPresets(d.presets) })
      .catch(() => { /* 실패해도 기본 목록으로 동작 */ })
  }, [])

  /** 목록 변경 즉시 저장 — 실패하면 되돌린다 */
  const saveSectionPresets = useCallback(async (next: string[]) => {
    const prev = sectionPresets
    setSectionPresets(next)
    const res = await apiFetch('/api/teacher/section-presets', {
      method: 'PUT',
      body: JSON.stringify({ presets: next }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({})) as { error?: string }
      alert(d.error || '문제유형 목록 저장 실패')
      setSectionPresets(prev)
    }
  }, [sectionPresets])

  const addSectionPreset = useCallback((name: string) => {
    if (sectionPresets.includes(name)) return
    saveSectionPresets([...sectionPresets, name])
  }, [sectionPresets, saveSectionPresets])

  const removeSectionPreset = useCallback((name: string) => {
    saveSectionPresets(sectionPresets.filter(s => s !== name))
  }, [sectionPresets, saveSectionPresets])

  // 첫 로딩 시 첫 페이지 자동 선택
  useEffect(() => {
    if (!overview || selectedPage !== null || selectedUnit !== null) return
    if (overview.pages.length > 0) setSelectedPage(overview.pages[0].bookPage)
  }, [overview, selectedPage, selectedUnit])

  const fetchProblems = useCallback(async () => {
    setLoadingProblems(true)
    try {
      const qs = new URLSearchParams({ page: '1', pageSize: String(PROBLEM_PAGE_SIZE_MAX) })
      if (navMode === 'page') {
        if (selectedPage === null) { setProblems([]); setBlocks([]); return }
        qs.set('bookPage', String(selectedPage))
      } else if (selectedUnit) {
        qs.set('majorUnit', selectedUnit.majorUnit)
        qs.set('middleUnit', selectedUnit.middleUnit)
        qs.set('minorUnit', selectedUnit.minorUnit)
        qs.set('section', selectedUnit.section)
      }
      const res = await apiFetch(`/api/textbooks/${id}/problems?${qs}`)
      if (res.ok) {
        const d = await res.json() as { problems: Problem[]; images: Record<number, string> }
        setProblems(d.problems)
        setBlocks(buildBlocks(d.problems))
        setImages(d.images ?? {})
        setDirtyNos(new Set())
        setNewImageNos(new Set())
      }
    } finally { setLoadingProblems(false) }
  }, [id, navMode, selectedPage, selectedUnit])

  useEffect(() => { fetchProblems() }, [fetchProblems])

  const loadStudentResult = useCallback(async (studentId: string) => {
    setGradedResult(null)
    if (!studentId) { setWrongSet(new Set()); setInitialWrongSet(new Set()); return }
    const res = await apiFetch(`/api/textbooks/${id}/results/${studentId}`)
    if (res.ok) {
      const d = await res.json() as { wrongProblems: number[] }
      setWrongSet(new Set(d.wrongProblems))
      setInitialWrongSet(new Set(d.wrongProblems))
    }
  }, [id])

  useEffect(() => {
    if (!overview) return
    const init = preselectedStudent ?? overview.students[0]?.id ?? ''
    setSelectedStudentId(prev => prev || init)
  }, [overview, preselectedStudent])

  useEffect(() => {
    if (selectedStudentId) loadStudentResult(selectedStudentId)
  }, [selectedStudentId, loadStudentResult])

  // ── 정답 편집 ─────────────────────────────────────────────────

  const markDirty = (nums: number[]) =>
    setDirtyNos(prev => { const n = new Set(prev); nums.forEach(x => n.add(x)); return n })

  const patchProblems = useCallback((nums: number[], patch: Partial<Problem>) => {
    const target = new Set(nums)
    setProblems(prev => prev.map(p => target.has(p.number) ? { ...p, ...patch } : p))
    markDirty(nums)
  }, [])

  const setAnswerValue = useCallback((num: number, answer: string) => {
    patchProblems([num], { answer })
  }, [patchProblems])

  const palette = useSymbolPalette<number>(setAnswerValue)

  const onImageAttached = useCallback((num: number, dataUrl: string) => {
    setImages(prev => ({ ...prev, [num]: dataUrl }))
    setNewImageNos(prev => new Set(prev).add(num))
    setProblems(prev => prev.map(p =>
      p.number === num ? { ...p, answer: IMAGE_ANSWER_MARKER, type: 'image' } : p))
    markDirty([num])
    palette.release(num)
  }, [palette])

  const attach = useImageAttach<number>(onImageAttached)

  const removeImage = (num: number) => {
    setImages(prev => { const n = { ...prev }; delete n[num]; return n })
    setNewImageNos(prev => { const n = new Set(prev); n.delete(num); return n })
    patchProblems([num], { answer: '', type: 'short' })
  }

  const setType = (num: number, type: TextbookProblemType) => {
    if (type !== 'image' && images[num]) { removeImage(num); return }
    patchProblems([num], type === 'image' ? { type } : { type, answer: '' })
  }

  /** 구역 머리말 수정 → 그 구역의 모든 문제에 반영 */
  const patchBlock = (blockId: string, patch: Partial<Pick<Block, 'bookPage' | 'minorUnit' | 'section' | 'subSection'>>) => {
    setBlocks(prev => prev.map(b => b.id === blockId ? { ...b, ...patch } : b))
    const block = blocks.find(b => b.id === blockId)
    if (block) patchProblems(block.numbers, patch)
  }

  const saveProblems = async () => {
    if (dirtyNos.size === 0) { alert('변경된 정답이 없습니다.'); return }
    setSaving(true)
    try {
      const upserts = problems
        .filter(p => dirtyNos.has(p.number))
        .map(p => ({
          number: p.number, bookPage: p.bookPage,
          majorUnit: p.majorUnit, middleUnit: p.middleUnit,
          minorUnit: p.minorUnit, section: p.section, subSection: p.subSection,
          type: p.type,
          // 새로 첨부한 이미지만 data URL로 올리고 기존 이미지는 마커로 유지
          answer: isImageAnswer(p.answer) && newImageNos.has(p.number)
            ? (images[p.number] ?? '')
            : p.answer,
        }))

      const res = await apiFetch(`/api/textbooks/${id}/problems`, {
        method: 'PUT',
        body: JSON.stringify({ upserts }),
      })
      if (res.ok) {
        await Promise.all([fetchProblems(), fetchOverview()])
        alert(`${upserts.length}문제 정답이 저장되었습니다.`)
      } else {
        const d = await res.json().catch(() => ({})) as { error?: string }
        alert(d.error || '저장 실패')
      }
    } finally { setSaving(false) }
  }

  /** 문제 삭제 — 개별 / 구역 전체 / 페이지 전체 공용 */
  const deleteProblems = async (nums: number[], label: string) => {
    if (nums.length === 0) return
    if (!confirm(`${label}\n문제 ${nums.length}개와 입력된 정답이 삭제됩니다. 계속할까요?`)) return
    setSaving(true)
    try {
      const res = await apiFetch(`/api/textbooks/${id}/problems`, {
        method: 'PUT',
        body: JSON.stringify({ deletes: nums }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        alert(d.error || '삭제 실패')
        return
      }
      const overviewRes = await apiFetch(`/api/textbooks/${id}`)
      if (overviewRes.ok) {
        const ov = await overviewRes.json() as TextbookOverview
        setOverview(ov)
        // 페이지가 통째로 비었으면 남아 있는 첫 페이지로 옮긴다
        if (navMode === 'page' && !ov.pages.some(p => p.bookPage === selectedPage)) {
          setSelectedPage(ov.pages[0]?.bookPage ?? null)
          return
        }
      }
      await fetchProblems()
    } finally { setSaving(false) }
  }

  /** 구역 뒤에 문제 N개 추가 */
  const addToBlock = async (block: Block, count: number) => {
    if (!count || count < 1) return
    setSaving(true)
    try {
      const res = await apiFetch(`/api/textbooks/${id}/problems`, {
        method: 'POST',
        body: JSON.stringify({
          count,
          bookPage: block.bookPage,
          majorUnit: problemByNo.get(block.numbers[0])?.majorUnit ?? '',
          middleUnit: problemByNo.get(block.numbers[0])?.middleUnit ?? '',
          minorUnit: block.minorUnit,
          section: block.section,
          subSection: block.subSection,
          type: problemByNo.get(block.numbers[0])?.type ?? 'multiple',
        }),
      })
      const d = await res.json().catch(() => ({})) as { error?: string; from?: number; to?: number }
      if (!res.ok) { alert(d.error || '문제 추가 실패'); return }
      await Promise.all([fetchOverview(), fetchProblems()])
      if (d.from && d.to) alert(`${d.from}~${d.to}번 ${count}문제가 추가되었습니다.`)
    } finally { setSaving(false) }
  }

  const addBlock = async () => {
    const count = parseInt(addForm.count)
    if (!count || count < 1) { alert('추가할 문제 수를 입력해주세요.'); return }
    const bookPage = parseInt(addForm.bookPage)
    if (addForm.bookPage && (!bookPage || bookPage < 1 || bookPage > MAX_BOOK_PAGE)) {
      alert(`교재 페이지는 1~${MAX_BOOK_PAGE} 사이로 입력해주세요.`); return
    }
    setAdding(true)
    try {
      const res = await apiFetch(`/api/textbooks/${id}/problems`, {
        method: 'POST',
        body: JSON.stringify({ ...addForm, count, bookPage: bookPage || 0 }),
      })
      const d = await res.json().catch(() => ({})) as { error?: string; bookPage?: number }
      if (!res.ok) { alert(d.error || '구역 추가 실패'); return }
      await fetchOverview()
      // 방금 추가한 페이지로 이동
      setNavMode('page')
      setSelectedUnit(null)
      setSelectedPage(d.bookPage ?? 0)
      setAddOpen(false)
      setAddForm(f => ({ ...f, section: '', count: '10' }))
    } finally { setAdding(false) }
  }

  // ── 채점 ──────────────────────────────────────────────────────

  const toggleProblem = (num: number) => {
    setWrongSet(prev => {
      const next = new Set(prev)
      if (next.has(num)) next.delete(num); else next.add(num)
      return next
    })
  }

  const submitGrade = async () => {
    if (!selectedStudentId) { alert('학생을 선택해주세요.'); return }
    setSubmitting(true)
    try {
      const res = await apiFetch(`/api/teacher/grade/textbook/${id}`, {
        method: 'POST',
        body: JSON.stringify({ studentId: selectedStudentId, wrongProblems: Array.from(wrongSet) }),
      })
      if (res.ok) {
        setGradedResult(await res.json())
        setInitialWrongSet(new Set(wrongSet))
        await fetchOverview()
      } else {
        const d = await res.json().catch(() => ({})) as { error?: string }
        alert(d.error || '채점 저장 실패')
      }
    } finally { setSubmitting(false) }
  }

  // ── 이동 (저장 안 한 값 보호) ─────────────────────────────────

  const confirmDiscard = () =>
    dirtyNos.size === 0 ||
    confirm(`저장하지 않은 정답이 ${dirtyNos.size}문제 있습니다.\n이동하면 사라집니다. 계속할까요?`)

  const gotoPage = (bookPage: number) => {
    if (!confirmDiscard()) return
    setNavMode('page')
    setSelectedUnit(null)
    setSelectedPage(bookPage)
  }

  const gotoUnit = (unit: UnitFilter | null) => {
    if (!confirmDiscard()) return
    setNavMode('unit')
    setSelectedPage(null)
    setSelectedUnit(unit)
  }

  // ── 파생값 ────────────────────────────────────────────────────

  const pages = overview?.pages ?? []
  const pageIndex = pages.findIndex(p => p.bookPage === selectedPage)
  const prevPage = pageIndex > 0 ? pages[pageIndex - 1] : null
  const nextPage = pageIndex >= 0 && pageIndex < pages.length - 1 ? pages[pageIndex + 1] : null

  const unitTree = useMemo(() => {
    const tree = new Map<string, Map<string, Map<string, UnitGroup[]>>>()
    for (const u of overview?.units ?? []) {
      const major = labelOf(u.majorUnit, '대단원 미지정')
      const middle = labelOf(u.middleUnit, '중단원 미지정')
      const minor = labelOf(u.minorUnit, '소단원 미지정')
      if (!tree.has(major)) tree.set(major, new Map())
      const mid = tree.get(major)!
      if (!mid.has(middle)) mid.set(middle, new Map())
      const min = mid.get(middle)!
      if (!min.has(minor)) min.set(minor, [])
      min.get(minor)!.push(u)
    }
    return tree
  }, [overview])

  const problemByNo = useMemo(
    () => new Map(problems.map(p => [p.number, p])), [problems]
  )

  const selectedStudent = overview?.students.find(s => s.id === selectedStudentId)
  const resultOf = (studentId: string) => overview?.results.find(r => r.studentId === studentId) ?? null
  const wrongChanged = wrongSet.size !== initialWrongSet.size
    || [...wrongSet].some(n => !initialWrongSet.has(n))

  if (loading) return <div className="py-20 text-center text-gray-400 text-sm">불러오는 중...</div>
  if (!overview) return <div className="py-20 text-center text-gray-400 text-sm">교재를 찾을 수 없습니다.</div>

  const viewLabel = navMode === 'page'
    ? (selectedPage === null ? '페이지를 선택하세요' : pageLabel(selectedPage))
    : selectedUnit
      ? ([selectedUnit.majorUnit, selectedUnit.middleUnit, selectedUnit.minorUnit, selectedUnit.section]
          .filter(Boolean).join(' › ') || '단원 미지정')
      : '전체 문제'

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <Link
          href={preselectedStudent ? `/dashboard/textbooks?student=${preselectedStudent}` : '/dashboard/textbooks'}
          className="text-gray-400 hover:text-gray-600 text-sm"
        >
          ← 교재 목록
        </Link>
        <span className="text-gray-300">|</span>
        <div>
          <h1 className="text-lg font-bold text-gray-900">{overview.title}</h1>
          <p className="text-xs text-gray-400">
            {overview.grade} · {overview.publisher} · 총 {overview.problemCount.toLocaleString()}문제
            <span className="mx-1.5 text-gray-300">·</span>
            정답 입력 {overview.answeredCount.toLocaleString()}문제
            {overview.problemCount > 0 && ` (${Math.round(overview.answeredCount / overview.problemCount * 100)}%)`}
          </p>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex border-b border-gray-200">
        {([['answers', '정답 입력'], ['grading', '학생 채점']] as [Tab, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {label}
          </button>
        ))}
      </div>

      <div className="flex gap-4 items-start">
        {/* ── 왼쪽: 페이지 / 단원 목록 ── */}
        <aside className="w-56 shrink-0 space-y-2">
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="flex border-b border-gray-100">
              {([['page', '페이지'], ['unit', '단원']] as [NavMode, string][]).map(([m, label]) => (
                <button key={m}
                  onClick={() => m === 'page' ? gotoPage(pages[0]?.bookPage ?? 0) : gotoUnit(null)}
                  className={`flex-1 py-2 text-xs font-semibold transition-colors ${
                    navMode === m ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500 hover:bg-gray-50'
                  }`}>
                  {label}
                </button>
              ))}
            </div>

            <div className="max-h-[62vh] overflow-y-auto py-1">
              {navMode === 'page' ? (
                pages.length === 0 ? (
                  <p className="px-3 py-4 text-xs text-gray-400">아직 문제가 없습니다.</p>
                ) : pages.map((pg, i) => {
                  const prev = pages[i - 1]
                  // 소단원이 바뀌는 지점에 구분 머리말을 끼워 넣는다
                  const showHeading = pg.minorUnit && (!prev || prev.minorUnit !== pg.minorUnit)
                  const done = pg.count > 0 && pg.answered === pg.count
                  const partial = pg.answered > 0 && !done
                  return (
                    <div key={pg.bookPage}>
                      {showHeading && (
                        <div className="px-3 pt-2 pb-1 text-[11px] font-bold text-gray-700">{pg.minorUnit}</div>
                      )}
                      <button
                        onClick={() => gotoPage(pg.bookPage)}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
                          selectedPage === pg.bookPage
                            ? 'bg-indigo-50 text-indigo-700 font-bold'
                            : 'text-gray-700 hover:bg-gray-50'
                        }`}>
                        <span className="flex-1 text-left">{pageLabel(pg.bookPage)}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                          done ? 'bg-emerald-50 text-emerald-600'
                          : partial ? 'bg-amber-50 text-amber-600'
                          : 'bg-gray-100 text-gray-400'
                        }`}>
                          {done ? '완료' : `${pg.answered}/${pg.count}`}
                        </span>
                      </button>
                    </div>
                  )
                })
              ) : (
                <>
                  <button
                    onClick={() => gotoUnit(null)}
                    className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                      selectedUnit === null ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-gray-600 hover:bg-gray-50'
                    }`}>
                    전체 ({overview.problemCount.toLocaleString()})
                  </button>
                  {[...unitTree.entries()].map(([major, middles]) => (
                    <div key={major} className="mt-1">
                      <div className="px-3 py-1 text-[11px] font-bold text-gray-700 bg-gray-50/70">{major}</div>
                      {[...middles.entries()].map(([middle, minors]) => (
                        <div key={middle}>
                          <div className="px-3 pl-4 py-0.5 text-[11px] text-gray-500">{middle}</div>
                          {[...minors.entries()].map(([minor, groups]) => (
                            <div key={minor}>
                              <div className="px-3 pl-6 py-0.5 text-[11px] text-gray-400">{minor}</div>
                              {groups.map(g => {
                                const active = selectedUnit !== null && filterKey(selectedUnit) === filterKey(unitOf(g))
                                return (
                                  <button
                                    key={filterKey(unitOf(g))}
                                    onClick={() => gotoUnit(unitOf(g))}
                                    className={`w-full text-left pl-8 pr-3 py-1 text-xs flex items-center gap-1.5 transition-colors ${
                                      active ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-gray-600 hover:bg-gray-50'
                                    }`}>
                                    <span className="flex-1 truncate">{g.section || '유형 미지정'}</span>
                                    <span className={`text-[10px] tabular-nums ${g.answered === g.count ? 'text-emerald-600' : 'text-gray-400'}`}>
                                      {g.answered}/{g.count}
                                    </span>
                                  </button>
                                )
                              })}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  ))}
                  {overview.units.length === 0 && (
                    <p className="px-3 py-4 text-xs text-gray-400">아직 문제가 없습니다.</p>
                  )}
                </>
              )}
            </div>
          </div>
        </aside>

        {/* ── 오른쪽: 본문 ── */}
        <div className="flex-1 min-w-0 space-y-3">
          {/* 현재 위치 + 페이지 이동 */}
          <div className="bg-white border border-gray-200 rounded-xl px-4 py-2.5 flex items-center gap-3">
            <span className="text-sm font-bold text-gray-800 truncate">{viewLabel}</span>
            <span className="text-xs text-gray-400 shrink-0">{problems.length}문제</span>
            {navMode === 'page' && (
              <div className="ml-auto flex items-center gap-1.5 shrink-0">
                <button onClick={() => prevPage && gotoPage(prevPage.bookPage)} disabled={!prevPage}
                  className="px-2.5 py-1 text-xs rounded border border-gray-200 text-gray-600 hover:border-indigo-400 disabled:opacity-40">
                  ← 이전 페이지{prevPage ? ` (${pageLabel(prevPage.bookPage)})` : ''}
                </button>
                <button onClick={() => nextPage && gotoPage(nextPage.bookPage)} disabled={!nextPage}
                  className="px-2.5 py-1 text-xs rounded border border-gray-200 text-gray-600 hover:border-indigo-400 disabled:opacity-40">
                  다음 페이지{nextPage ? ` (${pageLabel(nextPage.bookPage)})` : ''} →
                </button>
                {tab === 'answers' && problems.length > 0 && (
                  <button
                    onClick={() => deleteProblems(
                      problems.map(p => p.number),
                      `${viewLabel} 전체를 삭제합니다.`
                    )}
                    disabled={saving}
                    className="px-2.5 py-1 text-xs rounded border border-rose-200 text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-50 whitespace-nowrap">
                    페이지 삭제
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ── 정답 입력 탭 ── */}
          {tab === 'answers' && (
            <>
              <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
                <SnapshotHint />
                <SymbolPalette
                  onInsert={palette.insert}
                  disabled={palette.focusedKey === null}
                  hint={palette.focusedKey !== null ? `선택된 칸: ${palette.focusedKey}번` : undefined}
                />
              </div>

              {loadingProblems ? (
                <div className="bg-white border border-gray-200 rounded-xl py-16 text-center text-gray-400 text-sm">
                  불러오는 중...
                </div>
              ) : blocks.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-xl py-16 text-center text-gray-400 text-sm">
                  이 페이지에 등록된 문제가 없습니다. 아래 &ldquo;+ 구역 추가&rdquo;로 문제를 만들어 주세요.
                </div>
              ) : blocks.map(block => (
                <div key={block.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  {/* 구역 머리말 — 페이지 / 소단원 / 문제유형 */}
                  <div className="bg-gray-50 border-b border-gray-200 px-4 py-2.5 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <label className="text-[11px] text-gray-500">교재 페이지</label>
                      <input
                        type="number" min={0} max={MAX_BOOK_PAGE} value={block.bookPage || ''}
                        onChange={e => patchBlock(block.id, { bookPage: parseInt(e.target.value) || 0 })}
                        placeholder="쪽"
                        className="w-16 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      />
                      <input
                        type="text" value={block.minorUnit}
                        onChange={e => patchBlock(block.id, { minorUnit: e.target.value })}
                        placeholder="소단원명"
                        className="w-44 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      />
                      <input
                        type="text" value={block.section}
                        onChange={e => patchBlock(block.id, { section: e.target.value })}
                        placeholder="문제유형 (필수유형 / 확인 체크 …)"
                        className="w-44 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      />
                      <input
                        type="text" value={block.subSection}
                        onChange={e => patchBlock(block.id, { subSection: e.target.value })}
                        placeholder="하위 단계 (유형 1 / 심화 / (1) …)"
                        className="flex-1 min-w-[150px] border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      />
                      <span className="text-[11px] text-gray-400 tabular-nums shrink-0">
                        {block.numbers[0]}~{block.numbers[block.numbers.length - 1]}번 · {block.numbers.length}문제
                      </span>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex-1">
                        <SectionPresetPicker
                          presets={sectionPresets}
                          value={block.section}
                          onSelect={s => patchBlock(block.id, { section: s })}
                          onAddPreset={addSectionPreset}
                          onRemovePreset={removeSectionPreset}
                        />
                      </div>

                      {/* 구역 문제 수 조절 */}
                      <div className="flex items-center gap-1 shrink-0">
                        <input
                          type="number" min={1} max={PROBLEM_PAGE_SIZE_MAX}
                          value={blockAddCount[block.id] ?? '5'}
                          onChange={e => setBlockAddCount(prev => ({ ...prev, [block.id]: e.target.value }))}
                          title="추가할 문제 수"
                          className="w-14 border border-gray-300 rounded px-1.5 py-1 text-[11px] focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        />
                        <button type="button" disabled={saving}
                          onClick={() => addToBlock(block, parseInt(blockAddCount[block.id] ?? '5'))}
                          className="text-[11px] px-2 py-1 rounded border border-indigo-200 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-colors disabled:opacity-50 whitespace-nowrap">
                          + 문제 추가
                        </button>
                        <button type="button" disabled={saving}
                          onClick={() => deleteProblems(
                            block.numbers.slice(-Math.max(1, parseInt(blockAddCount[block.id] ?? '5'))),
                            `${block.section || '이 구역'}의 마지막 문제를 지웁니다.`
                          )}
                          className="text-[11px] px-2 py-1 rounded border border-gray-200 text-gray-500 hover:border-rose-300 hover:text-rose-600 transition-colors disabled:opacity-50 whitespace-nowrap">
                          − 뒤에서 삭제
                        </button>
                        <button type="button" disabled={saving}
                          onClick={() => deleteProblems(
                            block.numbers,
                            `[${pageLabel(block.bookPage)} · ${block.section || '유형 미지정'}] 구역을 통째로 삭제합니다.`
                          )}
                          className="text-[11px] px-2 py-1 rounded border border-rose-200 text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-50 whitespace-nowrap">
                          구역 삭제
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 구역 안 문제들 */}
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-gray-50">
                      {block.numbers.map(num => {
                        const p = problemByNo.get(num)
                        if (!p) return null
                        const img = isImageAnswer(p.answer) ? images[num] : undefined
                        const busy = attach.busyKey === num
                        const dirty = dirtyNos.has(num)
                        return (
                          <tr key={num}
                            onDragOver={e => e.preventDefault()}
                            onDrop={e => attach.handleDrop(num, e)}
                            className={dirty ? 'bg-amber-50/40' : 'hover:bg-gray-50'}>
                            <td className="px-4 py-2 font-bold text-gray-700 tabular-nums w-14">
                              {num}
                              {dirty && <span className="ml-1 text-[10px] text-amber-500">●</span>}
                            </td>
                            <td className="px-2 py-2 w-32">
                              <div className="flex gap-1">
                                {(['multiple', 'short', 'image'] as TextbookProblemType[]).map(t => (
                                  <button key={t} onClick={() => setType(num, t)}
                                    className={`text-[11px] px-1.5 py-1 rounded transition-colors ${
                                      p.type === t ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                    }`}>
                                    {t === 'multiple' ? '객관식' : t === 'short' ? '주관식' : '이미지'}
                                  </button>
                                ))}
                              </div>
                            </td>
                            <td className="px-4 py-2">
                              {busy ? (
                                <span className="text-xs text-gray-400">이미지 처리 중...</span>
                              ) : img ? (
                                <div className="flex items-center gap-2">
                                  <AnswerThumb src={img} onZoom={setZoomSrc} />
                                  <RemoveImageButton onClick={() => removeImage(num)} />
                                </div>
                              ) : p.type === 'multiple' ? (
                                <div className="flex gap-1.5 items-center">
                                  {[1, 2, 3, 4, 5].map(n => (
                                    <button key={n} onClick={() => setAnswerValue(num, String(n))}
                                      className={`w-7 h-7 rounded-full text-xs font-bold transition-colors border ${
                                        p.answer === String(n)
                                          ? 'bg-indigo-600 text-white border-indigo-600'
                                          : 'border-gray-300 text-gray-500 hover:border-indigo-400 hover:text-indigo-600'
                                      }`}>
                                      {n}
                                    </button>
                                  ))}
                                  {p.answer && (
                                    <button onClick={() => setAnswerValue(num, '')}
                                      className="text-[11px] text-gray-400 hover:text-rose-500 ml-1">지우기</button>
                                  )}
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <input
                                    ref={palette.registerRef(num)}
                                    type="text"
                                    value={isImageAnswer(p.answer) ? '' : p.answer}
                                    onChange={e => setAnswerValue(num, e.target.value)}
                                    onFocus={() => palette.setFocusedKey(num)}
                                    onPaste={e => attach.handlePaste(num, e)}
                                    placeholder={p.type === 'image' ? '캡처 이미지를 붙여넣으세요 (Ctrl+V)' : '정답 입력'}
                                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-72 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                  />
                                  <AttachImageButton onClick={() => attach.openFilePicker(num)} />
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2 w-10 text-right">
                              <button
                                type="button" disabled={saving}
                                onClick={() => deleteProblems([num], `${num}번 문제를 삭제합니다.`)}
                                title="이 문제 삭제"
                                className="w-6 h-6 rounded text-gray-300 hover:text-rose-500 hover:bg-rose-50 transition-colors text-base leading-none disabled:opacity-40"
                              >
                                ×
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ))}

              <attach.FileInput />

              {/* 구역 추가 */}
              <div className="bg-white border border-dashed border-gray-300 rounded-xl p-3">
                {!addOpen ? (
                  <button
                    onClick={() => {
                      setAddForm(f => ({
                        ...f,
                        bookPage: selectedPage && selectedPage > 0 ? String(selectedPage) : f.bookPage,
                        majorUnit: problems[0]?.majorUnit ?? f.majorUnit,
                        middleUnit: problems[0]?.middleUnit ?? f.middleUnit,
                        minorUnit: problems[0]?.minorUnit ?? f.minorUnit,
                      }))
                      setAddOpen(true)
                    }}
                    className="w-full py-2 text-sm font-semibold text-gray-500 hover:text-indigo-600 transition-colors">
                    + 구역 추가 (페이지 · 소단원 · 문제유형별)
                  </button>
                ) : (
                  <div className="space-y-2">
                    <div className="flex gap-2 flex-wrap items-center">
                      <input type="number" min={1} max={MAX_BOOK_PAGE} value={addForm.bookPage}
                        onChange={e => setAddForm(f => ({ ...f, bookPage: e.target.value }))}
                        placeholder="교재 쪽"
                        className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                      {([['majorUnit', '대단원'], ['middleUnit', '중단원'], ['minorUnit', '소단원']] as const).map(([key, ph]) => (
                        <input key={key} type="text" value={addForm[key]}
                          onChange={e => setAddForm(f => ({ ...f, [key]: e.target.value }))}
                          placeholder={ph}
                          className="w-32 border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                      ))}
                      <input type="text" value={addForm.section}
                        onChange={e => setAddForm(f => ({ ...f, section: e.target.value }))}
                        placeholder="문제유형"
                        className="w-36 border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                      <input type="text" value={addForm.subSection}
                        onChange={e => setAddForm(f => ({ ...f, subSection: e.target.value }))}
                        placeholder="하위 단계 (유형 1 / 심화 …)"
                        className="flex-1 min-w-[140px] border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                    </div>
                    <SectionPresetPicker
                      presets={sectionPresets}
                      value={addForm.section}
                      onSelect={s => setAddForm(f => ({ ...f, section: s }))}
                      onAddPreset={addSectionPreset}
                      onRemovePreset={removeSectionPreset}
                    />
                    <div className="flex gap-2 items-center flex-wrap">
                      <div className="flex gap-1">
                        {(['multiple', 'short', 'image'] as TextbookProblemType[]).map(t => (
                          <button key={t} type="button"
                            onClick={() => setAddForm(f => ({ ...f, type: t }))}
                            className={`text-[11px] px-2 py-1 rounded border transition-colors ${
                              addForm.type === t
                                ? 'bg-indigo-600 text-white border-indigo-600'
                                : 'border-gray-200 text-gray-500 hover:border-indigo-400'
                            }`}>
                            {t === 'multiple' ? '객관식' : t === 'short' ? '주관식' : '이미지'}
                          </button>
                        ))}
                      </div>
                      <input type="number" min={1} max={PROBLEM_PAGE_SIZE_MAX} value={addForm.count}
                        onChange={e => setAddForm(f => ({ ...f, count: e.target.value }))}
                        className="w-16 border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                      <span className="text-[11px] text-gray-400">문제</span>
                      <button onClick={addBlock} disabled={adding}
                        className="ml-auto bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50">
                        {adding ? '추가 중...' : '구역 추가'}
                      </button>
                      <button onClick={() => setAddOpen(false)}
                        className="text-xs text-gray-500 hover:text-gray-700 px-2">취소</button>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3">
                <p className="text-xs text-gray-400">
                  {dirtyNos.size > 0
                    ? `${dirtyNos.size}문제 변경됨 — 저장하지 않고 페이지를 옮기면 사라집니다`
                    : '변경 사항 없음'}
                </p>
                <button onClick={saveProblems} disabled={saving || dirtyNos.size === 0 || attach.busyKey !== null}
                  className="ml-auto bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors disabled:opacity-50">
                  {saving ? '저장 중...' : `정답 저장${dirtyNos.size > 0 ? ` (${dirtyNos.size})` : ''}`}
                </button>
              </div>
            </>
          )}

          {/* ── 학생 채점 탭 ── */}
          {tab === 'grading' && (
            <div className="flex gap-4 items-start">
              <div className="flex-1 min-w-0 space-y-3">
                {overview.students.length === 0 ? (
                  <div className="bg-gray-50 border border-gray-200 rounded-xl px-5 py-8 text-center text-gray-400 text-sm">
                    등록된 재원 학생이 없습니다.
                  </div>
                ) : (
                  <>
                    <div className="flex gap-2 flex-wrap">
                      {overview.students.map(s => (
                        <button key={s.id} onClick={() => setSelectedStudentId(s.id)}
                          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                            selectedStudentId === s.id
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'border-gray-300 text-gray-600 hover:border-indigo-400'
                          }`}>
                          {s.name}
                        </button>
                      ))}
                    </div>

                    {selectedStudent && (
                      <div className="bg-white border border-gray-200 rounded-xl px-5 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm">
                            {selectedStudent.name.slice(0, 1)}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-800">{selectedStudent.name}</p>
                            <p className="text-xs text-gray-400">{selectedStudent.grade}</p>
                          </div>
                        </div>
                        {gradedResult ? (
                          <div className="flex items-center gap-6">
                            <div className="text-center">
                              <p className={`text-2xl font-black ${gradedResult.correctRate >= 80 ? 'text-emerald-600' : gradedResult.correctRate >= 60 ? 'text-amber-500' : 'text-rose-500'}`}>
                                {gradedResult.correctRate}%
                              </p>
                              <p className="text-xs text-gray-400">정답률</p>
                            </div>
                            <div className="text-xs text-gray-500 space-y-0.5">
                              <p>이해력 <span className="font-bold text-indigo-600">{gradedResult.newAbility.comprehension.toFixed(1)}</span></p>
                              <p>추론력 <span className="font-bold text-indigo-600">{gradedResult.newAbility.reasoning.toFixed(1)}</span></p>
                              <p>계산력 <span className="font-bold text-indigo-600">{gradedResult.newAbility.calculation.toFixed(1)}</span></p>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-4 text-sm text-gray-500">
                            <span>틀린 문제 <span className="font-bold text-rose-500 ml-1">{wrongSet.size}개</span></span>
                            <span>맞은 문제 <span className="font-bold text-emerald-600 ml-1">{overview.problemCount - wrongSet.size}개</span></span>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-[11px] text-amber-700">
                      채점은 교재 <b>전체 문제</b> 기준입니다. 아래 O/X는 현재 보고 있는 {viewLabel}의 {problems.length}문제만 보여주며,
                      다른 페이지의 채점 결과도 그대로 유지됩니다.
                    </div>

                    {problems.length === 0 ? (
                      <div className="bg-gray-50 border border-gray-200 rounded-xl px-5 py-8 text-center text-gray-400 text-sm">
                        먼저 &ldquo;정답 입력&rdquo; 탭에서 문제를 등록하세요.
                      </div>
                    ) : (
                      <>
                        <div className="flex gap-2">
                          <button onClick={() => setWrongSet(new Set(initialWrongSet))}
                            className="flex-1 text-xs font-semibold py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100 transition-colors">
                            변경 취소
                          </button>
                          <button onClick={() => setWrongSet(prev => {
                            const n = new Set(prev); problems.forEach(p => n.delete(p.number)); return n
                          })}
                            className="flex-1 text-xs font-semibold py-2 rounded-lg border border-indigo-300 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-colors">
                            이 페이지 전체 정답
                          </button>
                          <button onClick={() => setWrongSet(prev => {
                            const n = new Set(prev); problems.forEach(p => n.add(p.number)); return n
                          })}
                            className="flex-1 text-xs font-semibold py-2 rounded-lg border border-rose-300 text-rose-600 bg-rose-50 hover:bg-rose-100 transition-colors">
                            이 페이지 전체 오답
                          </button>
                        </div>

                        {blocks.map(block => (
                          <div key={block.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                            <div className="bg-gray-50 border-b border-gray-200 px-4 py-2 text-xs font-semibold text-gray-600">
                              {[pageLabel(block.bookPage), block.minorUnit, block.section].filter(Boolean).join(' · ')}
                            </div>
                            <div className="p-3 grid grid-cols-2 gap-2">
                              {block.numbers.map(num => {
                                const p = problemByNo.get(num)
                                if (!p) return null
                                const isWrong = wrongSet.has(num)
                                const img = isImageAnswer(p.answer) ? images[num] : undefined
                                return (
                                  <div key={num}
                                    role="button" tabIndex={0}
                                    onClick={() => toggleProblem(num)}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleProblem(num) }
                                    }}
                                    className={`flex items-center gap-3 px-3 py-2 rounded-xl border-2 transition-all cursor-pointer min-h-[46px] ${
                                      isWrong ? 'border-rose-400 bg-rose-50' : 'border-emerald-300 bg-emerald-50'
                                    }`}>
                                    <span className={`text-lg font-black w-6 text-center leading-none shrink-0 ${
                                      isWrong ? 'text-rose-500' : 'text-emerald-500'
                                    }`}>
                                      {isWrong ? 'X' : 'O'}
                                    </span>
                                    <span className="text-xs font-semibold text-gray-500 w-10 tabular-nums shrink-0">{num}번</span>
                                    {img ? (
                                      <AnswerThumb src={img} onZoom={setZoomSrc} />
                                    ) : p.answer ? (
                                      <span className="text-xs text-gray-400 truncate flex-1 text-left">
                                        정답: {p.type === 'multiple' ? `${p.answer}번` : p.answer}
                                      </span>
                                    ) : (
                                      <span className="text-xs text-gray-300 flex-1 text-left">정답 미입력</span>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        ))}

                        <div className="flex items-center gap-3">
                          <p className="text-xs text-gray-400">
                            {wrongChanged ? '변경된 채점이 있습니다' : '변경 사항 없음'}
                          </p>
                          <button onClick={submitGrade} disabled={submitting}
                            className="ml-auto bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-6 py-2.5 rounded-lg transition-colors disabled:opacity-50">
                            {submitting ? '저장 중...' : '채점 완료'}
                          </button>
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>

              {/* 전체 학생 채점 현황 */}
              <div className="w-52 space-y-2 shrink-0">
                <h3 className="text-sm font-semibold text-gray-700">전체 채점 현황</h3>
                {overview.students.length === 0 && <p className="text-xs text-gray-400">학생이 없습니다.</p>}
                {overview.students.map(s => {
                  const result = resultOf(s.id)
                  const rate = result && overview.problemCount > 0
                    ? Math.round((overview.problemCount - result.wrongCount) / overview.problemCount * 100)
                    : null
                  return (
                    <button key={s.id} onClick={() => setSelectedStudentId(s.id)}
                      className={`w-full text-left bg-white border rounded-xl p-3 transition-colors hover:border-indigo-300 ${
                        selectedStudentId === s.id ? 'border-indigo-400 ring-1 ring-indigo-300' : 'border-gray-200'
                      }`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-gray-800 text-sm">{s.name}</span>
                        <span className={`text-sm font-black ${
                          rate === null ? 'text-gray-300'
                          : rate >= 80 ? 'text-emerald-600'
                          : rate >= 60 ? 'text-amber-600' : 'text-red-500'}`}>
                          {rate !== null ? `${rate}%` : '-'}
                        </span>
                      </div>
                      <div className="text-xs text-gray-400">{result ? '채점 완료' : '미채점'}</div>
                      {rate !== null && (
                        <div className="mt-1.5 bg-gray-100 rounded-full h-1">
                          <div className="bg-indigo-500 h-1 rounded-full transition-all" style={{ width: `${rate}%` }} />
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <AnswerLightbox src={zoomSrc} onClose={() => setZoomSrc(null)} />
    </div>
  )
}

export default function TextbookDetailPage() {
  return (
    <Suspense>
      <TextbookDetailPageInner />
    </Suspense>
  )
}