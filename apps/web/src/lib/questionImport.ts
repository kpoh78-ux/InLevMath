// apps/web/src/lib/questionImport.ts
//
// 반입된 문항을 교육과정 좌표에 앉히고 저장한다.
//
// 반입 앱은 문제집에 적힌 말만 보낸다 ("3. 이차함수 > 이차함수의 그래프 > 유형 07").
// 소단원 581개 · 유형 1,305개 · 개념노드 1,474개와 맞대는 일은 여기서 한다.
// 트리를 반입 앱에 복제하지 않는 이유는 계약 파일(packages/shared/questionImport.ts)에 적어 뒀다.
//
// 매칭에 실패해도 문항은 저장한다. raw* 컬럼에 원본 표기가 남으므로 나중에
// 사람이 화면에서 붙이거나, 트리가 보강된 뒤 다시 돌리면 된다.
// 못 찾았다고 버리면 검수까지 끝낸 문항이 사라진다.

import { prisma } from './db'
import type { MathGradeSubject } from '@prisma/client'
import {
  resolveDifficulty,
  normalizeSection,
  type ImportPayload,
  type ImportQuestion,
} from '@inlevmath/shared'

/** 이름만으로 소단원을 찾을 때의 하한. taxonomyMatcher 의 FUZZY 기준과 맞춘다 */
const MIN_SUBUNIT_SIMILARITY = 0.5
/** 유형은 소단원 안에서만 고르므로 후보가 적다 — 조금 더 느슨하게 본다 */
const MIN_PATTERN_SIMILARITY = 0.34
/** 개념노드는 1,474개 전체를 훑으므로 엄격하게 본다 */
const MIN_CONCEPT_SIMILARITY = 0.55

// ── 문자열 유사도 (taxonomyMatcher 와 같은 방식: 2-gram Dice) ────────────────

function normalizeText(s: string): string {
  return (s ?? '')
    .toLowerCase()
    // 앞머리 번호("3.", "(1)", "유형 07")와 기호를 걷어낸다 — 표기 차이일 뿐이다
    .replace(/[0-9０-９]+/g, '')
    .replace(/[\s.,·・\-–—()[\]{}<>「」『』"'"'!?~]/g, '')
}

function bigrams(s: string): Set<string> {
  const t = normalizeText(s)
  const out = new Set<string>()
  if (t.length === 1) out.add(t)
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2))
  return out
}

export function similarity(a: string, b: string): number {
  const A = bigrams(a)
  const B = bigrams(b)
  if (A.size === 0 || B.size === 0) return 0
  let overlap = 0
  for (const g of A) if (B.has(g)) overlap++
  return (2 * overlap) / (A.size + B.size)
}

// ── 학년 표기 → 후보 과목 ───────────────────────────────────────────────────

/** "중3", "중3-1", "고1" 같은 표기를 MathGradeSubject 후보로 옮긴다 */
export function candidateSubjects(grade?: string): MathGradeSubject[] {
  const text = (grade ?? '').trim()
  if (!text) return []

  const m = /^([초중고])\s*([1-6])(?:\s*[-–]\s*([12]))?/.exec(text)
  if (!m) return []
  const [, level, numRaw, semRaw] = m
  const num = Number(numRaw)
  const sems = semRaw ? [Number(semRaw)] : [1, 2]

  if (level === '초') return sems.map(s => `ELEM_${num}_${s}` as MathGradeSubject)
  if (level === '중') return sems.map(s => `MID_${num}_${s}` as MathGradeSubject)

  // 고등은 학년 숫자가 과목에 1:1 대응되지 않는다 (공통수학 / 대수 / 미적분 / 확통 / 기하).
  // 1학년은 공통수학, 2~3학년은 선택과목 전체를 후보로 둔다.
  if (num === 1) return ['HIGH_COMMON_1', 'HIGH_COMMON_2'] as MathGradeSubject[]
  return [
    'HIGH_ALGEBRA', 'HIGH_CALC_1', 'HIGH_CALC_2', 'HIGH_PROB_STAT', 'HIGH_GEOMETRY',
  ] as MathGradeSubject[]
}

// ── 좌표 매칭 ───────────────────────────────────────────────────────────────

export type Coordinates = {
  subUnitId: string | null
  patternTypeId: string | null
  conceptNodeId: string | null
  /** 어떻게 찾았는지 — 화면에서 "자동으로 붙은 것"을 구분해 보여 준다 */
  subUnitScore: number
  matched: boolean
}

/**
 * 소단원 후보를 한 번만 읽어 두고 여러 문항에 재사용한다.
 * 문항마다 581행을 다시 읽으면 500문항 반입에 왕복이 500번 생긴다.
 */
