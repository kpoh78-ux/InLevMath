'use client'

// 학습지·문제집 정답 입력 공용 컴포넌트
//  - 수식 기호 팔레트 (커서 위치 삽입)
//  - 스냅샷 이미지 첨부 (Ctrl+V 붙여넣기 / 📷 파일 선택 / 드래그&드롭)
//  - 이미지 정답 썸네일 + 클릭 확대 팝업

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { MATH_SYMBOLS } from '@/lib/answers'
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

export function SymbolPalette({
  onInsert, disabled, hint,
}: { onInsert: (sym: string) => void; disabled: boolean; hint?: string }) {
  return (
    <div>
      <div className="flex flex-wrap gap-1 bg-gray-50 border border-gray-200 rounded-lg p-2">
        {MATH_SYMBOLS.map(sym => (
          <button
            key={sym}
            type="button"
            // mousedown 기본동작을 막아야 입력칸 포커스/커서 위치가 유지됨
            onMouseDown={e => e.preventDefault()}
            onClick={() => onInsert(sym)}
            disabled={disabled}
            className="w-7 h-7 text-sm rounded border border-gray-200 bg-white text-gray-700 hover:border-indigo-400 hover:bg-indigo-50 disabled:opacity-40 disabled:hover:border-gray-200 disabled:hover:bg-white transition-colors leading-none"
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