// apps/web/src/app/api/worksheet/parse-omni/route.ts
import { NextResponse } from 'next/server';
import { extractLightweightPdfText } from '@/lib/pdfTextExtractor';
import { parseWorksheetWithOmniRoute } from '@/lib/omniRouteAi';
import { getCurrentUser } from '@/lib/auth';

export async function POST(req: Request) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const contentType = req.headers.get('content-type') || '';
    let fileName = '학습지.pdf';
    let titleSnippet = '';
    let answerSnippet = '';
    let boundaryConfident = true;
    let totalPageCount = 1;

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;

      if (!file) {
        return NextResponse.json({ error: 'PDF 학습지 파일이 필요합니다.' }, { status: 400 });
      }

      fileName = file.name;
      const arrayBuffer = await file.arrayBuffer();

      // 1. 토큰 절약을 위한 텍스트 & 정답표 고속 추출 (Vision 불필요)
      const extracted = await extractLightweightPdfText(arrayBuffer);
      titleSnippet = extracted.titleSnippet;
      answerSnippet = extracted.answerSnippet || '';
      boundaryConfident = extracted.boundaryConfident;
      totalPageCount = extracted.totalPageCount;
    } else {
      const body = await req.json();
      fileName = body.fileName || '학습지.pdf';
      titleSnippet = body.titleSnippet || '';
      answerSnippet = body.answerSnippet || '';
      boundaryConfident = body.boundaryConfident ?? true;
    }

    // 2. 무료 티어 AI 로드밸런서로 라우팅 (비용 0원 최적화)
    const analysis = await parseWorksheetWithOmniRoute(fileName, titleSnippet, answerSnippet, { boundaryConfident });

    return NextResponse.json({
      success: true,
      fileName,
      totalPages: totalPageCount,
      analysis,
      data: {
        title: analysis.worksheetTitle,
        gradeSubject: analysis.gradeSubject,
        majorUnit: analysis.majorUnit,
        middleUnit: analysis.middleUnit,
        minorUnit: analysis.subUnit,
        section: analysis.mainPatternType,
        problemCount: analysis.answers?.length || 0,
        answers: (analysis.answers || []).map(a => ({
          no: a.questionNumber,
          answer: String(a.answer || '').trim(),
          score: a.score ?? 4,
          section: a.patternType || analysis.mainPatternType,
          confident: !analysis.lowConfidence,
        })),
        aiProviderUsed: analysis.providerUsed,
        lowConfidence: analysis.lowConfidence,
      }
    });
  } catch (error: any) {
    console.error('Omni-Route 학습지 분석 실패:', error);
    return NextResponse.json({ error: '학습지 자동 분석 실패', details: error.message }, { status: 500 });
  }
}
