import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const TwinProblemSchema = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    contentLatex: { type: 'STRING', description: '변형된 문제 본문 (LaTeX 수식 포함)' },
    options: {
      type: 'ARRAY',
      items: { type: 'STRING' },
      description: '5지선다 보기 (객관식인 경우)',
    },
    correctAnswer: { type: 'STRING', description: '정답 수식 또는 번호' },
    solutionLatex: { type: 'STRING', description: '단계별 모범 해설' },
    modifiedVariables: { type: 'STRING', description: '변경된 변수 및 계수 요약' },
  },
  required: ['title', 'contentLatex', 'correctAnswer', 'solutionLatex'],
}

export async function POST(req: Request) {
  try {
    const { originalQuestionLatex, conceptTitle, difficulty } = await req.json()

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY

    const prompt = `수학 교재 편찬 연구원으로서 다음 원본 문항의 '쌍둥이 변형 문항(Twin Problem)'을 제작하세요.

[개념 노드]: ${conceptTitle || '수학 핵심 개념'}
[목표 난이도 b]: ${difficulty || '0.0'}
[원본 문항]:
${originalQuestionLatex || '원본 문항'}

제작 조건:
1. 원본 문제와 풀이 논리 구조(알고리즘)는 100% 동일해야 합니다.
2. 수식의 계수(숫자)와 문제 상황을 자연스럽게 변형하세요.
3. 계산 결과는 깔끔한 유리수 또는 정수가 나오도록 설계하세요.
4. 모든 수식은 KaTeX 표준 문법($...$)을 준수하세요.`

    if (apiKey) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              responseSchema: TwinProblemSchema,
              temperature: 0.3,
            },
          }),
        }
      )

      if (response.ok) {
        const data = await response.json()
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text
        if (text) {
          return NextResponse.json(JSON.parse(text))
        }
      }
    }

    // Fallback: 오프라인 / 템플릿 기반 쌍둥이 변형 문제 생성
    return NextResponse.json({
      title: `${conceptTitle || '수학 핵심 개념'} [쌍둥이 변형 문항]`,
      contentLatex: `일차방정식 $4x - 6 = 14$의 해 $x$의 값을 구하시오.`,
      options: ['$3$', '$4$', '$5$', '$6$', '$7$'],
      correctAnswer: '$5$',
      solutionLatex: `$$4x - 6 = 14$$\n$$4x = 14 + 6$$\n$$4x = 20$$\n$$x = 5$$\n따라서 정답은 $5$입니다.`,
      modifiedVariables: '일차식 계수를 4로, 상수를 -6과 14로 치환하여 정수해 x=5가 도출되도록 변형',
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: '쌍둥이 변형 문제 생성 중 오류가 발생했습니다.', details: error?.message },
      { status: 500 }
    )
  }
}