export type MatchContext = {
  subUnits: { id: string; name: string; middleName: string; majorName: string }[]
  concepts: { id: string; title: string; typeName: string }[]
  patternsBySubUnit: Map<string, { id: string; typeName: string }[]>
}

export async function buildMatchContext(grade?: string): Promise<MatchContext> {
  const subjects = candidateSubjects(grade)
  const where = subjects.length
    ? { middleUnit: { majorUnit: { subject: { in: subjects } } } }
    : {}

  const subUnits = await prisma.mathSubUnit.findMany({
    where,
    select: {
      id: true,
      name: true,
      middleUnit: { select: { name: true, majorUnit: { select: { name: true } } } },
    },
  })

  const subUnitIds = subUnits.map(s => s.id)
  const patterns = subUnitIds.length
    ? await prisma.mathPatternType.findMany({
        where: { subUnitId: { in: subUnitIds } },
        select: { id: true, typeName: true, subUnitId: true },
      })
    : []

  const patternsBySubUnit = new Map<string, { id: string; typeName: string }[]>()
  for (const p of patterns) {
    if (!patternsBySubUnit.has(p.subUnitId)) patternsBySubUnit.set(p.subUnitId, [])
    patternsBySubUnit.get(p.subUnitId)!.push({ id: p.id, typeName: p.typeName })
  }

  // 개념노드는 과목 표기 체계가 달라 학년으로 좁히지 않는다.
  // 1,474행이라 통째로 들고 있어도 부담이 없다.
  const concepts = await prisma.conceptNode.findMany({
    select: { id: true, title: true, typeName: true },
  })

  return { subUnits: subUnits.map(s => ({
    id: s.id,
    name: s.name,
    middleName: s.middleUnit.name,
    majorName: s.middleUnit.majorUnit.name,
  })), concepts, patternsBySubUnit }
}

/** 문제집 표기로 소단원·유형·개념노드를 찾는다 */
export function matchCoordinates(ctx: MatchContext, q: ImportQuestion): Coordinates {
  const none: Coordinates = {
    subUnitId: null, patternTypeId: null, conceptNodeId: null, subUnitScore: 0, matched: false,
  }

  const minor = q.unitPath?.minor ?? ''
  const middle = q.unitPath?.middle ?? ''
  const typeName = q.unitPath?.type ?? ''

  // 1. 소단원 — 소단원명이 주된 단서고, 중단원명이 같으면 가산한다.
  //    "이차함수의 그래프" 같은 이름은 학년을 넘어 여러 번 나오기 때문이다.
  let bestSub: { id: string; score: number } | null = null
  for (const s of ctx.subUnits) {
    let score = similarity(minor, s.name)
    if (middle) score += similarity(middle, s.middleName) * 0.25
    if (!bestSub || score > bestSub.score) bestSub = { id: s.id, score }
  }
  if (!bestSub || bestSub.score < MIN_SUBUNIT_SIMILARITY) {
    // 소단원을 못 찾으면 유형도 못 찾는다 (유형은 소단원 밑에 있다).
    // 개념노드는 독립이므로 계속 시도한다.
    return { ...none, conceptNodeId: matchConcept(ctx, minor, typeName) }
  }

  // 2. 유형 — 그 소단원 안에서만 고른다
  let patternTypeId: string | null = null
  if (typeName) {
    const patterns = ctx.patternsBySubUnit.get(bestSub.id) ?? []
    let bestPattern: { id: string; score: number } | null = null
    for (const p of patterns) {
      const score = similarity(typeName, p.typeName)
      if (!bestPattern || score > bestPattern.score) bestPattern = { id: p.id, score }
    }
    if (bestPattern && bestPattern.score >= MIN_PATTERN_SIMILARITY) patternTypeId = bestPattern.id
  }

  return {
    subUnitId: bestSub.id,
    patternTypeId,
    conceptNodeId: matchConcept(ctx, minor, typeName),
    subUnitScore: Number(bestSub.score.toFixed(3)),
    matched: true,
  }
}

function matchConcept(ctx: MatchContext, minor: string, typeName: string): string | null {
  const probe = `${minor} ${typeName}`.trim()
  if (!probe) return null

  let best: { id: string; score: number } | null = null
  for (const c of ctx.concepts) {
    const score = Math.max(similarity(probe, c.title), similarity(minor, c.typeName))
    if (!best || score > best.score) best = { id: c.id, score }
  }
  return best && best.score >= MIN_CONCEPT_SIMILARITY ? best.id : null
}

// ── 저장 ────────────────────────────────────────────────────────────────────

