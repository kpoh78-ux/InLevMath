/**
 * apps/web/src/lib/pdfTextExtractor.ts
 * 토큰 절약을 위한 클라이언트/서버 PDF 텍스트 & 정답표 영역 경량 추출기
 *
 * 구조: 대부분의 학습지는 앞쪽 페이지=문제, 뒤쪽 페이지=정답/해설로 구성된다.
 * "정답/해답" 등의 키워드가 처음 등장하는 페이지를 경계로 삼아
 * 그 페이지부터 마지막 페이지까지를 통째로 답안 구간으로 취급한다
 * (해설이 여러 페이지 이어지며 키워드가 반복되지 않는 경우에도 누락되지 않도록).
 */

export type AnswerStructureType = 'QUICK_TABLE' | 'EXPLANATION' | 'MIXED' | 'NONE'
export type StructureOverride = 'TABLE_ONLY' | 'WITH_EXPLANATION'

export interface ExtractedPdfContent {
  rawText: string
  /** 경계 이전(표지/첫 문제 페이지) 텍스트 — 단원명/제목이 보통 여기 있음 */
  titleSnippet: string
  hasAnswerTable: boolean
  answerSnippet?: string
  /** 답안 구간이 빠른 정답표인지 상세 해설인지 */
  answerStructureType: AnswerStructureType
  /** 정답/해답 키워드로 경계를 확신했는지, 위치 휴리스틱으로 추정했는지 */
  boundaryConfident: boolean
  problemSnippets: string[]
  totalPageCount: number
  estimatedTokenSavedPercent: number
}

const ANSWER_BOUNDARY_KEYWORDS = ['정답 및 해설', '정답과 풀이', '빠른 정답', '정답', '해답', '답안']

// "1. ③" / "12) 4" 같은 문항번호+짧은답 쌍 탐지 (빠른 정답표 판별용)
const QUICK_ANSWER_PATTERN = /\b[0-9]{1,2}\s*[.)]\s*(?:[①-⑤]|[0-9]{1,3}(?:\/[0-9]{1,3})?|[a-zA-Zㄱ-힣]{1,4})(?=\s|$)/g

const TITLE_SNIPPET_MAX_CHARS = 1500
const ANSWER_SNIPPET_MAX_CHARS = 6000
// 경계 키워드를 못 찾았을 때 쓰는 위치 휴리스틱 (문제 약 60% : 정답 약 40%)
const POSITIONAL_FALLBACK_RATIO = 0.6

function isQuickAnswerTablePage(pageText: string): boolean {
  const matches = pageText.match(QUICK_ANSWER_PATTERN) || []
  // 문항+답 쌍이 촘촘하고(표 형태) 페이지 자체가 길지 않으면(설명 없이 표만) 빠른 정답표로 간주
  return matches.length >= 10 && pageText.length < 2500
}

export async function extractLightweightPdfText(
  pdfBuffer: ArrayBuffer,
  opts?: { structureOverride?: StructureOverride }
): Promise<ExtractedPdfContent> {
  // @ts-ignore
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.js')

  // worker 설정 (브라우저 및 서버 안전 처리)
  if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || '3.11.174'}/pdf.worker.min.js`
  }

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    useSystemFonts: true,
    disableFontFace: true,
  })

  const pdfDoc = await loadingTask.promise
  const numPages = pdfDoc.numPages

  const pageTexts: string[] = []
  for (let i = 1; i <= numPages; i++) {
    const page = await pdfDoc.getPage(i)
    const textContent = await page.getTextContent()
    const pageText = textContent.items.map((item: any) => item.str).join(' ')
    pageTexts.push(pageText)
  }

  const fullText = pageTexts.map((t, i) => `\n--- [Page ${i + 1}] ---\n${t}`).join('')

  // 1. 경계(boundary) 탐지: 정답/해설 키워드가 처음 등장하는 페이지
  let boundaryIndex = pageTexts.findIndex(t => ANSWER_BOUNDARY_KEYWORDS.some(k => t.includes(k)))
  const boundaryConfident = boundaryIndex !== -1

  if (!boundaryConfident) {
    // 위치 휴리스틱으로 폴백 (~10% 예외 케이스)
    boundaryIndex = Math.max(0, Math.min(numPages - 1, Math.ceil(numPages * POSITIONAL_FALLBACK_RATIO) - 1))
  }

  const titleSnippet = (pageTexts[0] || '').slice(0, TITLE_SNIPPET_MAX_CHARS).trim()

  const answerPages = pageTexts.slice(boundaryIndex)
  const quickTablePages = answerPages.filter(isQuickAnswerTablePage)
  const explanationPages = answerPages.filter(p => !isQuickAnswerTablePage(p))

  let answerStructureType: AnswerStructureType = 'NONE'
  let selectedAnswerPages: string[] = []

  if (opts?.structureOverride === 'TABLE_ONLY' && quickTablePages.length > 0) {
    selectedAnswerPages = quickTablePages
    answerStructureType = 'QUICK_TABLE'
  } else if (opts?.structureOverride === 'WITH_EXPLANATION') {
    selectedAnswerPages = answerPages
    answerStructureType = quickTablePages.length > 0 ? 'MIXED' : 'EXPLANATION'
  } else if (quickTablePages.length > 0) {
    // 기본 동작: 빠른 정답표가 있으면 그것만 우선 사용 (가장 저렴하고 정확)
    selectedAnswerPages = quickTablePages
    answerStructureType = 'QUICK_TABLE'
  } else if (explanationPages.length > 0) {
    selectedAnswerPages = explanationPages
    answerStructureType = 'EXPLANATION'
  }

  const answerSnippet = selectedAnswerPages.join('\n---\n').slice(0, ANSWER_SNIPPET_MAX_CHARS).trim()

  const rawTextTrimmed = fullText.trim()

  // 문항 번호(1. 2. 3. 또는 [01]) 기준으로 분할
  const problemMatches = fullText.split(/(?=\b(?:[0-9]{1,2}\.|[0-9]{1,2}\)|\([0-9]{1,2}\)|\[[0-9]{1,2}\]))/g)

  // 실제 전송량(제목+답안 스니펫) 대비 절감율을 정직하게 계산 (인위적 클램핑 없음)
  const fullBytes = new Blob([rawTextTrimmed]).size
  const sentBytes = new Blob([titleSnippet + answerSnippet]).size
  const estimatedTokenSavedPercent = fullBytes > 0
    ? Math.max(0, Math.min(99, Math.round((1 - sentBytes / fullBytes) * 100)))
    : 0

  return {
    rawText: rawTextTrimmed,
    titleSnippet,
    hasAnswerTable: answerSnippet.length > 0,
    answerSnippet,
    answerStructureType,
    boundaryConfident,
    problemSnippets: problemMatches.filter(p => p.trim().length > 10),
    totalPageCount: numPages,
    estimatedTokenSavedPercent,
  }
}
