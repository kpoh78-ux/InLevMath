'use client'

// 학습지·문제집 정답 입력 공용 컴포넌트
//  - 수식 기호 팔레트 (커서 위치 삽입)
//  - 스냅샷 이미지 첨부 (Ctrl+V 붙여넣기 / 📷 파일 선택 / 드래그&드롭)
//  - 이미지 정답 썸네일 + 클릭 확대 팝업

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { MATH_SYMBOL_GROUPS } from '@/lib/answers'
import { compressAnswerImage, pickImageFile } from '@/lib/imageCompress'

// ── 확대 팝업 ────────────────────────────────────────────────────────────────

/** 정답 이미지 확대 팝업 — 아무 곳이나 클릭하거나 Esc로 닫힘 */
export function AnswerLightbox({ src, onClose }: { src: string | null; onClose: () => void }) {
  useEffect(() => {
    if (!src) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [src, onClose])

  if (!src) return null
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-10 cursor-zoom-out"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="정답 이미지"
        className="max-w-full max-h-full object-contain rounded-lg bg-white shadow-2xl" />
      <span className="absolute bottom-6 text-white/60 text-xs">클릭하거나 Esc를 누르면 닫힙니다</span>
    </div>
  )
}

/** 목록·채점 화면에 작게 표시되는 정답 이미지. 클릭하면 확대 팝업 */
export function AnswerThumb({
  src, onZoom, className = '',
}: { src: string; onZoom: (src: string) => void; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="정답 이미지"
      title="클릭하면 크게 볼 수 있습니다"
      onClick={e => { e.stopPropagation(); onZoom(src) }}
      className={`h-9 max-w-[130px] object-contain rounded border border-gray-200 bg-white cursor-zoom-in hover:border-indigo-400 transition-colors ${className}`}
    />
  )
}

// ── 기호 팔레트 ──────────────────────────────────────────────────────────────

/**
 * 마지막으로 포커스한 입력칸을 추적해 커서 위치에 기호를 삽입하는 훅.
 * 입력칸에는 registerRef(key), onFocus={() => setFocusedKey(key)} 를 붙인다.
 */
export function useSymbolPalette<K extends string | number>(
  onChange: (key: K, value: string) => void
) {
  const refs = useRef(new Map<K, HTMLInputElement | null>())
  const [focusedKey, setFocusedKey] = useState<K | null>(null)

  // onChange가 매 렌더 새로 만들어져도 insert 신원이 흔들리지 않게 ref로 붙든다
  const onChangeRef = useRef(onChange)
  useEffect(() => { onChangeRef.current = onChange }, [onChange])

  const registerRef = useCallback((key: K) => (el: HTMLInputElement | null) => {
    if (el) refs.current.set(key, el)
    else refs.current.delete(key)
  }, [])

  const insert = useCallback((sym: string) => {
    if (focusedKey === null) return
    const el = refs.current.get(focusedKey)
    if (!el) return
    const start = el.selectionStart ?? el.value.length
    const end = el.selectionEnd ?? start
    onChangeRef.current(focusedKey, el.value.slice(0, start) + sym + el.value.slice(end))
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + sym.length, start + sym.length)
    })
  }, [focusedKey])

  /** 입력칸이 사라질 때(이미지로 전환 등) 호출 — 남은 ref로 오작동하는 것을 막는다 */
  const release = useCallback((key: K) => {
    refs.current.delete(key)
    setFocusedKey(prev => (prev === key ? null : prev))
  }, [])

  return useMemo(
    () => ({ registerRef, focusedKey, setFocusedKey, insert, release }),
    [registerRef, focusedKey, insert, release]
  )
}

/** 객관식 보기 원문자 — 팔레트를 뒤지지 않고 한 번에 고른다 */
const CHOICE_SYMBOLS = ['①', '②', '③', '④', '⑤'] as const

/**
 * 객관식 정답 빠른 입력.
 *  - 한 개만 고르면 그 값으로 바꾼다 (기존 값 대체)
 *  - '복수'를 켜면 누를 때마다 붙이거나 떼어낸다 — "①③" 처럼 2개 이상 정답
 *  - 채점은 순서를 따지지 않는다 (shared/answersMatch)
 */
