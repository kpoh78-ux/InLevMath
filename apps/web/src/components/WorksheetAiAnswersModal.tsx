'use client'

// 학습지 업로드 — 2·3단계: AI 정답 추출 + 관리자 검수
//
// 2단계: 고른 파일을 서버로 보내 Claude가 문제/정답 페이지를 구분하고 문항별 정답을 읽는다.
// 3단계: 읽어온 정답을 표로 보여주고 선생님이 직접 고친 뒤 확정한다.
//         확실하지 않은 문항은 노란색으로 표시해 먼저 확인하게 한다.
//
// 확정하면 값을 그대로 학습지 등록 폼으로 넘긴다. 저장은 기존 정답 API가 맡는다.

import { useState, useCallback, useEffect } from 'react'
import { apiFetch } from '@/lib/api'
import { readFile, printWorksheetFile, type WorksheetFile } from '@/lib/worksheetFiles'
import { SymbolPalette, useSymbolPalette } from '@/components/AnswerInput'

type ExtractedAnswer = { no: number; answer: string; confident: boolean }

type ExtractResult = {
  problemPageFrom: number
  problemPageTo: number
  answerPageFrom: number
  answerPageTo: number
  problemCount: number
  answers: ExtractedAnswer[]
  note: string
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

const pageRange = (from: number, to: number) =>
  from === 0 ? '확인 필요' : to > from ? `${from}~${to}쪽` : `${from}쪽`

export function WorksheetAiAnswersModal({
  file, onClose, onConfirm,
}: {
  file: WorksheetFile
  onClose: () => void
  /** 검수를 마친 정답. 학습지 등록 폼으로 넘어간다 */
  onConfirm: (v: { title: string; answers: string[] }) => void
}) {
  const [phase, setPhase] = useState<'running' | 'review' | 'error'>('running')
  const [error, setError] = useState('')
  const [result, setResult] = useState<ExtractResult | null>(null)
  const [answers, setAnswers] = useState<string[]>([])
  // 아직 확인하지 않은 "불확실" 문항 번호 (1-based)
  const [unsure, setUnsure] = useState<Set<number>>(new Set())
  const [title, setTitle] = useState(titleFromFileName(file.name))

  const setAnswerAt = useCallback((i: number, v: string) => {
    setAnswers(prev => { const n = [...prev]; n[i] = v; return n })
    // 손을 댄 문항은 선생님이 확인한 것으로 본다
    setUnsure(prev => {
      if (!prev.has(i + 1)) return prev
      const n = new Set(prev); n.delete(i + 1); return n
    })
  }, [])

  const palette = useSymbolPalette<number>(setAnswerAt)

  const run = useCallback(async () => {
    setPhase('running'); setError('')
    try {
      const f = await readFile(file)
      const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
      const mediaType = MEDIA_BY_EXT[ext]
      if (!mediaType) throw new Error('PDF 또는 이미지 파일만 읽을 수 있습니다.')

      const res = await apiFetch('/api/worksheets/ai-extract', {
        method: 'POST',
        body: JSON.stringify({
          data: await toBase64(f), mediaType, fileName: file.name,
        }),
      })

      const data = await res.json().catch(() => ({})) as ExtractResult & { error?: string }
      if (!res.ok) throw new Error(data.error || 'AI 정답 추출에 실패했습니다.')

      setResult(data)
      setAnswers(data.answers.map(a => a.answer))
      setUnsure(new Set(data.answers.filter(a => !a.confident).map(a => a.no)))
      palette.setFocusedKey(null)
      setPhase('review')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI 정답 추출에 실패했습니다.')
      setPhase('error')
    }
  }, [file, palette])

  // 모달이 열리면 바로 추출을 시작한다
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
    onConfirm({ title: title.trim() || titleFromFileName(file.name), answers })
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl flex flex-col" style={{ maxHeight: '90vh' }}>
        <div className="flex items-start justify-between p-6 pb-4 border-b border-gray-100">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-gray-900">AI 정답 읽기</h2>
            <p className="text-sm text-gray-500 mt-0.5 truncate">{file.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none ml-4">×</button>
        </div>

        {phase === 'running' && (
          <div className="p-12 text-center">
            <p className="text-3xl mb-3 animate-pulse">🤖</p>
            <p className="text-sm font-semibold text-gray-700">학습지를 읽는 중입니다...</p>
            <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">
              문제와 정답·해설 페이지를 구분하고 문항별 정답을 뽑고 있습니다.<br />
              분량에 따라 1~3분 걸릴 수 있습니다.
            </p>
          </div>
        )}

        {phase === 'error' && (
          <div className="p-10 text-center">
            <p className="text-3xl mb-3">⚠️</p>
            <p className="text-sm font-semibold text-gray-700">{error}</p>
            <div className="flex gap-2 justify-center mt-5">
              <button onClick={onClose}
                className="border border-gray-300 text-gray-600 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors">
                닫기
              </button>
              <button onClick={run}
                className="bg-indigo-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors">
                다시 시도
              </button>
            </div>
          </div>
        )}

        {phase === 'review' && result && (
          <>
            {/* 페이지 구분 + 인쇄 */}
            <div className="px-6 pt-4">
              <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-4 flex-wrap">
                <div className="text-xs text-gray-600">
                  <span className="font-semibold text-gray-700">문제</span>{' '}
                  {pageRange(result.problemPageFrom, result.problemPageTo)}
                  <span className="mx-2 text-gray-300">|</span>
                  <span className="font-semibold text-gray-700">정답·해설</span>{' '}
                  {pageRange(result.answerPageFrom, result.answerPageTo)}
                </div>
                <div className="ml-auto flex gap-2">
                  <button onClick={() => print(result.problemPageFrom)}
                    className="text-xs font-semibold text-gray-600 border border-gray-200 bg-white hover:border-indigo-400 hover:text-indigo-600 px-2.5 py-1 rounded transition-colors whitespace-nowrap">
                    문제 인쇄
                  </button>
                  <button onClick={() => print(result.answerPageFrom)}
                    className="text-xs font-semibold text-gray-600 border border-gray-200 bg-white hover:border-indigo-400 hover:text-indigo-600 px-2.5 py-1 rounded transition-colors whitespace-nowrap">
                    정답 인쇄
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-gray-400 mt-1.5">
                인쇄를 누르면 새 탭에서 해당 쪽부터 열립니다. 프린터·페이지 범위는 인쇄 대화상자에서 고르세요.
              </p>
            </div>

            {/* 검수 안내 */}
            <div className="px-6 pt-3">
              <div className={`rounded-xl px-4 py-2.5 text-xs leading-relaxed border ${
                unsure.size > 0
                  ? 'bg-amber-50 border-amber-200 text-amber-800'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-800'
              }`}>
                {unsure.size > 0
                  ? <>노란색 칸 <strong>{unsure.size}개</strong>는 AI가 확신하지 못한 문항입니다. 원본과 대조해 확인해주세요.</>
                  : <>AI가 <strong>{result.problemCount}문항</strong>을 모두 읽었습니다. 원본과 대조해 확인 후 확정하세요.</>}
                {result.note && <div className="mt-1 opacity-90">{result.note}</div>}
              </div>
            </div>

            {/* 제목 */}
            <div className="px-6 pt-3">
              <label className="block text-xs font-medium text-gray-500 mb-1">학습지명</label>
              <input type="text" value={title} onChange={e => setTitle(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>

            {/* 정답 표 */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="grid grid-cols-4 gap-2">
                {answers.map((ans, i) => {
                  const warn = unsure.has(i + 1)
                  return (
                    <div key={i}
                      className={`flex items-center gap-1.5 border rounded-lg px-2 py-1.5 transition-colors ${
                        warn ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white'
                      }`}>
                      <span className={`text-xs font-semibold w-6 shrink-0 ${warn ? 'text-amber-600' : 'text-gray-400'}`}>
                        {i + 1}
                      </span>
                      <input
                        ref={palette.registerRef(i)}
                        type="text"
                        value={ans}
                        onChange={e => setAnswerAt(i, e.target.value)}
                        onFocus={() => palette.setFocusedKey(i)}
                        placeholder="정답"
                        className="flex-1 text-sm outline-none bg-transparent text-gray-800 placeholder-gray-300 min-w-0"
                      />
                    </div>
                  )
                })}
              </div>
              <p className="text-[11px] text-gray-400 mt-3 leading-relaxed">
                그림·그래프 정답은 여기서 비워 두고, 확정 후 <strong className="text-gray-500">정답 설정</strong> 화면에서
                스냅샷 이미지를 붙이면 됩니다.
              </p>
            </div>

            <div className="px-6 pb-1">
              <SymbolPalette
                onInsert={palette.insert}
                disabled={palette.focusedKey === null}
                hint={palette.focusedKey !== null ? `선택된 칸: ${palette.focusedKey + 1}번` : undefined}
              />
            </div>

            <div className="flex items-center gap-3 p-6 pt-4 border-t border-gray-100">
              <span className="text-xs text-gray-500 mr-auto">
                {filled}/{answers.length}문항 입력됨
              </span>
              <button onClick={run}
                className="border border-gray-300 text-gray-600 rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-gray-50 transition-colors whitespace-nowrap">
                AI 재시도
              </button>
              <button onClick={onClose}
                className="border border-gray-300 text-gray-600 rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-gray-50 transition-colors">
                취소
              </button>
              <button onClick={confirm}
                className="bg-emerald-600 text-white rounded-lg px-5 py-2.5 text-sm font-semibold hover:bg-emerald-700 transition-colors whitespace-nowrap">
                확정하고 학습지 등록
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}