'use client'

import React, { useState } from 'react'
import { MathKeypadPalette } from './MathKeypadPalette'
import { ScratchpadCanvas } from './ScratchpadCanvas'

interface MathInteractiveSolverProps {
  questionLatex: string
  answerLatex?: string
  conceptTitle?: string
  onComplete?: (result: any) => void
}

export const MathInteractiveSolver: React.FC<MathInteractiveSolverProps> = ({
  questionLatex,
  answerLatex,
  conceptTitle = '수학 문제 풀이',
  onComplete,
}) => {
  const [solutionSteps, setSolutionSteps] = useState<string[]>([''])
  const [activeStepIndex, setActiveStepIndex] = useState<number>(0)
  const [viewMode, setViewMode] = useState<'both' | 'keypad' | 'canvas'>('both')

  // AI 첨삭 상태
  const [isChecking, setIsChecking] = useState(false)
  const [aiFeedback, setAiFeedback] = useState<any | null>(null)

  // 쌍둥이 문제 상태
  const [isLoadingTwin, setIsLoadingTwin] = useState(false)
  const [twinProblem, setTwinProblem] = useState<any | null>(null)
  const [showTwinModal, setShowTwinModal] = useState(false)

  // 키패드 입력 핸들러
  const handleInsertLatex = (latex: string) => {
    setSolutionSteps((prev) => {
      const updated = [...prev]
      updated[activeStepIndex] = (updated[activeStepIndex] || '') + latex
      return updated
    })
  }

  const handleBackspace = () => {
    setSolutionSteps((prev) => {
      const updated = [...prev]
      const current = updated[activeStepIndex] || ''
      updated[activeStepIndex] = current.slice(0, -1)
      return updated
    })
  }

  const handleClear = () => {
    setSolutionSteps((prev) => {
      const updated = [...prev]
      updated[activeStepIndex] = ''
      return updated
    })
  }

  const handleAddStep = () => {
    setSolutionSteps((prev) => [...prev, ''])
    setActiveStepIndex(solutionSteps.length)
  }

  // AI 단계별 수식 첨삭 요청
  const handleRequestStepCheck = async () => {
    const validSteps = solutionSteps.filter((s) => s.trim().length > 0)
    if (validSteps.length === 0) {
      alert('최소 1줄 이상의 풀이 과정을 입력해주세요.')
      return
    }

    setIsChecking(true)
    setAiFeedback(null)

    try {
      const res = await fetch('/api/ai/step-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionLatex,
          answerLatex,
          studentSolutionSteps: validSteps,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        setAiFeedback(data)
      } else {
        alert('첨삭 요청 중 오류가 발생했습니다.')
      }
    } catch {
      alert('네트워크 오류가 발생했습니다.')
    } finally {
      setIsChecking(false)
    }
  }

  // 쌍둥이 문제 요청
  const handleGenerateTwinProblem = async () => {
    setIsLoadingTwin(true)
    try {
      const res = await fetch('/api/ai/twin-problem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalQuestionLatex: questionLatex,
          conceptTitle,
          difficulty: 0.0,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        setTwinProblem(data.data || data)
        setShowTwinModal(true)
      }
    } catch {
      alert('쌍둥이 문제 생성에 실패했습니다.')
    } finally {
      setIsLoadingTwin(false)
    }
  }

  return (
    <div className="bg-slate-950 text-slate-100 p-4 md:p-6 rounded-3xl border border-slate-800 shadow-2xl space-y-5">
      {/* 상단 문제 카드 */}
      <div className="bg-slate-900/90 border border-slate-800 p-4 md:p-5 rounded-2xl">
        <div className="flex items-center justify-between mb-2">
          <span className="px-2.5 py-1 bg-indigo-500/10 text-indigo-400 font-semibold text-xs rounded-lg border border-indigo-500/20">
            {conceptTitle}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleGenerateTwinProblem}
              disabled={isLoadingTwin}
              className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 active:scale-95 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-purple-600/20 cursor-pointer disabled:opacity-50"
            >
              {isLoadingTwin ? '생성 중...' : '✨ 쌍둥이 문제 풀기'}
            </button>
            <button
              onClick={handleRequestStepCheck}
              disabled={isChecking}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-emerald-600/20 cursor-pointer disabled:opacity-50"
            >
              {isChecking ? '검산 중...' : '🤖 AI 첨삭 받기'}
            </button>
          </div>
        </div>
        <div className="text-base md:text-lg font-medium text-slate-200 font-mono py-2">
          {questionLatex}
        </div>
      </div>

      {/* 모드 전환 탭 */}
      <div className="flex items-center justify-between">
        <div className="text-xs font-bold text-slate-400">
          풀이 도구 선택
        </div>
        <div className="flex gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
          {(['both', 'keypad', 'canvas'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                viewMode === mode ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {mode === 'both' ? '키패드 + 캔버스' : mode === 'keypad' ? '수식 키패드' : '필기 캔버스'}
            </button>
          ))}
        </div>
      </div>

      {/* 단계별 수식 풀이 입력 영역 */}
      <div className="space-y-2">
        <div className="text-xs font-bold text-slate-400 flex items-center justify-between">
          <span>단계별 수식 입력 (Step-by-Step)</span>
          <button
            onClick={handleAddStep}
            className="text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer text-xs"
          >
            + 다음 줄 추가
          </button>
        </div>

        {solutionSteps.map((step, idx) => (
          <div
            key={idx}
            onClick={() => setActiveStepIndex(idx)}
            className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
              activeStepIndex === idx
                ? 'bg-slate-900 border-indigo-500 shadow-md shadow-indigo-500/10'
                : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
            }`}
          >
            <span className="text-xs font-bold text-slate-500 w-12">
              Step {idx + 1}
            </span>
            <input
              type="text"
              value={step}
              onChange={(e) => {
                const val = e.target.value
                setSolutionSteps((prev) => {
                  const updated = [...prev]
                  updated[idx] = val
                  return updated
                })
              }}
              placeholder={`Step ${idx + 1} 수식을 입력하세요...`}
              className="flex-1 bg-transparent text-sm text-slate-100 font-mono focus:outline-hidden"
            />
            {aiFeedback?.stepFeedbacks?.[idx] && (
              <span
                className={`text-xs px-2 py-0.5 rounded font-bold ${
                  aiFeedback.stepFeedbacks[idx].isValid
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                    : 'bg-rose-950 text-rose-300 border border-rose-800'
                }`}
              >
                {aiFeedback.stepFeedbacks[idx].isValid ? '✅ 정상' : '❌ 오류'}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* AI 첨삭 결과 배너 */}
      {aiFeedback && (
        <div
          className={`p-4 rounded-2xl border ${
            aiFeedback.isFullyCorrect
              ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-200'
              : 'bg-rose-950/40 border-rose-800/60 text-rose-200'
          }`}
        >
          <div className="font-bold text-sm mb-1 flex items-center gap-2">
            {aiFeedback.isFullyCorrect ? '🎉 완벽한 풀이입니다!' : `⚠️ Step ${aiFeedback.firstErrorStep} 오류 감지 (${aiFeedback.errorType})`}
          </div>
          <div className="text-xs text-slate-300 mb-2">{aiFeedback.diagnosticExplanation}</div>
          {aiFeedback.hints?.length > 0 && (
            <div className="space-y-1 text-xs text-slate-400 bg-slate-900/60 p-2.5 rounded-xl">
              <div className="font-semibold text-slate-300">💡 3단계 맞춤 힌트:</div>
              {aiFeedback.hints.map((hint: string, hIdx: number) => (
                <div key={hIdx}>{hint}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 하단 입력 도구 레이아웃 (키패드 / 캔버스) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2">
        {(viewMode === 'both' || viewMode === 'keypad') && (
          <div className="flex justify-center">
            <MathKeypadPalette
              onInsertLatex={handleInsertLatex}
              onBackspace={handleBackspace}
              onClear={handleClear}
              onSubmit={handleRequestStepCheck}
            />
          </div>
        )}

        {(viewMode === 'both' || viewMode === 'canvas') && (
          <div className={viewMode === 'canvas' ? 'lg:col-span-2' : ''}>
            <ScratchpadCanvas
              height={viewMode === 'canvas' ? 420 : 320}
              onExportImage={(dataUrl) => {
                alert('풀이 필기 이미지가 첨부되었습니다.')
              }}
            />
          </div>
        )}
      </div>

      {/* 쌍둥이 문제 모달 */}
      {showTwinModal && twinProblem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="font-bold text-white text-base">✨ 쌍둥이 변형 문제</div>
              <button
                onClick={() => setShowTwinModal(false)}
                className="text-slate-400 hover:text-white text-sm font-bold cursor-pointer"
              >
                닫기
              </button>
            </div>
            <div className="text-sm text-slate-200 font-mono bg-slate-950 p-4 rounded-xl border border-slate-800">
              {twinProblem.contentLatex || twinProblem.twinQuestionLatex}
            </div>
            {twinProblem.options?.length > 0 && (
              <div className="grid grid-cols-1 gap-1.5">
                {twinProblem.options.map((opt: string, oIdx: number) => (
                  <div key={oIdx} className="px-3 py-2 bg-slate-800/60 rounded-lg text-xs font-mono text-slate-300">
                    {oIdx + 1}번: {opt}
                  </div>
                ))}
              </div>
            )}
            <div className="bg-indigo-950/30 border border-indigo-800/40 p-3 rounded-xl text-xs text-indigo-300">
              💡 변형 전략: {twinProblem.modifiedVariables || twinProblem.variationStrategy}
            </div>
            <button
              onClick={() => {
                setShowTwinModal(false)
                setSolutionSteps([''])
                setAiFeedback(null)
              }}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 font-bold text-xs text-white rounded-xl cursor-pointer"
            >
              이 문제로 풀이 시작하기
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