export function ChoicePalette({
  value, onChange, disabled, hint,
}: {
  value: string
  onChange: (next: string) => void
  disabled: boolean
  hint?: string
}) {
  const [multi, setMulti] = useState(false)

  const picked = useMemo(
    () => new Set([...(value ?? '')].filter(ch => (CHOICE_SYMBOLS as readonly string[]).includes(ch))),
    [value]
  )

  const pick = (sym: string) => {
    if (!multi) { onChange(sym); return }
    const next = new Set(picked)
    if (next.has(sym)) next.delete(sym)
    else next.add(sym)
    // 항상 보기 번호 순서로 정렬해 눈으로 확인하기 쉽게 둔다
    onChange(CHOICE_SYMBOLS.filter(c => next.has(c)).join(''))
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[11px] font-bold text-gray-500 shrink-0">객관식</span>

      <div className="flex gap-1">
        {CHOICE_SYMBOLS.map(sym => {
          const on = picked.has(sym)
          return (
            <button
              key={sym}
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => pick(sym)}
              disabled={disabled}
              className={`w-9 h-8 rounded-lg border text-base leading-none transition-colors disabled:opacity-40 ${
                on
                  ? 'bg-indigo-600 border-indigo-600 text-white font-bold'
                  : 'bg-white border-gray-200 text-gray-700 hover:border-indigo-400 hover:bg-indigo-50'
              }`}
            >
              {sym}
            </button>
          )
        })}
      </div>

      <button
        type="button"
        onMouseDown={e => e.preventDefault()}
        onClick={() => setMulti(v => !v)}
        disabled={disabled}
        title="정답이 2개 이상인 문항"
        className={`text-[11px] font-bold px-2.5 h-8 rounded-lg border transition-colors disabled:opacity-40 ${
          multi
            ? 'bg-amber-400 border-amber-400 text-slate-900'
            : 'bg-white border-gray-200 text-gray-500 hover:border-amber-300'
        }`}
      >
        복수정답
      </button>

      {disabled
        ? <span className="text-[11px] text-gray-400">칸을 먼저 클릭하세요</span>
        : hint && <span className="text-[11px] text-gray-400">{hint}</span>}
    </div>
  )
}

