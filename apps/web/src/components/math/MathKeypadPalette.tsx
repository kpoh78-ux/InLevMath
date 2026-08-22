'use client'

import React, { useState } from 'react'

interface MathKeypadProps {
  onInsertLatex: (latex: string) => void
  onBackspace: () => void
  onClear: () => void
  onSubmit?: () => void
}

// 경량 내장 SVG 아이콘 컴포넌트
const RotateCcwIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 0 1 5 5v2m-15-7l4-4m-4 4l4 4" />
  </svg>
)

const DeleteIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
)

const CheckIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
)

export const MathKeypadPalette: React.FC<MathKeypadProps> = ({
  onInsertLatex,
  onBackspace,
  onClear,
  onSubmit,
}) => {
  const [activeTab, setActiveTab] = useState<'basic' | 'algebra'>('basic')

  const basicKeys = [
    { label: 'x', latex: 'x' },
    { label: 'y', latex: 'y' },
    { label: 'a²', latex: '^{2}' },
    { label: 'aⁿ', latex: '^{}' },
    { label: '√', latex: '\\sqrt{}' },
    { label: '분수', latex: '\\frac{}{}' },
    { label: '+', latex: '+' },
    { label: '-', latex: '-' },
    { label: '×', latex: '\\times ' },
    { label: '÷', latex: '\\div ' },
    { label: '=', latex: '=' },
    { label: '( )', latex: '()' },
  ]

  const algebraKeys = [
    { label: '≤', latex: '\\le ' },
    { label: '≥', latex: '\\ge ' },
    { label: '≠', latex: '\\neq ' },
    { label: '±', latex: '\\pm ' },
    { label: 'π', latex: '\\pi ' },
    { label: 'log', latex: '\\log_{}' },
    { label: 'ln', latex: '\\ln ' },
    { label: 'lim', latex: '\\lim_{x \\to }' },
    { label: '∑', latex: '\\sum_{k=1}^{n}' },
    { label: '∫', latex: '\\int_{}^{}' },
    { label: 'α', latex: '\\alpha ' },
    { label: 'β', latex: '\\beta ' },
  ]

  return (
    <div className="bg-slate-900 text-white rounded-2xl p-3.5 shadow-2xl border border-slate-800 w-full max-w-lg select-none">
      {/* 탭 헤더 */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
        <div className="flex gap-1.5">
          {(['basic', 'algebra'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                activeTab === tab
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-white bg-slate-800/60'
              }`}
            >
              {tab === 'basic' ? '기본 연산' : '고등/대수 기호'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onClear}
            title="전체 지우기"
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 transition-all cursor-pointer"
          >
            <RotateCcwIcon className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onBackspace}
            title="한 글자 지우기"
            className="p-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900 active:scale-95 text-rose-300 transition-all cursor-pointer"
          >
            <DeleteIcon className="w-3.5 h-3.5" />
          </button>
          {onSubmit && (
            <button
              onClick={onSubmit}
              title="수식 입력 완료"
              className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-xs flex items-center gap-1 transition-all cursor-pointer"
            >
              <CheckIcon className="w-3.5 h-3.5" /> 입력
            </button>
          )}
        </div>
      </div>

      {/* 키패드 그리드 */}
      <div className="grid grid-cols-6 gap-1.5">
        {(activeTab === 'basic' ? basicKeys : algebraKeys).map((keyItem, idx) => (
          <button
            key={idx}
            onClick={() => onInsertLatex(keyItem.latex)}
            className="h-11 bg-slate-800 hover:bg-indigo-600 active:scale-95 text-slate-100 font-mono text-sm font-semibold rounded-xl flex items-center justify-center border border-slate-700/60 transition-all cursor-pointer shadow-xs"
          >
            {keyItem.label}
          </button>
        ))}
      </div>

      {/* 숫자 패드 하단 바 */}
      <div className="grid grid-cols-5 gap-1.5 mt-2.5 pt-2.5 border-t border-slate-800">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map((num) => (
          <button
            key={num}
            onClick={() => onInsertLatex(num)}
            className="h-10 bg-slate-800/80 hover:bg-slate-700 active:scale-95 text-white font-bold text-sm rounded-lg transition-all cursor-pointer"
          >
            {num}
          </button>
        ))}
      </div>
    </div>
  )
}
