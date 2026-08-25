/**
 * apps/web/src/lib/omniRouteAi.ts
 * 무료 티어 AI 멀티 프로바이더 라우터 & 토큰 최적화 디스패처
 */
import { GoogleGenAI, Type, Schema } from '@google/genai';
import axios from 'axios';

export interface WorksheetAnalysisResult {
  worksheetTitle: string;
  gradeSubject: string; // 예: "MID_3_1" (중3-1)
  majorUnit: string;    // 예: "Ⅰ. 실수와 그 연산"
  middleUnit: string;   // 예: "1. 제곱근과 실수"
  subUnit: string;      // 예: "(1) 제곱근의 뜻과 성질"
  mainPatternType: string; // 예: "[유형02] 제곱근의 성질을 이용한 식의 계산"
  answers: {
    questionNumber: number;
    answer: string;
    score?: number;
    patternType?: string;
  }[];
  providerUsed: 'GEMINI_2_5_FLASH_FREE' | 'GROQ_LLAMA3_FREE' | 'FALLBACK_LOCAL';
  /** true면 자동 분석 신뢰도가 낮아 결과를 반드시 사람이 확인해야 함 */
  lowConfidence: boolean;
}

const WorksheetParseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    worksheetTitle: { type: Type.STRING },
    gradeSubject: { type: Type.STRING },
    majorUnit: { type: Type.STRING },
    middleUnit: { type: Type.STRING },
    subUnit: { type: Type.STRING },
    mainPatternType: { type: Type.STRING },
    answers: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          questionNumber: { type: Type.INTEGER },
          answer: { type: Type.STRING },
          score: { type: Type.INTEGER },
          patternType: { type: Type.STRING }
        },
        required: ['questionNumber', 'answer']
      }
    }
  },
  required: ['worksheetTitle', 'majorUnit', 'middleUnit', 'subUnit', 'answers']
};

