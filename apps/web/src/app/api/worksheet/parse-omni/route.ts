// apps/web/src/app/api/worksheet/parse-omni/route.ts
import { NextResponse } from 'next/server';
import { extractLightweightPdfText } from '@/lib/pdfTextExtractor';
import { parseWorksheetWithOmniRoute } from '@/lib/omniRouteAi';
import { matchTaxonomyFromFileName } from '@/lib/taxonomyMatcher';
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

    // 2. 파일명 ↔ 시드된 K-수학 택소노미 DB 직접 대조 (AI 호출 없이 결정적으로 대/중/소단원 확정)
    let taxonomyMatch = null;
    try {
      taxonomyMatch = await matchTaxonomyFromFileName(fileName);
    } catch (taxonomyError) {
      console.warn('택소노미 파일명 매칭 실패, AI 분석 결과로 대체합니다.', taxonomyError);
    }

    // 3. 무료 티어 AI 로드밸런서로 라우팅 (비용 0원 최적화)
    const analysis = await parseWorksheetWithOmniRoute(fileName, titleSnippet, answerSnippet, { boundaryConfident });

    // 택소노미 DB 매칭에 성공했다면 AI 추측보다 우선 — 파일명 번호/이름이 DB와 직접 대조된 결정값이므로
    const majorUnit = taxonomyMatch?.majorUnitName || analysis.majorUnit;
    const middleUnit = taxonomyMatch?.middleUnitName || analysis.middleUnit;
    const minorUnit = taxonomyMatch?.subUnitName || analysis.subUnit;

    return NextResponse.json({
      success: true,
      fileName,
      totalPages: totalPageCount,
      analysis,
      data: {
        title: analysis.worksheetTitle,
        gradeSubject: analysis.gradeSubject,
        majorUnit,
        middleUnit,
        minorUnit,
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
        matchedTaxonomy: taxonomyMatch ? {
          subUnitId: taxonomyMatch.subUnitId,
          subUnitName: taxonomyMatch.subUnitName,
          middleUnitName: taxonomyMatch.middleUnitName,
          majorUnitName: taxonomyMatch.majorUnitName,
        } : null,
      }
    });
  } catch (error: any) {
    console.error('Omni-Route 학습지 분석 실패:', error);
    return NextResponse.json({ error: '학습지 자동 분석 실패', details: error.message }, { status: 500 });
  }
}
