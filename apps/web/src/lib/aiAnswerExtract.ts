// 학습지 PDF/이미지에서 문제·정답 페이지를 구분하고 문항별 정답을 읽어오는 모듈
//
// 원본 파일은 DB에 저장하지 않는다(lib/worksheetFiles.ts 참고).
// 선생님 PC에서 읽은 파일을 그때그때 Claude에 넘겨 정답만 받아오고 파일은 버린다.
//
// API 키는 반드시 .env의 ANTHROPIC_API_KEY에서만 읽는다. 코드에 하드코딩 금지.

import Anthropic from '@anthropic-ai/sdk'

/** 요청당 파일 크기 상한. Claude 요청 한도(32MB)와 서버 메모리를 고려한 값 */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024

export const SUPPORTED_MEDIA_TYPES = [
  'application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif',
] as const

export type ExtractedAnswer = {
  /** 1-based 문제 번호 */
  no: number
  /** 정답 텍스트. 읽지 못했으면 빈 문자열 */
  answer: string
  /** 원본에서 명확히 읽었는지. false면 화면에서 확인 필요 표시 */
  confident: boolean
}

export type ExtractResult = {
  /** 문제가 실린 페이지 범위 (모르면 0) */
  problemPageFrom: number
  problemPageTo: number
  /** 정답·해설이 실린 페이지 범위 (모르면 0) */
  answerPageFrom: number
  answerPageTo: number
  /** 학습지 전체 문항 수 */
  problemCount: number
  answers: ExtractedAnswer[]
  /** 사람이 확인해야 할 점 (한국어 한두 문장) */
  note: string
}

const SYSTEM = `당신은 한국 수학 학원의 학습지를 정리하는 조교입니다.
학습지 파일 한 부를 받아 두 가지 일을 합니다.

1) 문제가 실린 페이지와 정답·해설이 실린 페이지를 구분합니다.
   보통 앞쪽이 문제, 뒤쪽이 "정답", "정답 및 해설", "빠른 정답" 같은 제목의 해설입니다.
   페이지 번호는 파일의 물리적 순서(첫 장이 1)로 셉니다.
   한쪽 구간이 없으면 그 범위는 0으로 둡니다.

2) 정답 부분을 읽어 문항별 정답을 뽑습니다.
   - 문제 번호는 학습지에 적힌 번호를 그대로 씁니다. 1번부터 빠짐없이 채웁니다.
   - 객관식은 번호만 씁니다. 예: 3
   - 주관식·단답형은 답만 씁니다. 풀이 과정은 넣지 않습니다.
   - 수식은 일반 텍스트로 씁니다. 예: x=2, 3/4, x^2+1, √3, ±2
   - 정답이 그림·도형·그래프여서 텍스트로 옮길 수 없으면 answer를 빈 문자열로 두고
     confident를 false로 합니다. (선생님이 나중에 스냅샷 이미지를 붙입니다)
   - 흐릿하거나 해석이 갈리면 최선의 값을 쓰되 confident를 false로 합니다.
   - 절대 추측으로 지어내지 않습니다. 근거가 없으면 빈 문자열 + confident false입니다.

note에는 선생님이 확인해야 할 점을 한국어로 짧게 적습니다.
문제가 없으면 빈 문자열로 둡니다.`

const SCHEMA = {
  type: 'object',
  properties: {
    problemPageFrom: { type: 'integer' },
    problemPageTo: { type: 'integer' },
    answerPageFrom: { type: 'integer' },
    answerPageTo: { type: 'integer' },
    problemCount: { type: 'integer' },
    answers: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          no: { type: 'integer' },
          answer: { type: 'string' },
          confident: { type: 'boolean' },
        },
        required: ['no', 'answer', 'confident'],
        additionalProperties: false,
      },
    },
    note: { type: 'string' },
  },
  required: [
    'problemPageFrom', 'problemPageTo', 'answerPageFrom', 'answerPageTo',
    'problemCount', 'answers', 'note',
  ],
  additionalProperties: false,
} as const

/** 파일 하나를 Claude에 넘겨 문제/정답 페이지 구분 + 문항별 정답을 받아온다 */
export async function extractAnswersFromFile(opts: {
  /** base64 (data URL 접두사 없이) */
  data: string
  mediaType: string
  fileName: string
  /** 선생님이 알려준 문항 수. 있으면 그 개수에 맞춰 채우도록 요청한다 */
  expectedCount?: number
}): Promise<ExtractResult> {
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
    `학습지 파일: ${opts.fileName}`,
    opts.expectedCount
      ? `이 학습지는 ${opts.expectedCount}문항입니다. 1번부터 ${opts.expectedCount}번까지 모두 채워주세요.`
      : '문항 수는 학습지를 보고 판단해주세요.',
    '문제/정답 페이지를 구분하고 문항별 정답을 뽑아주세요.',
  ].join('\n')

  const response = await client.messages.create({
    model: 'claude-opus-5',
    max_tokens: 16000,
    system: SYSTEM,
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: [fileBlock, { type: 'text', text: ask }] }],
  })

  if (response.stop_reason === 'refusal') {
    throw new Error('AI가 이 파일의 처리를 거절했습니다. 다른 파일로 시도해주세요.')
  }
  if (response.stop_reason === 'max_tokens') {
    throw new Error('학습지가 너무 길어 정답을 다 읽지 못했습니다. 파일을 나눠서 시도해주세요.')
  }

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('')

  let parsed: ExtractResult
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('AI 응답을 해석하지 못했습니다. 다시 시도해주세요.')
  }

  return normalize(parsed, opts.expectedCount)
}

/** 번호 중복·누락을 정리해 1번부터 빈틈없는 배열로 만든다 */
function normalize(r: ExtractResult, expectedCount?: number): ExtractResult {
  const raw = Array.isArray(r.answers) ? r.answers : []

  const count = Math.max(
    1,
    expectedCount || r.problemCount || raw.reduce((m, a) => Math.max(m, a.no || 0), 0)
  )

  const byNo = new Map<number, ExtractedAnswer>()
  for (const a of raw) {
    const no = Number(a?.no)
    if (!Number.isInteger(no) || no < 1 || no > count) continue
    if (byNo.has(no)) continue // 먼저 읽은 값을 남긴다
    byNo.set(no, {
      no,
      answer: typeof a.answer === 'string' ? a.answer.trim() : '',
      confident: a.confident === true && typeof a.answer === 'string' && a.answer.trim() !== '',
    })
  }

  const answers: ExtractedAnswer[] = []
  for (let no = 1; no <= count; no++) {
    answers.push(byNo.get(no) ?? { no, answer: '', confident: false })
  }

  const page = (n: unknown) => (Number.isInteger(n) && (n as number) > 0 ? (n as number) : 0)

  return {
    problemPageFrom: page(r.problemPageFrom),
    problemPageTo: page(r.problemPageTo),
    answerPageFrom: page(r.answerPageFrom),
    answerPageTo: page(r.answerPageTo),
    problemCount: count,
    answers,
    note: typeof r.note === 'string' ? r.note : '',
  }
}