export async function parseWorksheetWithOmniRoute(
  fileName: string,
  titleSnippet: string,
  answerSnippet: string,
  opts?: { boundaryConfident?: boolean }
): Promise<WorksheetAnalysisResult> {
  const boundaryConfident = opts?.boundaryConfident ?? true;
  const boundaryNote = boundaryConfident
    ? ''
    : '\n[주의] 정답 구간의 시작 위치를 키워드로 확신하지 못해 페이지 위치 추정으로 잘라낸 텍스트입니다. 아래 텍스트가 실제 정답표/해설이 아닐 수 있으니 신중히 판단하고, 확신이 서지 않으면 answers를 비워두세요.';

  const prompt = `당신은 대한민국 K-수학 전문 교육과정 분석 AI입니다.
학습지의 [표지/문제 앞부분 텍스트]와 [정답 구간 텍스트]를 각각 참고하여 4계층 단원 분류와 문항별 정답을 JSON으로 추출하세요.

[파일명]: ${fileName}

[표지/문제 앞부분 텍스트 — 대/중/소단원명과 학습지 제목은 보통 여기 적혀 있습니다]:
${titleSnippet || '(추출되지 않음)'}

[정답 구간 텍스트 — 문항별 정답은 여기서 추출하세요]:
${answerSnippet || '(추출되지 않음)'}${boundaryNote}

추출 규칙:
1. 대단원, 중단원, 소단원, 대표 문제유형은 [표지/문제 앞부분 텍스트]에 실제로 적힌 내용을 근거로 한국 수학 교육과정 표준 명칭으로 지정하세요. 추측으로 지어내지 마세요.
2. 문항 번호와 정답은 [정답 구간 텍스트]를 근거로 배열로 완벽히 추출하세요 (보기 1~5번, 분수, 식 등).
3. 배점이 없는 경우 기본 4점으로 설정하세요.`;

  // 1차 시도: Google Gemini 2.5 Flash (무료 티어 활용)
  try {
    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
    if (geminiKey) {
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: WorksheetParseSchema,
          temperature: 0.1
        }
      });

      const parsed = JSON.parse(response.text || '{}');
      return {
        ...parsed,
        providerUsed: 'GEMINI_2_5_FLASH_FREE',
        lowConfidence: !boundaryConfident,
      };
    }
  } catch (geminiError) {
    console.warn('Gemini 무료 쿼터 초과 또는 오류, Groq Llama-3 무료 엔드포인트로 자동 폴백합니다.', geminiError);
  }

  // 2차 시도: Groq Llama-3 70B (초고속 무료 티어 엔드포인트)
  try {
    if (process.env.GROQ_API_KEY) {
      const groqRes = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: 'openai/gpt-oss-120b',
          messages: [
            { role: 'system', content: 'You are a math parser that outputs ONLY valid JSON matching the schema.' },
            { role: 'user', content: prompt }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.1
        },
        {
          headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` }
        }
      );

      const parsed = JSON.parse(groqRes.data.choices[0]?.message?.content || '{}');
      return {
        ...parsed,
        providerUsed: 'GROQ_LLAMA3_FREE',
        lowConfidence: !boundaryConfident,
      };
    }
  } catch (groqError) {
    console.warn('Groq 무료 API 폴백 실패, 정규식 기반 로컬 파서로 최종 대체합니다.', groqError);
  }

  // 3차 시도: 순수 정규식 로컬 Fallback (API 키 미설정/실패 시의 최종 안전장치)
  // 주의: 어떤 AI도 호출되지 않았으므로 단원/유형은 알 수 없다고 명시하고, 사람이 반드시 확인해야 한다.
  return fallbackRegexParser(fileName, titleSnippet, answerSnippet);
}

function fallbackRegexParser(fileName: string, titleSnippet: string, answerSnippet: string): WorksheetAnalysisResult {
  // 정답 구간 텍스트에서만 매칭 (원문 전체를 훑지 않음)
  const sourceText = answerSnippet || titleSnippet;

  // 1순위: 엄격한 객관식(①~⑤) 패턴 — 오탐 가능성이 사실상 없음
  const strictMcRegex = /\b([0-9]{1,2})\s*[.)\]]\s*([①②③④⑤])(?=\s|$)/g;
  const mcAnswers: { questionNumber: number; answer: string; score: number }[] = [];
  let mcMatch;
  while ((mcMatch = strictMcRegex.exec(sourceText)) !== null && mcAnswers.length < 50) {
    mcAnswers.push({ questionNumber: parseInt(mcMatch[1], 10), answer: mcMatch[2], score: 4 });
  }

  // 객관식만으로 충분히 추출됐으면(문항 5개 이상) 그대로 사용 — 가장 신뢰도 높은 결과
  let answers = mcAnswers;

  if (mcAnswers.length < 5) {
    // 2순위: 단답형까지 포함한 넓은 패턴. 문서 식별코드 등 긴 노이즈 토큰을 배제하기 위해
    // 답안 토큰 길이를 6자로 제한 (일반적인 분수/식 표현은 이 범위를 넘지 않음)
    const looseRegex = /\b([0-9]{1,2})\s*[.)\]]\s*([①-⑤]|[\-+0-9a-zA-Z/]{1,6})(?=\s|$)/g;
    const looseAnswers: { questionNumber: number; answer: string; score: number }[] = [];
    let looseMatch;
    while ((looseMatch = looseRegex.exec(sourceText)) !== null && looseAnswers.length < 50) {
      looseAnswers.push({ questionNumber: parseInt(looseMatch[1], 10), answer: looseMatch[2], score: 4 });
    }
    if (looseAnswers.length > answers.length) answers = looseAnswers;
  }

  return {
    worksheetTitle: fileName.replace(/\.pdf$/i, ''),
    gradeSubject: '',
    // AI 미호출 상태에서는 단원/유형을 추측하지 않는다 — 하드코딩된 가짜 값 대신 명시적으로 미분류 표시
    majorUnit: '',
    middleUnit: '',
    subUnit: '',
    mainPatternType: '',
    answers,
    providerUsed: 'FALLBACK_LOCAL',
    lowConfidence: true,
  };
}
