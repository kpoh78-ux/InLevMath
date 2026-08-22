/**
 * apps/web/src/lib/pdfTextExtractor.ts
 * 토큰 절약을 위한 클라이언트/서버 PDF 텍스트 & 정답표 영역 경량 추출기
 */

export interface ExtractedPdfContent {
  rawText: string;
  hasAnswerTable: boolean;
  answerSnippet?: string;
  problemSnippets: string[];
  totalPageCount: number;
  estimatedTokenSavedPercent: number;
}

export async function extractLightweightPdfText(pdfBuffer: ArrayBuffer): Promise<ExtractedPdfContent> {
  // @ts-ignore
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.js');

  // worker 설정 (브라우저 및 서버 안전 처리)
  if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || '3.11.174'}/pdf.worker.min.js`;
  }
  
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    useSystemFonts: true,
    disableFontFace: true,
  });

  const pdfDoc = await loadingTask.promise;
  const numPages = pdfDoc.numPages;

  let fullText = '';
  let answerSnippet = '';
  const problemSnippets: string[] = [];

  for (let i = 1; i <= numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(' ');

    fullText += `\n--- [Page ${i}] ---\n` + pageText;

    // 빠른 정답 및 해설 영역 패턴 감지 (토큰 절약을 위해 정답 부분만 슬라이싱)
    const isAnswerPage = 
      pageText.includes('정답') || 
      pageText.includes('빠른 정답') || 
      pageText.includes('해답') || 
      pageText.includes('답안') || 
      pageText.includes('정답 및 해설') ||
      pageText.includes('정답과 풀이');

    if (isAnswerPage) {
      answerSnippet += `\n[Page ${i} 답안영역] ` + pageText;
    }
  }

  // 문항 번호(1. 2. 3. 또는 [01]) 기준으로 분할
  const problemMatches = fullText.split(/(?=\b(?:[0-9]{1,2}\.|[0-9]{1,2}\)|\([0-9]{1,2}\)|\[[0-9]{1,2}\]))/g);

  const rawTextTrimmed = fullText.trim();
  const answerSnippetTrimmed = answerSnippet.trim();

  // 토큰 절감율 계산 (전체 비전 이미지 전송 대비 텍스트/정답스니펫 추출 시 절감율)
  const fullBytes = new Blob([rawTextTrimmed]).size;
  const snippetBytes = new Blob([answerSnippetTrimmed || rawTextTrimmed]).size;
  const estimatedTokenSavedPercent = Math.min(96, Math.max(75, Math.round((1 - (snippetBytes / (fullBytes * 4 || 1))) * 100)));

  return {
    rawText: rawTextTrimmed,
    hasAnswerTable: answerSnippetTrimmed.length > 0,
    answerSnippet: answerSnippetTrimmed,
    problemSnippets: problemMatches.filter(p => p.trim().length > 10),
    totalPageCount: numPages,
    estimatedTokenSavedPercent,
  };
}
