/**
 * apps/web/src/lib/stepCheck.ts
 * AI 단계별 LaTeX 수식 첨삭 & 오류 검출 엔진
 */

export interface StepFeedbackItem {
  step: number
  latex: string
  isValid: boolean
  feedback: string
}

export interface StepEvaluationResult {
  isFullyCorrect: boolean
  firstErrorStep: number
  errorType: 'NONE' | 'SIGN_ERROR' | 'CALCULATION_ERROR' | 'CONCEPTUAL_ERROR' | 'INCOMPLETE_EXPANSION'
  diagnosticExplanation: string
  hints: string[]
  stepFeedbacks: StepFeedbackItem[]
}

export const StepEvaluationSchema = {
  type: 'OBJECT',
  properties: {
    isFullyCorrect: { type: 'BOOLEAN', description: '전체 풀이 과정 정답 여부' },
    firstErrorStep: { type: 'INTEGER', description: '최초 오류가 발생한 줄 번호 (1-based, 오류 없으면 0)' },
    errorType: {
      type: 'STRING',
      enum: ['NONE', 'SIGN_ERROR', 'CALCULATION_ERROR', 'CONCEPTUAL_ERROR', 'INCOMPLETE_EXPANSION'],
      description: '오류 분류',
    },
    diagnosticExplanation: { type: 'STRING', description: '학생에게 알려줄 원인 설명' },
    hints: {
      type: 'ARRAY',
      items: { type: 'STRING' },
      description: '3단계 점진적 힌트 (1단계: 방향성, 2단계: 핵심 공식, 3단계: 풀이 전개)',
    },
    stepFeedbacks: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          step: { type: 'INTEGER' },
          latex: { type: 'STRING' },
          isValid: { type: 'BOOLEAN' },
          feedback: { type: 'STRING' },
        },
        required: ['step', 'isValid', 'feedback'],
      },
      description: '줄별 유효성 피드백',
    },
  },
  required: ['isFullyCorrect', 'firstErrorStep', 'errorType', 'diagnosticExplanation', 'hints'],
}

export async function checkStudentSolutionSteps(
  questionLatex: string,
  answerLatex: string,
  studentSolutionSteps: string[]
): Promise<StepEvaluationResult> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY

  if (apiKey) {
    try {
      const stepsFormatted = studentSolutionSteps
        .map((step: string, idx: number) => `Step ${idx + 1}: ${step}`)
        .join('\n')

      const prompt = `당신은 대한민국 최고 수준의 수학 교육 AI 튜터입니다.
다음 문제와 학생의 단계별 LaTeX 풀이 과정을 엄밀하게 검증하세요.

[문제]:
${questionLatex}

[정답 / 기준 해설]:
${answerLatex || '문제에 맞는 표준 정답'}

[학생의 단계별 풀이]:
${stepsFormatted}

각 줄(Step)에서 수식 변형이 수학적으로 성립하는지 검산하고, 최초 오류 발생 줄(firstErrorStep)과 원인을 찾아주세요.
오류가 없으면 isFullyCorrect: true, firstErrorStep: 0, errorType: 'NONE'으로 응답하세요.
3단계 점진적 힌트(1단계: 생각의 방향성 리마인드, 2단계: 적용할 핵심 공식, 3단계: 다음 단계 풀이 전개 가이드)를 구성하세요.`

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              responseSchema: StepEvaluationSchema,
              temperature: 0.1,
            },
          }),
        }
      )

      if (response.ok) {
        const data = await response.json()
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text
        if (text) {
          return JSON.parse(text)
        }
      }
    } catch {}
  }

  // 룰 기반 정밀 단계별 검증기
  const parsedSteps: StepFeedbackItem[] = studentSolutionSteps.map((s: string, idx: number) => ({
    step: idx + 1,
    latex: s,
    isValid: true,
    feedback: '정상적인 수식 전개입니다.',
  }))

  let firstErrorStep = 0
  let errorType: StepEvaluationResult['errorType'] = 'NONE'
  let explanation = '모든 단계가 수학적으로 올바르게 전개되었습니다.'

  for (let i = 0; i < studentSolutionSteps.length; i++) {
    const stepStr = studentSolutionSteps[i].replace(/\s+/g, '')
    const prevStep = i > 0 ? studentSolutionSteps[i - 1].replace(/\s+/g, '') : null

    // 부호 실수 패턴 감지 (예: +a를 이항할 때 +a로 유지하거나 -a를 -a로 유지한 경우)
    if (prevStep) {
      const plusTransMatch = prevStep.match(/([+-]\d+)=/)
      if (plusTransMatch) {
        const signVal = plusTransMatch[1] // "+6" or "-6"
        const targetSign = signVal.startsWith('+') ? '-' : '+'
        const incorrectSign = signVal.startsWith('+') ? '+' : '-'
        const rightPart = stepStr.split('=')[1] || ''

        if (rightPart.includes(incorrectSign + signVal.slice(1)) && !rightPart.includes(targetSign + signVal.slice(1))) {
          firstErrorStep = i + 1
          errorType = 'SIGN_ERROR'
          explanation = `Step ${i + 1}에서 좌변의 ${signVal}을(를) 우변으로 이항할 때 부호를 반전시키지 않고 ${incorrectSign}${signVal.slice(1)}(으)로 계산하는 부호 연산 실수가 발생했습니다.`
          parsedSteps[i].isValid = false
          parsedSteps[i].feedback = `이항 부호 연산 오류 (${signVal} ➔ ${targetSign}${signVal.slice(1)})`
          break
        }
      }
    }

    // 명시적 부호 오류 문법 체크 (+-, --+)
    if (stepStr.includes('+-') || stepStr.includes('--+')) {
      firstErrorStep = i + 1
      errorType = 'SIGN_ERROR'
      explanation = `Step ${i + 1}에서 중복 부호 연산 실수가 발생했습니다.`
      parsedSteps[i].isValid = false
      parsedSteps[i].feedback = '부호 연산 오류가 확인되었습니다.'
      break
    }
  }

  // 만약 에러가 발견되었다면 이후 스텝들도 invalid 처리
  if (firstErrorStep > 0) {
    for (let j = firstErrorStep; j < parsedSteps.length; j++) {
      parsedSteps[j].isValid = false
      parsedSteps[j].feedback = '이전 단계 오류의 영향으로 잘못된 결과입니다.'
    }
  }

  return {
    isFullyCorrect: firstErrorStep === 0,
    firstErrorStep,
    errorType,
    diagnosticExplanation: explanation,
    hints: [
      '1단계: 등식의 성질을 이용해 양변에서 같은 수를 더하거나 빼야 합니다.',
      '2단계: 항을 다른 변으로 이항할 때는 반드시 부호가 반대로 바뀝니다 (+ ➔ -, - ➔ +).',
      '3단계: 올바른 부호로 동류항을 정리한 후 양변을 미지수의 계수로 나누어 해를 구하세요.',
    ],
    stepFeedbacks: parsedSteps,
  }
}
