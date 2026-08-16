'use client'

// 교재 AI 정답 업로드 — 추출 + 검수 + 저장
//
// 정답·해설 PDF를 고르면 AI가 문항별 정답과 단원·문제유형·쪽번호를 채워 온다.
// 선생님이 표에서 고친 뒤 저장하면 기존 정답 저장 API로 넘어간다.
//
// 저장은 PROBLEM_PAGE_SIZE_MAX(500) 단위로 나눠 보낸다.
// 한 번에 수천 문제를 보내면 요청·트랜잭션이 감당되지 않는다.

import { useState, useCallback, useEffect } from 'react'
import { apiFetch } from '@/lib/api'
import { readFile, type WorksheetFile } from '@/lib/worksheetFiles'
import { PROBLEM_PAGE_SIZE_MAX, TEXTBOOK_SECTION_PRESETS } from '@/lib/answers'

type Extracted = {
  number: number
  bookPage: number
  majorUnit: string
  middleUnit: string
  minorUnit: string
  section: string
  type: 'multiple' | 'short'
  answer: string
  confident: boolean
}

type ExtractResult = { problems: Extracted[]; note: string }

const MEDIA_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg',
  jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
}

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

export function TextbookAiAnswersModal({
  textbookId, textbookTitle, file, fromNumber, onClose, onSaved,
}: {
  textbookId: string
  textbookTitle: string
  file: WorksheetFile
  /** 이 번호부터 읽어달라고 AI에 알려준다 */
  fromNumber?: number
  onClose: () => void
  onSaved: (savedCount: number) => void
}) {
  const [phase, setPhase] = useState<'running' | 'review' | 'error'>('running')
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [rows, setRows] = useState<Extracted[]>([])
  const [unsure, setUnsure] = useState<Set<number>>(new Set())
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState('')

  const setField = <K extends keyof Extracted>(i: number, key: K, v: Extracted[K]) => {
    setRows(prev => { const n = [...prev]; n[i] = { ...n[i], [key]: v }; return n })
    setUnsure(prev => {
      const no = rows[i]?.number
      if (no === undefined || !prev.has(no)) return prev
      const n = new Set(prev); n.delete(no); return n
    })
  }

  /** 같은 값을 아래 문제들에 한꺼번에 채운다 (단원·유형은 연속되는 경우가 많다) */
  const fillDown = (i: number, keys: (keyof Extracted)[]) => {
    setRows(prev => {
      const src = prev[i]
      return prev.map((r, j) => {
        if (j <= i) return r
        const patch: Partial<Extracted> = {}
        for (const k of keys) (patch as Record<string, unknown>)[k] = src[k]
        return { ...r, ...patch }
      })
    })
  }

  const run = useCallback(async () => {
    setPhase('running'); setError('')
    try {
      const f = await readFile(file)
      const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
      const mediaType = MEDIA_BY_EXT[ext]
      if (!mediaType) throw new Error('PDF 또는 이미지 파일만 읽을 수 있습니다.')

      const res = await apiFetch(`/api/textbooks/${textbookId}/ai-extract`, {
        method: 'POST',
        body: JSON.stringify({
          data: await toBase64(f), mediaType, fileName: file.name, fromNumber,
        }),
      })
      const data = await res.json().catch(() => ({})) as ExtractResult & { error?: string }
      if (!res.ok) throw new Error(data.error || 'AI 정답 추출에 실패했습니다.')

      setRows(data.problems ?? [])
      setNote(data.note ?? '')
      setUnsure(new Set((data.problems ?? []).filter(p => !p.confident).map(p => p.number)))
      setPhase('review')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI 정답 추출에 실패했습니다.')
      setPhase('error')
    }
  }, [file, textbookId, fromNumber])

  useEffect(() => { run() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (rows.length === 0) return
    if (unsure.size > 0) {
      const list = [...unsure].sort((a, b) => a - b).slice(0, 20).join(', ')
      if (!confirm(
        `AI가 확신하지 못한 문항이 ${unsure.size}개 있습니다: ${list}${unsure.size > 20 ? ' …' : ''}\n`
        + '그대로 저장할까요?'
      )) return
    }

    setSaving(true)
    try {
      // 500문제씩 나눠 보낸다
      let done = 0
      for (let i = 0; i < rows.length; i += PROBLEM_PAGE_SIZE_MAX) {
        const chunk = rows.slice(i, i + PROBLEM_PAGE_SIZE_MAX)
        setProgress(`저장 중... ${done}/${rows.length}문항`)
        const res = await apiFetch(`/api/textbooks/${textbookId}/problems`, {
          method: 'PUT',
          body: JSON.stringify({
            upserts: chunk.map(r => ({
              number: r.number, bookPage: r.bookPage,
              majorUnit: r.majorUnit, middleUnit: r.middleUnit, minorUnit: r.minorUnit,
              section: r.section, type: r.type, answer: r.answer,
            })),
          }),
        })
        if (!res.ok) {
          const d = await res.json().catch(() => ({})) as { error?: string }
          throw new Error(d.error || '저장에 실패했습니다.')
        }
        done += chunk.length
      }
      setProgress('')
      onSaved(done)
    } catch (e) {
      alert(e instanceof Error ? e.message : '저장에 실패했습니다.')
    } finally {
      setSaving(false); setProgress('')
    }
  }

  const filled = rows.filter(r => r.answer.trim() !== '').length

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl flex flex-col" style={{ maxHeight: '92vh' }}>
        <div className="flex items-start justify-between p-6 pb-4 border-b border-gray-100">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-gray-900">교재 AI 정답 입력</h2>
            <p className="text-sm text-gray-500 mt-0.5 truncate">
              {textbookTitle} <span className="text-gray-300 mx-1">·</span> {file.name}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none ml-4">×</button>
        </div>

        {phase === 'running' && (
          <div className="p-12 text-center">
            <p className="text-3xl mb-3 animate-pulse">🤖</p>
            <p className="text-sm font-semibold text-gray-700">교재 정답을 읽는 중입니다...</p>
            <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">
              문항별 정답과 대단원·중단원·소단원, 문제유형, 쪽번호를 뽑고 있습니다.<br />
              분량에 따라 2~5분 걸릴 수 있습니다.
            </p>
          </div>
        )}

        {phase === 'error' && (
          <div className="p-10 text-center">
            <p className="text-3xl mb-3">⚠️</p>
            <p className="text-sm font-semibold text-gray-700">{error}</p>
            <div className="flex gap-2 justify-center mt-5">
              <button onClick={onClose}
                className="border border-gray-300 text-gray-600 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-50">
                닫기
              </button>
              <button onClick={run}
                className="bg-indigo-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-indigo-700">
                다시 시도
              </button>
            </div>
          </div>
        )}

        {phase === 'review' && (
          <>
            <div className="px-6 pt-4">
              <div className={`rounded-xl px-4 py-2.5 text-xs leading-relaxed border ${
                unsure.size > 0
                  ? 'bg-amber-50 border-amber-200 text-amber-800'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-800'
              }`}>
                {rows.length}문항을 읽었습니다 (정답 입력 {filled}개).
                {unsure.size > 0 && <> 노란 줄 <strong>{unsure.size}개</strong>는 AI가 확신하지 못한 문항이니 원본과 대조해주세요.</>}
                {note && <div className="mt-1 opacity-90">{note}</div>}
                <div className="mt-1 opacity-80">
                  단원·유형이 이어지는 구간은 <strong>↓채우기</strong>로 아래 문제에 한 번에 복사할 수 있습니다.
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-auto px-6 py-4">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="text-xs text-gray-500 border-b border-gray-200">
                    <th className="px-2 py-2 text-left w-14">번호</th>
                    <th className="px-2 py-2 text-left w-16">쪽</th>
                    <th className="px-2 py-2 text-left">대단원</th>
                    <th className="px-2 py-2 text-left">중단원</th>
                    <th className="px-2 py-2 text-left">소단원</th>
                    <th className="px-2 py-2 text-left w-32">문제유형</th>
                    <th className="px-2 py-2 text-left w-20">유형</th>
                    <th className="px-2 py-2 text-left w-36">정답</th>
                    <th className="px-2 py-2 w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const warn = unsure.has(r.number)
                    const cell = 'w-full text-xs border border-gray-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400'
                    return (
                      <tr key={r.number} className={warn ? 'bg-amber-50' : ''}>
                        <td className="px-2 py-1 font-semibold text-gray-700 tabular-nums">{r.number}</td>
                        <td className="px-2 py-1">
                          <input type="number" min={0} value={r.bookPage || ''}
                            onChange={e => setField(i, 'bookPage', parseInt(e.target.value) || 0)}
                            placeholder="-" className={cell} />
                        </td>
                        <td className="px-2 py-1">
                          <input value={r.majorUnit} onChange={e => setField(i, 'majorUnit', e.target.value)} className={cell} />
                        </td>
                        <td className="px-2 py-1">
                          <input value={r.middleUnit} onChange={e => setField(i, 'middleUnit', e.target.value)} className={cell} />
                        </td>
                        <td className="px-2 py-1">
                          <input value={r.minorUnit} onChange={e => setField(i, 'minorUnit', e.target.value)} className={cell} />
                        </td>
                        <td className="px-2 py-1">
                          <input value={r.section} onChange={e => setField(i, 'section', e.target.value)}
                            list="tb-sections" className={cell} />
                        </td>
                        <td className="px-2 py-1">
                          <select value={r.type} onChange={e => setField(i, 'type', e.target.value as 'multiple' | 'short')}
                            className={cell}>
                            <option value="multiple">객관식</option>
                            <option value="short">단답형</option>
                          </select>
                        </td>
                        <td className="px-2 py-1">
                          <input value={r.answer} onChange={e => setField(i, 'answer', e.target.value)}
                            placeholder="정답"
                            className={`${cell} font-semibold ${r.answer.trim() === '' ? 'bg-rose-50' : ''}`} />
                        </td>
                        <td className="px-2 py-1 text-center">
                          <button type="button"
                            onClick={() => fillDown(i, ['bookPage', 'majorUnit', 'middleUnit', 'minorUnit', 'section'])}
                            title="이 줄의 쪽·단원·유형을 아래 문제에 모두 복사"
                            className="text-[11px] text-indigo-500 hover:text-indigo-700 whitespace-nowrap">
                            ↓채우기
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <datalist id="tb-sections">
                {TEXTBOOK_SECTION_PRESETS.map(p => <option key={p} value={p} />)}
              </datalist>
            </div>

            <div className="flex items-center gap-3 p-6 pt-4 border-t border-gray-100">
              <span className="text-xs text-gray-500 mr-auto">
                {progress || `${filled}/${rows.length}문항 정답 입력됨`}
              </span>
              <button onClick={run} disabled={saving}
                className="border border-gray-300 text-gray-600 rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-gray-50 disabled:opacity-50">
                AI 재시도
              </button>
              <button onClick={onClose} disabled={saving}
                className="border border-gray-300 text-gray-600 rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-gray-50 disabled:opacity-50">
                취소
              </button>
              <button onClick={save} disabled={saving || rows.length === 0}
                className="bg-emerald-600 text-white rounded-lg px-5 py-2.5 text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 whitespace-nowrap">
                {saving ? '저장 중...' : `${rows.length}문항 저장`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