export function SymbolPalette({
  onInsert, disabled, hint,
}: { onInsert: (sym: string) => void; disabled: boolean; hint?: string }) {
  const [group, setGroup] = useState(0)
  const active = MATH_SYMBOL_GROUPS[group] ?? MATH_SYMBOL_GROUPS[0]

  return (
    <div>
      {/* 분야 탭 — 기호가 많아 한 화면에 다 놓으면 찾기 어렵다 */}
      <div className="flex flex-wrap gap-1 mb-1">
        {MATH_SYMBOL_GROUPS.map((g, i) => (
          <button
            key={g.label}
            type="button"
            onMouseDown={e => e.preventDefault()}
            onClick={() => setGroup(i)}
            className={`text-[11px] px-2 py-1 rounded-t border-b-2 transition-colors ${
              i === group
                ? 'border-indigo-500 text-indigo-700 font-semibold bg-indigo-50'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1 bg-gray-50 border border-gray-200 rounded-lg p-2">
        {active.symbols.map(sym => (
          <button
            key={sym}
            type="button"
            // mousedown 기본동작을 막아야 입력칸 포커스/커서 위치가 유지됨
            onMouseDown={e => e.preventDefault()}
            onClick={() => onInsert(sym)}
            disabled={disabled}
            title={sym}
            className="min-w-[28px] h-7 px-1.5 text-sm rounded border border-gray-200 bg-white text-gray-700 hover:border-indigo-400 hover:bg-indigo-50 disabled:opacity-40 disabled:hover:border-gray-200 disabled:hover:bg-white transition-colors leading-none whitespace-nowrap"
          >
            {sym}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-gray-400 mt-1.5 h-4">
        {disabled ? '정답 입력칸을 클릭한 뒤 기호를 누르면 커서 위치에 입력됩니다' : hint}
      </p>
    </div>
  )
}

// ── 이미지 첨부 ──────────────────────────────────────────────────────────────

/**
 * 이미지 첨부 처리 훅. 압축·에러 처리·진행 상태를 공통화한다.
 * onAttached(key, dataUrl) 에서 상태를 갱신하면 된다.
 */
export function useImageAttach<K extends string | number>(
  onAttached: (key: K, dataUrl: string) => void
) {
  const [busyKey, setBusyKey] = useState<K | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const pendingKey = useRef<K | null>(null)

  // onAttached가 매 렌더 새로 만들어져도 attach/FileInput 신원은 유지되어야 한다.
  // (FileInput이 리마운트되면 파일 선택 중 change 이벤트를 놓친다)
  const onAttachedRef = useRef(onAttached)
  useEffect(() => { onAttachedRef.current = onAttached }, [onAttached])

  const attach = useCallback(async (key: K, file: Blob) => {
    setBusyKey(key)
    try {
      onAttachedRef.current(key, await compressAnswerImage(file))
    } catch (e) {
      alert(e instanceof Error ? e.message : '이미지를 불러오지 못했습니다.')
    } finally {
      setBusyKey(null)
    }
  }, [])

  const openFilePicker = useCallback((key: K) => {
    pendingKey.current = key
    fileInputRef.current?.click()
  }, [])

  /** 입력칸에 붙여넣기 — 이미지가 있으면 첨부하고 true 반환 */
  const handlePaste = useCallback((key: K, e: React.ClipboardEvent) => {
    const f = pickImageFile(e.clipboardData.items)
    if (!f) return false
    e.preventDefault()
    attach(key, f)
    return true
  }, [attach])

  const handleDrop = useCallback((key: K, e: React.DragEvent) => {
    const f = pickImageFile(e.dataTransfer.files)
    if (!f) return false
    e.preventDefault()
    attach(key, f)
    return true
  }, [attach])

  /** 📷 버튼들이 공유하는 숨은 파일 입력. 컴포넌트 어딘가에 한 번 렌더링 */
  const FileInput = useCallback(() => (
    <input
      ref={fileInputRef}
      type="file"
      accept="image/*"
      className="hidden"
      onChange={e => {
        const f = e.target.files?.[0]
        const key = pendingKey.current
        e.target.value = ''
        pendingKey.current = null
        if (f && key !== null) attach(key, f)
      }}
    />
  ), [attach])

  return useMemo(
    () => ({ busyKey, attach, openFilePicker, handlePaste, handleDrop, FileInput }),
    [busyKey, attach, openFilePicker, handlePaste, handleDrop, FileInput]
  )
}

/** 정답 입력칸 옆 📷 버튼 */
export function AttachImageButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="이미지 파일 첨부 (Ctrl+V 붙여넣기·드래그&드롭도 가능)"
      className="shrink-0 w-6 h-6 rounded text-gray-300 hover:text-indigo-600 hover:bg-indigo-50 transition-colors text-xs leading-none"
    >
      📷
    </button>
  )
}

/** 첨부된 이미지 제거 × 버튼 */
export function RemoveImageButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="이미지 삭제"
      className="shrink-0 w-6 h-6 rounded text-gray-400 hover:text-rose-500 hover:bg-rose-50 transition-colors text-base leading-none"
    >
      ×
    </button>
  )
}

// ── 문제유형(구역) 선택 ──────────────────────────────────────────────────────

/**
 * 문제유형 칩 목록. 선생님이 직접 유형을 추가·삭제할 수 있다.
 * 목록은 계정에 저장되므로 교재가 바뀌어도 유지된다.
 */
export function SectionPresetPicker({
  presets, value, onSelect, onAddPreset, onRemovePreset, size = 'sm',
}: {
  presets: string[]
  value: string
  onSelect: (section: string) => void
  onAddPreset: (name: string) => void
  onRemovePreset: (name: string) => void
  size?: 'sm' | 'md'
}) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')

  const commit = () => {
    const name = draft.trim()
    if (name) { onAddPreset(name); onSelect(name) }
    setDraft('')
    setAdding(false)
  }

  const chip = size === 'md' ? 'text-[11px] px-2 py-1' : 'text-[10px] px-1.5 py-0.5'

  return (
    <div className="flex flex-wrap gap-1 items-center">
      {presets.map(s => (
        <span key={s} className="relative group inline-flex">
          <button type="button"
            onClick={() => onSelect(s)}
            className={`${chip} rounded border transition-colors pr-4 ${
              value === s
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'border-gray-200 bg-white text-gray-500 hover:border-indigo-400'
            }`}>
            {s}
          </button>
          <button type="button"
            title={`"${s}" 유형을 목록에서 삭제`}
            onClick={e => {
              e.stopPropagation()
              if (confirm(`문제유형 목록에서 "${s}"을(를) 삭제할까요?\n이미 이 유형으로 저장된 문제는 그대로 남습니다.`)) {
                onRemovePreset(s)
              }
            }}
            className={`absolute right-0.5 top-1/2 -translate-y-1/2 leading-none opacity-0 group-hover:opacity-100 transition-opacity ${
              value === s ? 'text-white/80 hover:text-white' : 'text-gray-300 hover:text-rose-500'
            }`}>
            ×
          </button>
        </span>
      ))}

      {adding ? (
        <input
          autoFocus
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); commit() }
            if (e.key === 'Escape') { setDraft(''); setAdding(false) }
          }}
          placeholder="새 문제유형"
          className={`${chip} w-28 rounded border border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-300`}
        />
      ) : (
        <button type="button"
          onClick={() => setAdding(true)}
          title="문제유형 직접 추가"
          className={`${chip} rounded border border-dashed border-gray-300 text-gray-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors`}>
          ＋ 유형 추가
        </button>
      )}
    </div>
  )
}

/** 스냅샷 입력 안내 문구 */
export function SnapshotHint() {
  return (
    <p className="text-[11px] text-gray-400">
      서술형처럼 복잡한 답은{' '}
      <span className="font-semibold text-gray-500">Win + Shift + S</span>로 캡처한 뒤 입력칸에서{' '}
      <span className="font-semibold text-gray-500">Ctrl + V</span>로 붙여넣으세요. (📷 버튼·드래그&드롭도 가능)
    </p>
  )
}