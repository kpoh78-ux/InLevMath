// packages/shared/src/questionImport.ts
//
// 문제 반입 계약 — 문제집 반입 앱과 InLevMath 사이의 유일한 약속.
//
// ── 왜 이 파일이 있나 ───────────────────────────────────────────────────────
// 문제집 PDF 에서 문제·답·풀이를 뽑고 사람이 검수하는 일은 별도 앱이 맡는다.
// 그 앱은 **자기 DB 를 쓴다.** 같은 PostgreSQL 에 두 앱이 각자 Prisma 스키마로
// 붙으면 한쪽 마이그레이션이 다른 쪽을 리셋하려 든다 (이 DB 는 이미 드리프트가
// 있어 특히 위험하다).
//
// 두 앱이 공유하는 것은 이 JSON 형식 하나뿐이다.
//
// ── 누가 무엇을 하나 ────────────────────────────────────────────────────────
//   반입 앱      PDF 파싱 · 사람 검수 · 문제집에 적힌 말 그대로 담기
//   InLevMath    형식 검증 · 교육과정 좌표 매칭 · 난이도 확정 · 저장
//
// **반입 앱은 소단원 ID·유형 ID·개념노드 ID 를 보내지 않는다.**
// 그러려면 581/1,305/1,474개 트리를 복제해야 하고, 복제하는 순간 어긋나기
// 시작한다. 교재에 적힌 문자열만 보내면 InLevMath 가 매칭한다.

import type { Difficulty } from './index'

export const QUESTION_IMPORT_FORMAT = 'inlevmath-question-import'
export const QUESTION_IMPORT_VERSION = 1

/** 한 번에 보낼 수 있는 문항 수 — 요청이 너무 커지면 나눠 보낸다 */
export const QUESTION_IMPORT_MAX_ITEMS = 500

/** 문제집이 문제를 묶어 두는 구획. 난이도 표시가 없을 때 이것으로 추론한다 */
export type BookSection =
  | '개념'      // 개념 설명 직후의 공식 적용 문제 (1단계)
  | '유형'      // 유형별로 분류된 문제 (2단계)
  | '시험대비'  // 학교시험대비 · 단원평가
  | '서술형'    // 서술형
  | '심화'      // 심화 · 최고난도

export const BOOK_SECTIONS: BookSection[] = ['개념', '유형', '시험대비', '서술형', '심화']

/**
 * 구획 → 난이도.
 *
 * 문제집이 스스로 난이도를 표시한 경우(★★★ 등)에는 **그것이 우선**이고,
 * 표시가 없을 때만 이 표를 쓴다.
 *
 * 1(최하)은 비워 둔다. 개념 단계보다 쉬운 것은 연산 반복뿐이라
 * 연산교재용으로 남겨 둔다.
 */
export const SECTION_DIFFICULTY: Record<BookSection, Difficulty> = {
  개념: 2,
  유형: 3,
  시험대비: 4,
  서술형: 5,
  심화: 5,
}

/** 문제집마다 구획 이름이 다르다. 흔한 표기를 표준 구획으로 옮긴다 */
const SECTION_ALIASES: [RegExp, BookSection][] = [
  [/개념|공식|기본\s*문제|확인\s*문제|익히기|바로\s*확인|예제/, '개념'],
  [/유형|대표\s*문제|필수/, '유형'],
  [/시험|단원\s*(평가|마무리)|중간|기말|내신|실전/, '시험대비'],
  [/서술|논술/, '서술형'],
  [/심화|최고|최상|고난도|도전|발전/, '심화'],
]

/**
 * 문제집 구획 문자열을 표준 구획으로 옮긴다. 못 알아보면 null.
 *
 * 순서가 중요하다 — "서술형 심화"처럼 겹치는 표기는 앞선 규칙이 이긴다.
 * 서술형을 심화보다 먼저 보는 이유는 둘 다 5라 결과가 같고,
 * 화면에 무엇으로 잡혔는지 보여 줄 때 서술형이 더 구체적이기 때문이다.
 */
