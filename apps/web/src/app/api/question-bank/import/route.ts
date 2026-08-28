import { NextRequest, NextResponse } from 'next/server'
import { getTeacherAuth } from '@/lib/teacherAuth'
import { importQuestions } from '@/lib/questionImport'
import {
  validateImportPayload,
  QUESTION_IMPORT_FORMAT,
  QUESTION_IMPORT_VERSION,
  QUESTION_IMPORT_MAX_ITEMS,
  SECTION_DIFFICULTY,
  VARIANT_KINDS,
  VARIANT_HINT,
  COMPOSITE_MIN_DIFFICULTY,
} from '@inlevmath/shared'

// POST /api/question-bank/import — 문제집 반입 앱이 검수를 마친 문항을 넘긴다.
//
// 이 엔드포인트가 두 앱 사이의 유일한 접점이다. 반입 앱은 자기 DB 를 쓰고,
// 이 DB 스키마에 직접 붙지 않는다 (계약: packages/shared/src/questionImport.ts).
//
// 인증은 선생님 로그인 토큰을 그대로 쓴다. 반입 앱은 전용 계정으로 로그인해
// 받은 토큰을 Authorization 헤더에 실어 보낸다.

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const me = await getTeacherAuth(req)
  if (!me) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const check = validateImportPayload(body)
  if (!check.ok || !check.payload) {
    // 어느 문항이 왜 걸렸는지 그대로 돌려준다 — 반입 앱이 고쳐 다시 보내야 한다
    return NextResponse.json(
      { error: '반입 형식이 올바르지 않습니다.', errors: check.errors },
      { status: 400 }
    )
  }

  try {
    const outcome = await importQuestions(check.payload)
    return NextResponse.json({
      ok: true,
      book: check.payload.source.book,
      ...outcome,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : '반입 처리 실패'
    console.error('[question-bank/import]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// GET /api/question-bank/import — 계약 확인용.
// 반입 앱을 만드는 쪽이 형식·한도·난이도 규칙을 코드에서 바로 읽을 수 있게 한다.
export async function GET(req: NextRequest) {
  const me = await getTeacherAuth(req)
  if (!me) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  return NextResponse.json({
    format: QUESTION_IMPORT_FORMAT,
    version: QUESTION_IMPORT_VERSION,
    maxItemsPerRequest: QUESTION_IMPORT_MAX_ITEMS,
    // 난이도 표시가 없을 때 구획으로 추론하는 표
    sectionDifficulty: SECTION_DIFFICULTY,
    difficultyPriority: ['difficulty(1~5)', 'bookDifficulty(★·상중하·A~E)', 'section', '없음(null)'],
    // 문제 확장 — 원본 하나에서 뻗어 나가는 갈래
    variantKinds: VARIANT_KINDS,
    variantHint: VARIANT_HINT,
    variantRules: {
      NUMERIC: '난이도 단서가 없으면 원본 난이도를 물려받는다',
      REPHRASED: '난이도 단서가 없으면 원본 난이도를 물려받는다',
      COMPOSITE: `난이도 하한 ${COMPOSITE_MIN_DIFFICULTY} — 개념을 엮은 문제가 그보다 쉬울 수 없다`,
      원본순서: '원본과 변형을 같은 페이로드에 섞어 보내도 된다. 순서와 무관하게 연결된다',
    },
    example: {
      format: QUESTION_IMPORT_FORMAT,
      version: QUESTION_IMPORT_VERSION,
      source: { book: '쎈 중3-1', publisher: '좋은책신사고', grade: '중3-1', importedBy: 'importer v0.1' },
      questions: [
        {
          ref: 'ssen-m3-1-p042-07',
          page: 42,
          number: 7,
          content: '이차함수 y = x² - 4x + 1 의 최솟값을 구하시오.',
          answer: '-3',
          solution: 'y = (x-2)² - 3 이므로 x=2 일 때 최솟값 -3',
          answerType: 'short',
          bookDifficulty: '★★★',
          section: '유형 07 최대·최소',
          unitPath: {
            major: '3. 이차함수',
            middle: '이차함수의 그래프',
            minor: '이차함수 y=ax²+bx+c의 그래프',
            type: '유형 07 최대·최소',
          },
        },
        {
          ref: 'ssen-m3-1-p042-07-num1',
          variantOf: 'ssen-m3-1-p042-07',
          variantKind: 'NUMERIC',
          content: '이차함수 y = x² - 6x + 2 의 최솟값을 구하시오.',
          answer: '-7',
          solution: 'y = (x-3)² - 7 이므로 x=3 일 때 최솟값 -7',
          answerType: 'short',
        },
        {
          ref: 'ssen-m3-1-p042-07-comp1',
          variantOf: 'ssen-m3-1-p042-07',
          variantKind: 'COMPOSITE',
          content: '이차함수 y = x² - 4x + 1 의 최솟값이 이차방정식 x² + ax + 3 = 0 의 한 근일 때 a 의 값은?',
          answer: '4',
          answerType: 'short',
          extraConcepts: ['이차방정식의 근과 계수의 관계'],
        },
      ],
    },
  })
}
