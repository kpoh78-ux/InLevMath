// 학습지 정답 공통 유틸
//
// answersJson은 문제별 정답 문자열 배열이다.
// 서술형 스냅샷 정답은 배열에 IMAGE_ANSWER_MARKER만 넣고,
// 실제 이미지는 WorksheetAnswerImage 테이블에 따로 저장한다.
// (학습지 목록·대시보드 집계가 base64로 무거워지는 것을 막기 위함)

export const IMAGE_ANSWER_MARKER = '__img__'

/** answersJson 항목이 이미지 정답인지 */
export const isImageAnswer = (v: string) => v === IMAGE_ANSWER_MARKER

const DATA_URL_RE = /^data:(image\/(?:png|jpe?g|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/

/** 클라이언트가 보낸 값이 이미지 data URL인지 */
export const isImageDataUrl = (v: string) => DATA_URL_RE.test(v)

/** data URL → { mimeType, data(base64 본문) }. 형식이 아니면 null */
export function parseImageDataUrl(v: string): { mimeType: string; data: string } | null {
  const m = DATA_URL_RE.exec(v)
  if (!m) return null
  return { mimeType: m[1], data: m[2].replace(/\s/g, '') }
}

/** DB 저장값 → 브라우저에서 쓸 data URL */
export const toDataUrl = (mimeType: string, data: string) => `data:${mimeType};base64,${data}`

/** 이미지 1장 최대 용량 (base64 기준) */
export const MAX_ANSWER_IMAGE_BYTES = 500 * 1024

/** 한 번의 저장 요청에 담을 수 있는 이미지 합계 최대 용량 */
export const MAX_ANSWER_IMAGE_TOTAL_BYTES = 8 * 1024 * 1024

/** 정답 입력용 수식 기호 팔레트 */
export const MATH_SYMBOLS = [
  '①', '②', '③', '④', '⑤',
  '√', '²', '³', '⁻¹', 'π', '∠', '△', '□', '∽', '≡', '⊥', '∥',
  '±', '×', '÷', '≤', '≥', '≠', '∴', '°', '㎝', '㎠', '㎤',
  'α', 'β', 'θ', '≒', '∞',
]

/**
 * 문제집 문제유형(구역) 프리셋 — 직접 입력도 가능하므로 어디까지나 빠른 선택용.
 * 교재마다 이름이 다르므로 목록에 없으면 그대로 타이핑해서 쓰면 된다.
 */
export const TEXTBOOK_SECTION_PRESETS = [
  'A단계', 'B단계', 'C단계',
  '개념익히기', '대표문제', '필수유형', '확인 체크', '한번 더 풀기', '표현 더하기',
  '이런 문제가 시험에 나온다', '중단원 마무리', '대단원 마무리', '서술형',
]

/** 교재 페이지 상한 (쪽번호 입력 검증용) */
export const MAX_BOOK_PAGE = 2000

/** 문제집 문제 유형 */
export type TextbookProblemType = 'multiple' | 'short' | 'image'

/** 한 번에 조회할 문제 수 상한 — 3000문제 교재에서 전체 로딩을 막는다 */
export const PROBLEM_PAGE_SIZE = 100
export const PROBLEM_PAGE_SIZE_MAX = 500

/** 교재 1권당 문제 수 상한 */
export const MAX_TEXTBOOK_PROBLEMS = 5000