export type ImportOutcome = {
  received: number
  created: number
  updated: number
  /** 좌표가 하나라도 붙은 문항 수 */
  classified: number
  /** 난이도가 정해진 문항 수 */
  graded: number
  /** 소단원을 못 찾은 문항 — 화면에서 사람이 붙여야 한다 */
  unmatched: { ref: string; minor: string; reason: string }[]
  difficultyBasis: Record<string, number>
}

/**
 * 검증을 통과한 페이로드를 저장한다.
 *
 * 같은 (sourceType='external', ref) 로 다시 보내면 덮어쓴다 — 반입 앱에서
 * 검수를 고치고 다시 보내는 것이 정상 흐름이기 때문이다.
 *
 * 다만 **사람이 손으로 붙인 좌표는 덮어쓰지 않는다.** classifiedBy 가 'auto'가
 * 아니면 자동 매칭 결과를 무시한다 — 선생님이 고쳐 둔 것을 반입이 되돌리면
 * 같은 수정을 매번 다시 해야 한다.
 */
export async function importQuestions(payload: ImportPayload): Promise<ImportOutcome> {
  const ctx = await buildMatchContext(payload.source.grade)

  const outcome: ImportOutcome = {
    received: payload.questions.length,
    created: 0,
    updated: 0,
    classified: 0,
    graded: 0,
    unmatched: [],
    difficultyBasis: {},
  }

  const refs = payload.questions.map(q => q.ref)
  const existing = await prisma.question.findMany({
    where: { sourceType: 'external', sourceRef: { in: refs } },
    select: { id: true, sourceRef: true, classifiedBy: true },
  })
  const existingByRef = new Map(existing.map(e => [e.sourceRef!, e]))

  for (const q of payload.questions) {
    const coords = matchCoordinates(ctx, q)
    const { difficulty, basis } = resolveDifficulty({
      difficulty: q.difficulty,
      bookDifficulty: q.bookDifficulty,
      section: q.section,
    })
    outcome.difficultyBasis[basis] = (outcome.difficultyBasis[basis] ?? 0) + 1
    if (difficulty != null) outcome.graded++
    if (coords.matched || coords.conceptNodeId) outcome.classified++
    else {
      outcome.unmatched.push({
        ref: q.ref,
        minor: q.unitPath?.minor ?? '',
        reason: q.unitPath?.minor ? '비슷한 소단원을 찾지 못했습니다.' : '소단원 표기가 없습니다.',
      })
    }

    // 문항 내용 — 반입이 언제나 최신으로 갱신한다 (검수를 고쳐 다시 보내는 것이 정상 흐름)
    const content = {
      content: q.content ?? null,
      answer: q.answer,
      solution: q.solution ?? null,
      answerType: q.answerType ?? 'short',
      sourceBook: payload.source.book,
      sourcePage: q.page ?? null,
      sourceNumber: q.number ?? null,
      rawMajorUnit: q.unitPath?.major ?? '',
      rawMiddleUnit: q.unitPath?.middle ?? '',
      rawMinorUnit: q.unitPath?.minor ?? '',
      rawTypeName: q.unitPath?.type ?? '',
      // 표준 구획으로 옮겨 담는다. 못 알아본 표기는 원문 그대로 남겨 규칙을 보강할 단서로 쓴다
      rawSection: normalizeSection(q.section ?? '') ?? (q.section ?? ''),
    }

    // 분류 — 좌표와 난이도는 한 묶음이다. 난이도도 "이 문제가 얼마나 어려운가"라는
    // 분류이므로, 사람이 고쳐 뒀다면 좌표와 함께 지켜야 한다.
    const autoClassification = {
      subUnitId: coords.subUnitId,
      patternTypeId: coords.patternTypeId,
      conceptNodeId: coords.conceptNodeId,
      difficulty,
      classifiedAt: coords.matched || coords.conceptNodeId ? new Date() : null,
      classifiedBy: 'auto',
    }

    const prev = existingByRef.get(q.ref)
    if (!prev) {
      await prisma.question.create({
        data: { sourceType: 'external', sourceRef: q.ref, ...content, ...autoClassification },
      })
      outcome.created++
    } else {
      // 사람이 손댄 분류는 되돌리지 않는다. 반입이 매번 덮어쓰면 같은 수정을 계속 다시 해야 한다.
      const humanClassified = prev.classifiedBy != null && prev.classifiedBy !== 'auto'
      await prisma.question.update({
        where: { id: prev.id },
        data: humanClassified ? content : { ...content, ...autoClassification },
      })
      outcome.updated++
    }
  }

  return outcome
}
