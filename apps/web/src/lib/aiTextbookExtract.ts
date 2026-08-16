// 교재 정답·해설 PDF에서 문항별 정답과 단원·유형·쪽번호를 읽어오는 모듈
//
// 학습지(aiAnswerExtract.ts)는 정답만 뽑으면 되지만,
// 교재는 정답 입력 화면이 페이지 → 구역(소단원+유형)으로 나뉘어 있어
// 대단원·중단원·소단원·문제유형·교재 쪽번호까지 함께 채워야 쓸 수 있다.
//
// API 키는 반드시 .env 의 ANTHROPIC_API_KEY 에서만 읽는다. 코드에 하드코딩 금지.

import Anthropic from '@anthropic-ai/sdk'
import { TEXTBOOK_SECTION_PRESETS, MAX_BOOK_PAGE } from '@/lib/answers'

/** 요청당 파일 크기 상한 */
export const MAX_TEXTBOOK_UPLOAD_BYTES = 20 * 1024 * 1024

/** 한 번에 읽어올 수 있는 문항 수. 넘으면 PDF를 나눠 올린다 */
export const MAX_EXTRACT_PROBLEMS = 500

export type ExtractedProblem = {
  /** 교재에 적힌 문제 번호 */
  number: number
  /** 교재 쪽번호 (모르면 0) */
  bookPage: number
  majorUnit: string
  middleUnit: string
  minorUnit: string
  /** 문제유형/단계 (예: 필수유형, 대표문제, A단계) */
  section: string
  /** 'multiple' 객관식 | 'short' 단답·서술 */
  type: 'multiple' | 'short'
  /** 정답. 읽지 못했으면 빈 문자열 */
  answer: string
  /** 원본에서 명확히 읽었는지 */
  confident: boolean
}

export type TextbookExtractResult = {
  problems: ExtractedProblem[]
  /** 선생님이 확인해야 할 점 */
  note: string
}

const SYSTEM = `당신은 한국 수학 학원의 교재 정답을 정리하는 조교입니다.
교재의 정답·해설 부분을 받아 문항별로 아래를 뽑습니다.

1) 문제 번호 — 교재에 적힌 번호를 그대로 씁니다. 임의로 다시 매기지 않습니다.

2) 정답
   - 객관식은 보기 번호를 숫자로만 씁니다. ①②③④⑤ 는 1,2,3,4,5 로 바꿔 씁니다.
   - 단답형·서술형은 답만 씁니다. 풀이 과정은 넣지 않습니다.
   - 단위는 생략합니다. "12 cm" 는 12, "3 개" 는 3 으로 씁니다.
   - 수식은 일반 텍스트로 씁니다. 예: x=2, 3/4, x^2+1, √3, ±2
   - 정답이 그림·그래프·도형이라 텍스트로 옮길 수 없으면
     answer 를 빈 문자열로 두고 confident 를 false 로 합니다.
   - 흐릿하거나 해석이 갈리면 최선의 값을 쓰되 confident 를 false 로 합니다.
   - 절대 추측으로 지어내지 않습니다. 근거가 없으면 빈 문자열 + confident false 입니다.

3) type — 정답이 보기 번호 하나면 'multiple', 그 밖에는 'short' 입니다.

4) 단원 — 교재의 단원 표기를 그대로 씁니다.
   majorUnit 대단원 / middleUnit 중단원 / minorUnit 소단원.
   해설에 단원명이 안 보이면 빈 문자열로 둡니다. 지어내지 않습니다.

5) section — 문제유형/단계입니다. 교재에 적힌 이름을 그대로 씁니다.
   자주 쓰이는 이름: ${TEXTBOOK_SECTION_PRESETS.join(', ')}
   목록에 없으면 교재에 적힌 이름을 그대로 쓰고, 없으면 빈 문자열로 둡니다.

6) bookPage — 그 문제가 실린 교재 쪽번호입니다.
   해설에 "본문 24쪽" 처럼 적혀 있으면 그 값을 씁니다. 모르면 0 으로 둡니다.
   PDF 파일의 물리적 장수가 아니라 교재에 인쇄된 쪽번호입니다.

번호가 이어지는 문제들은 단원·유형·쪽번호가 같은 경우가 많습니다.
앞 문제와 같으면 같은 값을 반복해서 채워 주세요.

note 에는 선생님이 확인해야 할 점을 한국어로 짧게 적습니다. 없으면 빈 문자열입니다.`

const SCHEMA = {
  type: 'object',
  properties: {
    problems: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          number: { type: 'integer' },
          bookPage: { type: 'integer' },
          majorUnit: { type: 'string' },
          middleUnit: { type: 'string' },
          minorUnit: { type: 'string' },
          section: { type: 'string' },
          type: { type: 'string', enum: ['multiple', 'short'] },
          answer: { type: 'string' },
          confident: { type: 'boolean' },
        },
        required: [
          'number', 'bookPage', 'majorUnit', 'middleUnit',
          'minorUnit', 'section', 'type', 'answer', 'confident',
        ],
        additionalProperties: false,
      },
    },
    note: { type: 'string' },
  },
  required: ['problems', 'note'],
  additionalProperties: false,
} as const

