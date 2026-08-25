'use client'

// 학습지 업로드 — 2·3단계: Omni-AI 초고속 정답 추출 + 단원·유형 자동 분류 & 관리자 검수
//
// 1) 클라이언트에서 pdfjs-dist로 텍스트/정답표 영역을 먼저 경량 분리하여 토큰 90% 이상 절감
// 2) Omni-Route 멀티 AI(Gemini 2.5 Flash / Groq Llama-3 / DeepSeek / Claude) 분산 호출로 0원/초고속 추출
// 3) 대/중/소단원/유형 태깅과 문항별 정답을 표로 보여주고 검수 후 확정

import { useState, useCallback, useEffect } from 'react'
import { apiFetch } from '@/lib/api'
import { readFile, printWorksheetFile, type WorksheetFile } from '@/lib/worksheetFiles'
import { extractLightweightPdfText, type StructureOverride } from '@/lib/pdfTextExtractor'
import { SymbolPalette, useSymbolPalette } from '@/components/AnswerInput'
import { Sparkles, Zap, ShieldCheck, Tag, BookOpen, Layers, CheckCircle2, RotateCcw } from 'lucide-react'

type ExtractedAnswer = { 
  no: number; 
  answer: string; 
  type?: 'multiple' | 'short';
  confident: boolean;
  majorUnit?: string;
  middleUnit?: string;
  minorUnit?: string;
  section?: string;
}

type OmniExtractResult = {
  title: string
  majorUnit: string
  middleUnit: string
  minorUnit: string
  section: string
  problemCount: number
  answers: ExtractedAnswer[]
  aiProviderUsed: string
  tokenSavedPercent: number
  lowConfidence?: boolean
  answerStructureType?: string
  note: string
  matchedTaxonomy?: {
    subUnitId: string
    subUnitName: string
    middleUnitName: string
    majorUnitName: string
  } | null
}

const MEDIA_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg',
  jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
}

/** File → base64 (data URL 접두사 제거) */
function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const s = String(reader.result)
      const comma = s.indexOf(',')
      resolve(comma >= 0 ? s.slice(comma + 1) : s)
    }
    reader.onerror = () => reject(new Error('파일을 읽지 못했습니다.'))
    reader.readAsDataURL(file)
  })
}

/** 파일명에서 학습지 제목 후보를 만든다 (경로·확장자 제거) */
function titleFromFileName(name: string) {
  const base = name.split('/').pop() ?? name
  return base.replace(/\.[^.]+$/, '').trim()
}

