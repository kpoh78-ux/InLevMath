'use client'

import React, { useRef, useEffect, useState } from 'react'

// 내장 경량 SVG 아이콘 컴포넌트
const PenTool: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
  </svg>
)

const Eraser: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
)

const Trash2: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
)

interface ScratchpadCanvasProps {
  height?: number;
  onExportImage?: (dataUrl: string) => void;
}

export const ScratchpadCanvas: React.FC<ScratchpadCanvasProps> = ({
  height = 320,
  onExportImage,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [penColor, setPenColor] = useState('#4f46e5')
  const [lineWidth, setLineWidth] = useState(3)
  const [isEraser, setIsEraser] = useState(false)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // 레티나 디스플레이 고해상도 보정
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [])

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent | React.PointerEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    let clientX = 0
    let clientY = 0

    if ('touches' in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX
      clientY = e.touches[0].clientY
    } else if ('clientX' in e) {
      clientX = e.clientX
      clientY = e.clientY
    }

    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    }
  }

  const startDrawing = (e: React.MouseEvent | React.TouchEvent | React.PointerEvent) => {
    // 터치 기본 스크롤/제스처 차단
    if ('touches' in e && e.cancelable) {
      e.preventDefault()
    }

    setIsDrawing(true)
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const pt = getCoordinates(e)
    lastPointRef.current = pt

    ctx.beginPath()
    ctx.strokeStyle = isEraser ? '#ffffff' : penColor
    ctx.lineWidth = isEraser ? 20 : lineWidth
    ctx.fillStyle = isEraser ? '#ffffff' : penColor
    
    // 점 터치 시 즉시 점 그리기
    ctx.arc(pt.x, pt.y, (isEraser ? 20 : lineWidth) / 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(pt.x, pt.y)
  }

  const draw = (e: React.MouseEvent | React.TouchEvent | React.PointerEvent) => {
    if (!isDrawing) return
    if ('touches' in e && e.cancelable) {
      e.preventDefault()
    }

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const pt = getCoordinates(e)
    const lastPt = lastPointRef.current

    if (lastPt) {
      ctx.beginPath()
      ctx.strokeStyle = isEraser ? '#ffffff' : penColor
      ctx.lineWidth = isEraser ? 20 : lineWidth
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      // 베지어 곡선 중간점(Midpoint) 보간으로 꺾임 없는 부드러운 곡선 렌더링
      const midX = (lastPt.x + pt.x) / 2
      const midY = (lastPt.y + pt.y) / 2
      ctx.moveTo(lastPt.x, lastPt.y)
      ctx.quadraticCurveTo(lastPt.x, lastPt.y, midX, midY)
      ctx.stroke()
    }

    lastPointRef.current = pt
  }

  const stopDrawing = () => {
    setIsDrawing(false)
    lastPointRef.current = null
  }

  const clearCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    lastPointRef.current = null
  }

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
      {/* 툴바 */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsEraser(false)}
            className={`p-2 rounded-lg transition-colors cursor-pointer ${
              !isEraser ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-200'
            }`}
          >
            <PenTool className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsEraser(true)}
            className={`p-2 rounded-lg transition-colors cursor-pointer ${
              isEraser ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Eraser className="w-4 h-4" />
          </button>
          {!isEraser && (
            <div className="flex items-center gap-1.5 ml-2">
              {['#4f46e5', '#0f172a', '#e11d48', '#059669'].map((color) => (
                <button
                  key={color}
                  onClick={() => setPenColor(color)}
                  style={{ backgroundColor: color }}
                  className={`w-5 h-5 rounded-full border-2 transition-transform cursor-pointer ${
                    penColor === color ? 'scale-125 border-white shadow-xs' : 'border-transparent'
                  }`}
                />
              ))}
            </div>
          )}
        </div>
        <button
          onClick={clearCanvas}
          className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
          title="필기 전체 지우기"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* 캔버스 터치 영역 */}
      <canvas
        ref={canvasRef}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
        className="w-full h-80 touch-none cursor-crosshair bg-white"
      />
    </div>
  )
}
