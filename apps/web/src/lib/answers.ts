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

/**
 * 정답 입력용 수식 기호 팔레트 — 중·고등 전 과정.
 * 한 줄에 다 늘어놓으면 못 찾으므로 분야별로 나눠 탭으로 보여준다.
 * 항목은 그대로 입력칸에 삽입되는 문자열이라 여러 글자여도 된다.
 */
export const MATH_SYMBOL_GROUPS: { label: string; symbols: string[] }[] = [
  {
    label: '기본',
    symbols: [
      '①', '②', '③', '④', '⑤',
      '±', '∓', '×', '÷', '≠', '≤', '≥', '<', '>', '≒', '≡', '∞',
      '∴', '∵', '°', '％', '~',
    ],
  },
  {
    label: '수·지수',
    symbols: [
      '√', '∛', '²', '³', '⁴', 'ⁿ', '⁻¹', '⁻²',
      '₁', '₂', '₃', 'ₙ', 'ₖ',
      '½', '⅓', '⅔', '¼', '¾',
      'π', '|x|', '⌊ ⌋', '√( )', '×10', 'ℯ',
    ],
  },
  {
    label: '방정식·집합',
    symbols: [
      'x', 'y', 'z', 'a', 'b', 'c', 'k', 'm', 'n', 't',
      '⇒', '⇔', '≠', '≦', '≧',
      '∈', '∉', '⊂', '⊄', '⊆', '∪', '∩', '∅', 'Aᶜ',
      'ℕ', 'ℤ', 'ℚ', 'ℝ', '{ }', '( , )', '[ , ]',
    ],
  },
  {
    label: '함수·미적분',
    symbols: [
      'f(x)', 'g(x)', 'f⁻¹(x)', '(f∘g)(x)', 'y=', '→', '↦',
      'lim', 'x→', '∞', 'Δ', 'dy/dx', "f′(x)", "f″(x)",
      '∫', '∫ₐᵇ', '∑', '∏', 'log', 'logₐ', 'ln', 'eˣ',
      'sin', 'cos', 'tan', 'csc', 'sec', 'cot', 'θ', 'rad',
    ],
  },
  {
    label: '확률·통계',
    symbols: [
      'ₙPᵣ', 'ₙCᵣ', 'ₙΠᵣ', 'ₙHᵣ', 'n!', 'P(A)', 'P(B|A)',
      'A∩B', 'A∪B', 'Aᶜ', 'E(X)', 'V(X)', 'σ(X)',
      'x̄', 'σ', 'σ²', 'μ', 'Σ', 'N(m,σ²)', 'Z=', '~',
    ],
  },
  {
    label: '기하·도형',
    symbols: [
      '∠', '△', '□', '▱', '○', '◇', '⌒', '∡',
      '≡', '∽', '⊥', '∥', '↔', '⊙', '·',
      'AB', 'A̅B̅', '∠ABC', '△ABC',
      '㎝', '㎠', '㎤', '㎜', 'm²', 'm³', 'π', '°',
      'sinA', 'cosA', 'tanA', '벡터', 'x축', 'y축', '원점',
    ],
  },
]

/** 이전 코드 호환용 — 전체 기호를 한 줄로 펼친 목록 */
export const MATH_SYMBOLS = MATH_SYMBOL_GROUPS.flatMap(g => g.symbols)

/**
 * 문제집 문제유형(구역) 기본 목록 — 어디까지나 처음 시작할 때의 예시다.
 * 선생님이 화면에서 직접 추가·삭제하면 Teacher.sectionPresetsJson에 저장되고,
 * 그 뒤로는 저장된 목록을 쓴다. (GET/PUT /api/teacher/section-presets)
 */
export const TEXTBOOK_SECTION_PRESETS = [
  'A단계', 'B단계', 'C단계',
  '개념익히기', '대표문제', '필수유형', '확인 체크', '한번 더 풀기', '표현 더하기',
  '이런 문제가 시험에 나온다', '중단원 마무리', '대단원 마무리', '서술형',
]

/** 문제유형 목록 상한 */
export const MAX_SECTION_PRESETS = 60
export const MAX_SECTION_NAME_LENGTH = 30

/** 교재 페이지 상한 (쪽번호 입력 검증용) */
export const MAX_BOOK_PAGE = 2000

/** 문제집 문제 유형 */
export type TextbookProblemType = 'multiple' | 'short' | 'image'

/** 한 번에 조회할 문제 수 상한 — 3000문제 교재에서 전체 로딩을 막는다 */
export const PROBLEM_PAGE_SIZE = 100
export const PROBLEM_PAGE_SIZE_MAX = 500

/** 교재 1권당 문제 수 상한 */
export const MAX_TEXTBOOK_PROBLEMS = 5000