export function normalizeSection(raw: string): BookSection | null {
  const text = (raw ?? '').trim()
  if (text === '') return null
  if ((BOOK_SECTIONS as string[]).includes(text)) return text as BookSection
  for (const [re, section] of SECTION_ALIASES) {
    if (re.test(text)) return section
  }
  return null
}

/** 문제집이 찍어 둔 난이도 표시(★★★, 상/중/하, A/B/C, 1~5)를 1~5 로 옮긴다 */
export function parseBookDifficulty(raw: string): Difficulty | null {
  const text = (raw ?? '').trim()
  if (text === '') return null

  // ★ 개수 — 최대 5개
  const stars = (text.match(/[★✦●]/g) ?? []).length
  if (stars > 0) return Math.min(5, stars) as Difficulty

  // 상/중/하 계열
  if (/최상|최고/.test(text)) return 5
  if (/^상|어려움|난이도\s*상/.test(text)) return 4
  if (/^중|보통/.test(text)) return 3
  if (/^하|쉬움/.test(text)) return 2
  if (/최하/.test(text)) return 1

  // A~E 단계 (A 가 쉬운 쪽인 관례를 따른다)
  const letter = /^([A-Ea-e])\s*단계?$/.exec(text)
  if (letter) return (letter[1].toUpperCase().charCodeAt(0) - 64) as Difficulty

  // 숫자
  const num = Number(text)
  if (Number.isFinite(num) && num >= 1 && num <= 5) return Math.round(num) as Difficulty

  return null
}

/**
 * 한 문항의 난이도를 정한다.
 *
 * 우선순위: 문제집이 찍은 난이도 > 구획으로 추론 > 없음(null).
 * 없으면 null 로 둔다 — 모르는 것을 '중'으로 채우면 나중에 구분할 수 없다.
 */
export function resolveDifficulty(input: {
  difficulty?: number | null
  bookDifficulty?: string | null
  section?: string | null
}): { difficulty: Difficulty | null; basis: 'explicit' | 'book' | 'section' | 'none' } {
  // 반입 앱이 이미 1~5 로 정해 보냈으면 그대로 쓴다
  const explicit = input.difficulty
  if (typeof explicit === 'number' && explicit >= 1 && explicit <= 5) {
    return { difficulty: Math.round(explicit) as Difficulty, basis: 'explicit' }
  }

  const fromBook = parseBookDifficulty(input.bookDifficulty ?? '')
  if (fromBook) return { difficulty: fromBook, basis: 'book' }

  const section = normalizeSection(input.section ?? '')
  if (section) return { difficulty: SECTION_DIFFICULTY[section], basis: 'section' }

  return { difficulty: null, basis: 'none' }
}

// ── 반입 형식 ───────────────────────────────────────────────────────────────

/** 문제집에 적힌 단원 표기 — 있는 그대로 보낸다. ID 로 바꾸지 않는다 */
export interface ImportUnitPath {
  /** 대단원. 예: "3. 이차함수" */
  major?: string
  /** 중단원. 예: "이차함수의 그래프" */
  middle?: string
  /** 소단원. 예: "이차함수 y=ax²+bx+c의 그래프" — 좌표 매칭의 주된 단서다 */
  minor?: string
  /** 유형명. 예: "유형 07 최대·최소" */
  type?: string
}

export interface ImportQuestion {
  /** 반입 앱 안에서 이 문항의 고유 키. 같은 값으로 다시 보내면 덮어쓴다 */
  ref: string

  /** 문제 본문. 이미지로만 있으면 비워 둔다 */
  content?: string
  /** 채점 답안 */
  answer: string
  /** 풀이·해설 */
  solution?: string
  answerType?: 'multiple' | 'short' | 'image'

  /** 1~5 로 이미 정했다면. 없으면 bookDifficulty·section 으로 추론한다 */
  difficulty?: number
  /** 문제집이 찍어 둔 표시 그대로. 예: "★★★", "상", "B단계" */
  bookDifficulty?: string
  /** 문제가 속한 구획. 예: "유형 07", "단원 마무리", "서술형" */
  section?: string