export function WorksheetAiAnswersModal({
  file, onClose, onConfirm,
}: {
  file: WorksheetFile
  onClose: () => void
  /** 검수를 마친 정답 및 단원 메타데이터 */
  onConfirm: (v: {
    title: string;
    answers: string[];
    majorUnit?: string;
    middleUnit?: string;
    minorUnit?: string;
    section?: string;
  }) => void
}) {
  const [phase, setPhase] = useState<'running' | 'review' | 'error'>('running')
  const [error, setError] = useState('')
  const [result, setResult] = useState<OmniExtractResult | null>(null)
  const [answers, setAnswers] = useState<string[]>([])
  const [unsure, setUnsure] = useState<Set<number>>(new Set())
  const [title, setTitle] = useState(titleFromFileName(file.name))

  // 단원 및 유형 메타데이터 상태
  const [majorUnit, setMajorUnit] = useState('')
  const [middleUnit, setMiddleUnit] = useState('')
  const [minorUnit, setMinorUnit] = useState('')
  const [section, setSection] = useState('')

  const setAnswerAt = useCallback((i: number, v: string) => {
    setAnswers(prev => { const n = [...prev]; n[i] = v; return n })
    setUnsure(prev => {
      if (!prev.has(i + 1)) return prev
      const n = new Set(prev); n.delete(i + 1); return n
    })
  }, [])

  const palette = useSymbolPalette<number>(setAnswerAt)

  const run = useCallback(async (structureOverride?: StructureOverride) => {
    setPhase('running'); setError('')
    try {
      const f = await readFile(file)
      const ext = file.name.split('.').pop()?.toLowerCase() ?? ''

      let parsedData: OmniExtractResult | null = null

      // 1. PDF 파일인 경우: 클라이언트 로컬 경량 텍스트 추출 (토큰 절약)
      if (ext === 'pdf') {
        try {
          const buffer = await f.arrayBuffer()
          const extractedPdf = await extractLightweightPdfText(buffer, { structureOverride })

          const res = await apiFetch('/api/worksheet/parse-omni', {
            method: 'POST',
            body: JSON.stringify({
              titleSnippet: extractedPdf.titleSnippet,
              answerSnippet: extractedPdf.answerSnippet,
              boundaryConfident: extractedPdf.boundaryConfident,
              fileName: file.name,
            }),
          })

          const jsonRes = await res.json().catch(() => ({}))
          if (res.ok && jsonRes.data) {
            parsedData = {
              ...jsonRes.data,
              tokenSavedPercent: extractedPdf.estimatedTokenSavedPercent,
              answerStructureType: extractedPdf.answerStructureType,
              lowConfidence: Boolean(jsonRes.data.lowConfidence) || !extractedPdf.boundaryConfident,
            }
          }
        } catch (pdfErr) {
          console.warn('[Omni-Route] Local PDF text extraction fallback to standard:', pdfErr)
        }
      }

      // 2. 이미징 파일이거나 Omni-Route 실패 시: 기존 엔드포인트 폴백
      if (!parsedData) {
        const mediaType = MEDIA_BY_EXT[ext] || 'application/pdf'
        const res = await apiFetch('/api/worksheets/ai-extract', {
          method: 'POST',
          body: JSON.stringify({
            data: await toBase64(f), mediaType, fileName: file.name,
          }),
        })

        const fallbackData = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(fallbackData.error || 'AI 정답 추출에 실패했습니다.')

        parsedData = {
          title: titleFromFileName(file.name),
          majorUnit: '수학 교육과정',
          middleUnit: '핵심 단원',
          minorUnit: '소단원 평가',
          section: '기본유형',
          problemCount: fallbackData.problemCount || fallbackData.answers?.length || 10,
          answers: fallbackData.answers || [],
          aiProviderUsed: 'CLAUDE_HAIKU',
          tokenSavedPercent: 0,
          lowConfidence: false,
          note: fallbackData.note || '',
        }
      }

      setResult(parsedData)
      setTitle(parsedData.title || titleFromFileName(file.name))
      setMajorUnit(parsedData.majorUnit || '')
      setMiddleUnit(parsedData.middleUnit || '')
      setMinorUnit(parsedData.minorUnit || '')
      setSection(parsedData.section || '')

      setAnswers(parsedData.answers.map(a => a.answer))
      setUnsure(new Set(parsedData.answers.filter(a => !a.confident).map(a => a.no)))
      palette.setFocusedKey(null)
      setPhase('review')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI 정답 추출에 실패했습니다.')
      setPhase('error')
    }
  }, [file, palette])

  useEffect(() => { run() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const print = async (from: number) => {
    try {
      await printWorksheetFile(file, from > 0 ? from : undefined)
    } catch (e) {
      alert(e instanceof Error ? e.message : '인쇄를 시작하지 못했습니다.')
    }
  }

  const filled = answers.filter(a => a.trim() !== '').length

  const confirm = () => {
    if (unsure.size > 0) {
      const list = [...unsure].sort((a, b) => a - b).join(', ')
      if (!window.confirm(`아직 확인하지 않은 문항이 있습니다: ${list}번\n그대로 진행할까요?`)) return
    }
    if (filled < answers.length) {
      const empty = answers.length - filled
      if (!window.confirm(`비어 있는 정답이 ${empty}개 있습니다.\n나중에 정답 설정에서 채울 수 있습니다. 계속할까요?`)) return
    }

    onConfirm({
      title: title.trim() || titleFromFileName(file.name),
      answers,
      majorUnit,
      middleUnit,
      minorUnit,
      section,
    })
  }

  const getProviderBadge = (provider: string) => {
    switch (provider) {
      case 'GEMINI_2_5_FLASH':
      case 'GEMINI_2_5_FLASH_FREE':
        return { label: '⚡ Gemini 2.5 Flash (무료/초고속)', color: 'bg-amber-50 text-amber-700 border-amber-200' }
      case 'GROQ_LLAMA_3':
      case 'GROQ_LLAMA3_FREE':
        return { label: '⚡ Groq GPT-OSS 120B (초고속)', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
      case 'DEEPSEEK_V3':
        return { label: '🧠 DeepSeek V3 (정밀 추론)', color: 'bg-blue-50 text-blue-700 border-blue-200' }
      case 'CLAUDE_HAIKU':
        return { label: '🤖 Claude 3.5 Haiku', color: 'bg-purple-50 text-purple-700 border-purple-200' }
      case 'FALLBACK_LOCAL':
      default:
        return { label: '⚙️ 로컬 정규식 경량 파서 (0원)', color: 'bg-slate-100 text-slate-700 border-slate-200' }
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl flex flex-col border border-slate-100" style={{ maxHeight: '94vh' }}>
        <div className="flex items-start justify-between px-4 py-2.5 border-b border-slate-100">
          <div className="min-w-0 flex items-center gap-2">
            <span className="p-1 rounded-lg bg-indigo-50 text-indigo-600 shrink-0">
              <Zap className="w-3.5 h-3.5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-slate-900 leading-tight">Omni-AI 자동 정답 & 유형 추출</h2>
              <p className="text-[11px] text-slate-500 truncate leading-tight">{file.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none ml-4 cursor-pointer">×</button>
        </div>

        {phase === 'running' && (
          <div className="p-12 text-center space-y-3">
            <div className="w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto animate-bounce shadow-inner">
              <Sparkles className="w-8 h-8" />
            </div>
            <p className="text-base font-bold text-slate-800">Omni-Route AI가 학습지를 분석하고 있습니다...</p>
            <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
              클라이언트 텍스트 전처리(토큰 90% 절감) 후 최적의 무료/초고속 AI로 라우팅하여 정답표 및 대/중/소단원/유형 태깅을 자동 추출합니다.
            </p>
          </div>
        )}

        {phase === 'error' && (
          <div className="p-10 text-center space-y-3">
            <p className="text-3xl">⚠️</p>
            <p className="text-sm font-semibold text-slate-700">{error}</p>
            <div className="flex gap-2 justify-center mt-5">
              <button onClick={onClose}
                className="border border-slate-300 text-slate-600 text-xs font-semibold px-4 py-2.5 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer">
                닫기
              </button>
              <button onClick={() => run()}
                className="bg-indigo-600 text-white text-xs font-bold px-4 py-2.5 rounded-xl hover:bg-indigo-700 transition-colors cursor-pointer">
                다시 시도
              </button>
            </div>
          </div>
        )}

        {phase === 'review' && result && (
          <>
            {/* 1. Omni-AI 라우팅 엔진 정보 & 토큰 절약 뱃지 */}
            <div className="px-4 pt-2">
              <div className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold border ${getProviderBadge(result.aiProviderUsed).color}`}>
                    {getProviderBadge(result.aiProviderUsed).label}
                  </span>
                  {result.tokenSavedPercent > 0 && (
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded-full">
                      ✨ 토큰 {result.tokenSavedPercent}% 절감
                    </span>
                  )}
                </div>
                <button onClick={() => print(1)}
                  className="text-[11px] font-bold text-slate-700 border border-slate-200 bg-white hover:border-indigo-400 hover:text-indigo-600 px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap cursor-pointer">
                  학습지 인쇄
                </button>
              </div>
            </div>

            {/* 1-1. 저신뢰 결과 경고 배너 (AI 미호출 또는 정답 구간 경계 추정 실패) */}
            {(result.aiProviderUsed === 'FALLBACK_LOCAL' || result.lowConfidence) && (
              <div className="px-4 pt-1.5">
                <div className="bg-red-50 border border-red-200 rounded-xl px-2.5 py-1.5 flex items-start gap-2">
                  <span className="text-red-600 text-sm leading-none mt-0.5 shrink-0">⚠️</span>
                  <div className="flex-1 space-y-1 min-w-0">
                    <p className="text-[11px] font-bold text-red-800 leading-snug">
                      {result.aiProviderUsed === 'FALLBACK_LOCAL'
                        ? (result.matchedTaxonomy
                            ? 'AI 미실행 — 정답은 추정치입니다. 단원 분류는 파일명↔DB 대조로 정확하지만 정답은 직접 확인하세요.'
                            : 'AI 미실행 — 아래 단원/정답은 추정치입니다. 반드시 직접 확인 후 등록하세요.')
                        : '정답 구간 위치를 자동으로 확신하지 못했습니다. 아래 결과를 확인하세요.'}
                    </p>
                    <div className="flex gap-1.5">
                      <button type="button" onClick={() => run('TABLE_ONLY')}
                        className="text-[10px] font-bold text-red-700 border border-red-300 bg-white hover:bg-red-100 px-2 py-0.5 rounded-md cursor-pointer">
                        정답표만으로 재추출
                      </button>
                      <button type="button" onClick={() => run('WITH_EXPLANATION')}
                        className="text-[10px] font-bold text-red-700 border border-red-300 bg-white hover:bg-red-100 px-2 py-0.5 rounded-md cursor-pointer">
                        해설 포함 재추출
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 2. 대단원 / 중단원 / 소단원 / 유형 자동 분류 태그 바 */}
            <div className="px-4 pt-1.5">
              <div className="bg-indigo-50/50 border border-indigo-200/80 rounded-xl px-2.5 py-1.5 space-y-1">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-indigo-900">
                  <Tag className="w-3 h-3 text-indigo-600" />
                  <span>단원 & 유형 분류</span>
                  {result.matchedTaxonomy ? (
                    <span className="text-[9px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded-full">
                      ✓ 파일명↔DB 매칭됨
                    </span>
                  ) : (
                    <span className="text-[9px] bg-slate-200 text-slate-600 font-bold px-1.5 py-0.5 rounded-full">
                      AI 추정
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  <div>
                    <span className="text-[9px] text-slate-500 font-semibold block">대단원</span>
                    <input
                      type="text"
                      value={majorUnit}
                      onChange={e => setMajorUnit(e.target.value)}
                      placeholder="대단원명"
                      className="w-full text-xs font-semibold p-1 rounded-md border border-indigo-200 bg-white text-slate-800"
                    />
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-500 font-semibold block">중단원</span>
                    <input
                      type="text"
                      value={middleUnit}
                      onChange={e => setMiddleUnit(e.target.value)}
                      placeholder="중단원명"
                      className="w-full text-xs font-semibold p-1 rounded-md border border-indigo-200 bg-white text-slate-800"
                    />
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-500 font-semibold block">소단원</span>
                    <input
                      type="text"
                      value={minorUnit}
                      onChange={e => setMinorUnit(e.target.value)}
                      placeholder="소단원명"
                      className="w-full text-xs font-semibold p-1 rounded-md border border-indigo-200 bg-white text-slate-800"
                    />
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-500 font-semibold block">문제유형/단계</span>
                    <input
                      type="text"
                      value={section}
                      onChange={e => setSection(e.target.value)}
                      placeholder="유형/단계"
                      className="w-full text-xs font-semibold p-1 rounded-md border border-indigo-200 bg-white text-slate-800"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 3. 제목 입력 */}
            <div className="px-4 pt-1.5 flex items-center gap-2">
              <label className="text-[11px] font-bold text-slate-700 shrink-0">학습지명</label>
              <input type="text" value={title} onChange={e => setTitle(e.target.value)}
                className="flex-1 min-w-0 border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>

            {/* 4. 정답 표 (그리드) */}
            <div className="flex-1 overflow-y-auto px-4 py-2 min-h-0">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-bold text-slate-700">문항별 정답 ({answers.length}문항)</span>
                {unsure.size > 0 && (
                  <span className="text-[10px] text-amber-700 font-bold bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md">
                    확인 필요 {unsure.size}문항 (노란색)
                  </span>
                )}
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {answers.map((ans, i) => {
                  const warn = unsure.has(i + 1)
                  return (
                    <div key={i}
                      className={`flex items-center gap-1.5 border rounded-lg px-2 py-1 transition-colors ${
                        warn ? 'border-amber-300 bg-amber-50/70' : 'border-slate-200 bg-white'
                      }`}>
                      <span className={`text-xs font-bold w-6 shrink-0 ${warn ? 'text-amber-700' : 'text-slate-400'}`}>
                        {i + 1}
                      </span>
                      <input
                        ref={palette.registerRef(i)}
                        type="text"
                        value={ans}
                        onChange={e => setAnswerAt(i, e.target.value)}
                        onFocus={() => palette.setFocusedKey(i)}
                        placeholder="정답"
                        className="flex-1 text-xs font-bold outline-none bg-transparent text-slate-800 placeholder-slate-300 min-w-0"
                      />
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 특수기호 팔레트 */}
            <div className="px-4 pb-1">
              <SymbolPalette
                onInsert={palette.insert}
                disabled={palette.focusedKey === null}
                hint={palette.focusedKey !== null ? `선택된 칸: ${palette.focusedKey + 1}번` : undefined}
              />
            </div>

            {/* 액션 버튼 바 */}
            <div className="flex items-center gap-2.5 px-4 py-2.5 border-t border-slate-100">
              <span className="text-[11px] text-slate-500 mr-auto font-medium">
                {filled}/{answers.length}문항 입력됨
              </span>
              <button
                type="button"
                onClick={() => run()}
                className="border border-slate-300 text-slate-600 rounded-lg px-3 py-2 text-xs font-bold hover:bg-slate-50 transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>재추출</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="border border-slate-300 text-slate-600 rounded-lg px-3 py-2 text-xs font-bold hover:bg-slate-50 transition-colors cursor-pointer"
              >
                취소
              </button>
              <button
                type="button"
                onClick={confirm}
                className="bg-emerald-600 text-white rounded-lg px-4 py-2 text-xs font-bold hover:bg-emerald-700 transition-colors whitespace-nowrap shadow-md shadow-emerald-600/20 cursor-pointer"
              >
                확정하고 학습지 등록
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}