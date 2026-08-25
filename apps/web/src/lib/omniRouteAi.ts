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
  extractedText: string,
  answerSnippet?: string
): Promise<WorksheetAnalysisResult> {
  const prompt = `당신은 대한민국 K-수학 전문 교육과정 분석 AI입니다.
업로드된 학습지 파일명과 본문/정답 텍스트를 분석하여 4계층 단원 분류와 문항별 정답을 JSON으로 추출하세요.

[파일명]: ${fileName}
[정답/본문 텍스트 요약]:
${answerSnippet || extractedText.slice(0, 3000)}

추출 규칙:
1. 대단원, 중단원, 소단원, 대표 문제유형을 한국 수학 교육과정 표준 명칭으로 지정하세요.
2. 문항 번호와 정답을 배열로 완벽히 추출하세요 (보기 1~5번, 분수, 식 등).
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
        providerUsed: 'GEMINI_2_5_FLASH_FREE'
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
          model: 'llama-3.3-70b-versatile',
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
        providerUsed: 'GROQ_LLAMA3_FREE'
      };
    }
  } catch (groqError) {
    console.warn('Groq 무료 API 폴백 실패, 정규식 기반 로컬 파서로 최종 대체합니다.', groqError);
  }

  // 3차 시도: 순수 정규식 로컬 Fallback (API 비용 0원, 완벽한 오프라인 안전장치)
  return fallbackRegexParser(fileName, extractedText);
}

function fallbackRegexParser(fileName: string, text: string): WorksheetAnalysisResult {
  const answers: { questionNumber: number; answer: string; score: number }[] = [];
  // 예: "1. ③ 2. ④" 또는 "1) 3 2) 5" 형태의 정답 정규식 매칭
  const regex = /(?:([0-9]{1,2})[\.\)\]\s]\s*([①-⑤1-5]|[\-\+0-9a-zA-Z\/]+))/g;
  let match;
  let idx = 1;

  while ((match = regex.exec(text)) !== null && idx <= 30) {
    answers.push({
      questionNumber: parseInt(match[1], 10) || idx,
      answer: match[2],
      score: 4
    });
    idx++;
  }

  return {
    worksheetTitle: fileName.replace(/\.pdf$/i, ''),
    gradeSubject: 'MID_3_1',
    majorUnit: 'Ⅰ. 실수와 그 연산',
    middleUnit: '1. 제곱근과 실수',
    subUnit: '(1) 제곱근의 뜻과 성질',
    mainPatternType: '[유형01] 기본 연산 및 개념',
    answers: answers.length > 0 ? answers : [{ questionNumber: 1, answer: '1', score: 4 }],
    providerUsed: 'FALLBACK_LOCAL'
  };
}