  unitPath?: ImportUnitPath

  /** 문제집 쪽번호·문항번호 */
  page?: number
  number?: number
}

export interface ImportPayload {
  format: typeof QUESTION_IMPORT_FORMAT
  version: number
  source: {
    /** 문제집 이름. 예: "쎈 중3-1" */
    book: string
    publisher?: string
    /** 학년 표기. 좌표 매칭 후보를 좁히는 데 쓴다. 예: "중3" */
    grade?: string
    /** 보낸 도구 이름·버전. 문제 생겼을 때 어느 버전이 넣었는지 알아야 한다 */
    importedBy?: string
  }
  questions: ImportQuestion[]
}

// ── 검증 ────────────────────────────────────────────────────────────────────

export interface ImportValidationError {
  /** 몇 번째 문항인가 (0-based). 페이로드 전체 문제면 -1 */
  index: number
  ref?: string
  message: string
}

/**
 * 반입 페이로드를 검증한다. 순수 함수 — DB 를 보지 않는다.
 *
 * 여기서 걸러지는 것은 형식 문제뿐이다. "이 소단원이 실재하는가"처럼
 * DB 를 봐야 아는 것은 서버가 따로 판단한다.
 */
export function validateImportPayload(input: unknown): {
  ok: boolean
  errors: ImportValidationError[]
  payload?: ImportPayload
} {
  const errors: ImportValidationError[] = []
  const fail = (message: string, index = -1, ref?: string) => errors.push({ index, ref, message })

  if (!input || typeof input !== 'object') {
    fail('본문이 객체가 아닙니다.')
    return { ok: false, errors }
  }
  const p = input as Partial<ImportPayload>

  if (p.format !== QUESTION_IMPORT_FORMAT) {
    fail(`format 이 "${QUESTION_IMPORT_FORMAT}" 이어야 합니다.`)
  }
  if (typeof p.version !== 'number' || p.version > QUESTION_IMPORT_VERSION) {
    fail(`version 은 ${QUESTION_IMPORT_VERSION} 이하의 숫자여야 합니다.`)
  }
  if (!p.source || typeof p.source !== 'object' || !String(p.source.book ?? '').trim()) {
    fail('source.book (문제집 이름)이 필요합니다.')
  }
  if (!Array.isArray(p.questions)) {
    fail('questions 배열이 필요합니다.')
    return { ok: false, errors }
  }
  if (p.questions.length === 0) {
    fail('questions 가 비어 있습니다.')
  }
  if (p.questions.length > QUESTION_IMPORT_MAX_ITEMS) {
    fail(`한 번에 ${QUESTION_IMPORT_MAX_ITEMS}문항까지만 보낼 수 있습니다. (받은 값 ${p.questions.length})`)
  }

  const seen = new Set<string>()
  p.questions.forEach((q, i) => {
    if (!q || typeof q !== 'object') {
      fail('문항이 객체가 아닙니다.', i)
      return
    }
    const ref = String(q.ref ?? '').trim()
    if (!ref) {
      fail('ref 가 필요합니다. 같은 문제를 두 번 넣지 않으려면 고유 키가 있어야 합니다.', i)
    } else if (seen.has(ref)) {
      fail('같은 페이로드 안에 ref 가 중복됩니다.', i, ref)
    } else {
      seen.add(ref)
    }

    if (typeof q.answer !== 'string' || q.answer.trim() === '') {
      fail('answer (채점 답안)가 비어 있습니다.', i, ref)
    }
    if (q.answerType && !['multiple', 'short', 'image'].includes(q.answerType)) {
      fail('answerType 은 multiple | short | image 중 하나여야 합니다.', i, ref)
    }
    if (q.difficulty != null && !(Number(q.difficulty) >= 1 && Number(q.difficulty) <= 5)) {
      fail('difficulty 는 1~5 여야 합니다.', i, ref)
    }
  })

  return errors.length > 0
    ? { ok: false, errors }
    : { ok: true, errors: [], payload: input as ImportPayload }
}
