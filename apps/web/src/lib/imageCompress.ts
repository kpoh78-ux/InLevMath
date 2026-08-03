// 정답 스냅샷 이미지 압축 (브라우저 전용, Chrome 기준)
//
// 캡처도구로 찍은 PNG는 그대로 두면 수백 KB~수 MB라
// webp로 리사이즈·재인코딩해서 data URL로 만든다.

import { MAX_ANSWER_IMAGE_BYTES } from './answers'

const MAX_W = 1000
const MAX_H = 700
const QUALITY_STEPS = [0.85, 0.7, 0.55, 0.4]

export async function compressAnswerImage(file: Blob): Promise<string> {
  const bitmap = await createImageBitmap(file)
  try {
    let scale = Math.min(1, MAX_W / bitmap.width, MAX_H / bitmap.height)

    // 품질을 낮춰가며, 그래도 크면 크기를 줄여가며 용량 한도를 맞춘다
    for (let attempt = 0; attempt < 3; attempt++) {
      const w = Math.max(1, Math.round(bitmap.width * scale))
      const h = Math.max(1, Math.round(bitmap.height * scale))

      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('캔버스를 사용할 수 없습니다.')
      // 투명 배경 스냅샷이 검게 보이지 않도록 흰 배경을 깔아준다
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, w, h)
      ctx.drawImage(bitmap, 0, 0, w, h)

      for (const q of QUALITY_STEPS) {
        const url = canvas.toDataURL('image/webp', q)
        const base64Length = url.length - (url.indexOf(',') + 1)
        if (base64Length <= MAX_ANSWER_IMAGE_BYTES) return url
      }
      scale *= 0.7
    }
    throw new Error('이미지 용량이 너무 큽니다. 더 작은 영역을 캡처해주세요.')
  } finally {
    bitmap.close?.()
  }
}

/** 클립보드/드롭 데이터에서 첫 번째 이미지 파일을 꺼낸다 */
export function pickImageFile(list: DataTransferItemList | FileList | null): File | null {
  if (!list) return null
  if (list instanceof FileList) {
    return Array.from(list).find(f => f.type.startsWith('image/')) ?? null
  }
  for (const item of Array.from(list)) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const f = item.getAsFile()
      if (f) return f
    }
  }
  return null
}