/** 교재 정답 PDF 한 부(또는 일부)를 읽어 문항 목록을 만든다 */
export async function extractTextbookAnswers(opts: {
  /** base64 (data URL 접두사 없이) */
  data: string
  mediaType: string
  fileName: string
  /** 교재명·출판사 — 해설 판독에 도움이 된다 */
  title?: string
  publisher?: string
  /** 이 번호부터 읽어달라고 알려준다 (나눠 올릴 때) */
  fromNumber?: number
}): Promise<TextbookExtractResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY가 설정되지 않았습니다. 서버 .env를 확인해주세요.')
  }

  const client = new Anthropic({ apiKey })

  const fileBlock: Anthropic.ContentBlockParam =
    opts.mediaType === 'application/pdf'
      ? {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: opts.data },
        }
      : {
          type: 'image',
          source: {
            type: 'base64',
            media_type: opts.mediaType as 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif',
            data: opts.data,
          },
        }

  const ask = [
    `교재 정답·해설 파일: ${opts.fileName}`,
    opts.title ? `교재명: ${opts.title}` : '',
    opts.publisher ? `출판사: ${opts.publisher}` : '',
    opts.fromNumber && opts.fromNumber > 1
      ? `${opts.fromNumber}번부터 읽어주세요. 그 앞 번호는 이미 입력돼 있습니다.`
      : '',
    `한 번에 ${MAX_EXTRACT_PROBLEMS}문항까지만 뽑아주세요. 더 있으면 note 에 적어주세요.`,
    '문항별 정답과 단원·문제유형·쪽번호를 정리해주세요.',
  ].filter(Boolean).join('\n')

  // 문항이 수백 개면 출력이 길어 스트리밍으로 받는다 (요청 타임아웃 방지)
  const stream = client.messages.stream({
    model: 'claude-opus-5',
    max_tokens: 64000,
    system: SYSTEM,
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: [fileBlock, { type: 'text', text: ask }] }],
  })
  const response = await stream.finalMessage()

  if (response.stop_reason === 'refusal') {
    throw new Error('AI가 이 파일의 처리를 거절했습니다. 다른 파일로 시도해주세요.')
  }
  if (response.stop_reason === 'max_tokens') {
    throw new Error('교재가 너무 길어 정답을 다 읽지 못했습니다. 정답 PDF를 나눠서 올려주세요.')
  }

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('')

  let parsed: TextbookExtractResult
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('AI 응답을 해석하지 못했습니다. 다시 시도해주세요.')
  }

  return normalize(parsed)
}

const clean = (v: unknown, max = 40) =>
  typeof v === 'string' ? v.trim().slice(0, max) : ''

/**
 * 객관식 정답을 숫자로 통일한다.
 * 교재 해설은 ①②③④⑤ 로 적힌 경우가 많은데,
 * 학생 OMR 입력은 숫자라 그대로 두면 채점에서 전부 오답이 된다.
 */
const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩'
function normalizeChoice(answer: string): string {
  const t = answer.trim()
  const idx = CIRCLED.indexOf(t)
  if (idx >= 0) return String(idx + 1)
  // "3번", "(3)", "3." 처럼 적힌 경우도 숫자만 남긴다
  const m = /^[(]?\s*([1-9]|10)\s*[)번.]?$/.exec(t)
  return m ? m[1] : t
}

/** 번호 중복·범위를 정리하고 번호순으로 세운다 */
function normalize(r: TextbookExtractResult): TextbookExtractResult {
  const raw = Array.isArray(r.problems) ? r.problems : []
  const byNo = new Map<number, ExtractedProblem>()

  for (const p of raw) {
    const number = Math.floor(Number(p?.number))
    if (!Number.isInteger(number) || number < 1) continue
    if (byNo.has(number)) continue   // 먼저 읽은 값을 남긴다

    const page = Math.floor(Number(p.bookPage))
    const type = p.type === 'short' ? 'short' : 'multiple'
    const rawAnswer = clean(p.answer, 200)
    const answer = type === 'multiple' ? normalizeChoice(rawAnswer) : rawAnswer

    byNo.set(number, {
      number,
      bookPage: Number.isInteger(page) && page > 0 && page <= MAX_BOOK_PAGE ? page : 0,
      majorUnit: clean(p.majorUnit),
      middleUnit: clean(p.middleUnit),
      minorUnit: clean(p.minorUnit),
      section: clean(p.section, 30),
      type,
      answer,
      confident: p.confident === true && answer !== '',
    })
  }

  const problems = [...byNo.values()]
    .sort((a, b) => a.number - b.number)
    .slice(0, MAX_EXTRACT_PROBLEMS)

  return { problems, note: typeof r.note === 'string' ? r.note : '' }
}
