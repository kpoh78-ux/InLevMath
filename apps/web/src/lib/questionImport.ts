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
  applyVariantDifficulty,
  type Difficulty,
  type ImportPayload,
  type ImportQuestion,
  type VariantKind,
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

export type ConceptMatch = {
  /** 반입 앱이 보낸 이름 */
  given: string
  /** 붙은 개념노드 제목. 못 찾았으면 null */
  matchedTitle: string | null
  id: string | null
  score: number
}

/**
 * 복합 유형이 함께 쓰는 개념 이름들을 개념노드로 옮긴다.
 *
 * 유사도 매칭이라 "이차방정식의 근과 계수의 관계"가 "세 근의 합·곱 이용"에
 * 붙는 식으로 비슷하지만 다른 개념에 걸릴 수 있다. 조용히 넘기면 잘못된 분류가
 * 쌓이므로 **무엇이 무엇으로 붙었는지 그대로 돌려준다.** 화면과 반입 결과에서
 * 확인하고 선생님이 고칠 수 있어야 한다.
 */
export function matchExtraConcepts(
  ctx: MatchContext,
  names: string[] | undefined
): ConceptMatch[] {
  if (!names?.length) return []
  const out: ConceptMatch[] = []
  const seen = new Set<string>()

  for (const name of names) {
    const probe = String(name ?? '').trim()
    if (!probe) continue

    let best: { id: string; title: string; score: number } | null = null
    for (const c of ctx.concepts) {
      const score = Math.max(similarity(probe, c.title), similarity(probe, c.typeName))
      if (!best || score > best.score) best = { id: c.id, title: c.title, score }
    }

    if (best && best.score >= MIN_CONCEPT_SIMILARITY) {
      if (seen.has(best.id)) continue
      seen.add(best.id)
      out.push({ given: probe, matchedTitle: best.title, id: best.id, score: Number(best.score.toFixed(3)) })
    } else {
      out.push({ given: probe, matchedTitle: null, id: null, score: Number((best?.score ?? 0).toFixed(3)) })
    }
  }
  return out
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
  /** 변형 종류별 개수 */
  variants: Record<string, number>
  /** 원본 ref 를 찾지 못해 연결하지 못한 변형 — 원본을 먼저 반입해야 한다 */
  danglingVariants: { ref: string; variantOf: string }[]
  /** 선생님이 고쳐 둬서 내용을 갱신하지 않은 문항 */
  skippedEdited: string[]
  /**
   * 복합 유형의 개념 매칭 결과 — 유사도 매칭이라 비슷하지만 다른 개념에
   * 걸릴 수 있다. 무엇이 무엇으로 붙었는지 그대로 돌려주어 확인하게 한다.
   */
  conceptMatches: { ref: string; matches: ConceptMatch[] }[]
}

/**
 * 검증을 통과한 페이로드를 저장한다.
 *
 * 같은 (sourceType='external', ref) 로 다시 보내면 덮어쓴다 — 반입 앱에서
 * 검수를 고치고 다시 보내는 것이 정상 흐름이기 때문이다.
 *
 * 사람이 손댄 것은 되돌리지 않는다. 두 가지를 따로 본다.
 *   classifiedBy ≠ 'auto'  선생님이 좌표·난이도를 고쳤다 → 분류를 유지
 *   editedAt 있음          선생님이 본문·답·풀이를 고쳤다 → 내용을 유지
 * 반입이 매번 덮어쓰면 같은 수정을 계속 다시 해야 한다.
 *
 * 변형(숫자·표현·복합)은 원본이 먼저 있어야 연결되므로 두 번에 나눠 처리한다.
 * 원본과 변형이 같은 페이로드에 섞여 와도 순서와 무관하게 붙는다.
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
    variants: {},
    danglingVariants: [],
    skippedEdited: [],
    conceptMatches: [],
  }

  const refs = payload.questions.map(q => q.ref)
  const existing = await prisma.question.findMany({
    where: { sourceType: 'external', sourceRef: { in: refs } },
    select: { id: true, sourceRef: true, classifiedBy: true, editedAt: true },
  })
  const existingByRef = new Map(existing.map(e => [e.sourceRef!, e]))

  // ref → 저장된 문항 id. 2차 통과에서 변형을 원본에 붙일 때 쓴다
  const idByRef = new Map<string, string>()
  // 2차 통과로 미룬 것들 — 원본 난이도를 물려받아야 해서 원본 저장 후에 정한다
  const pending: { q: ImportQuestion; id: string; kind: VariantKind; own: Difficulty | null }[] = []

  // ── 1차: 내용·좌표 저장 ────────────────────────────────────────────────────
  for (const q of payload.questions) {
    const coords = matchCoordinates(ctx, q)
    const { difficulty, basis } = resolveDifficulty({
      difficulty: q.difficulty,
      bookDifficulty: q.bookDifficulty,
      section: q.section,
    })
    const kind: VariantKind = q.variantKind ?? 'ORIGINAL'

    outcome.difficultyBasis[basis] = (outcome.difficultyBasis[basis] ?? 0) + 1
    outcome.variants[kind] = (outcome.variants[kind] ?? 0) + 1
    if (coords.matched || coords.conceptNodeId) outcome.classified++
    else {
      outcome.unmatched.push({
        ref: q.ref,
        minor: q.unitPath?.minor ?? '',
        reason: q.unitPath?.minor ? '비슷한 소단원을 찾지 못했습니다.' : '소단원 표기가 없습니다.',
      })
    }

    // 문항 내용 — 반입이 최신으로 갱신한다 (검수를 고쳐 다시 보내는 것이 정상 흐름)
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

    // 분류 — 좌표와 난이도는 한 묶음이다. 난이도도 "얼마나 어려운가"라는 분류다.
    const autoClassification = {
      subUnitId: coords.subUnitId,
      patternTypeId: coords.patternTypeId,
      conceptNodeId: coords.conceptNodeId,
      difficulty,
      variantKind: kind,
      classifiedAt: coords.matched || coords.conceptNodeId ? new Date() : null,
      classifiedBy: 'auto',
    }

    const prev = existingByRef.get(q.ref)
    let id: string
    if (!prev) {
      const created = await prisma.question.create({
        data: { sourceType: 'external', sourceRef: q.ref, ...content, ...autoClassification },
        select: { id: true },
      })
      id = created.id
      outcome.created++
    } else {
      const humanClassified = prev.classifiedBy != null && prev.classifiedBy !== 'auto'
      const humanEdited = prev.editedAt != null
      if (humanEdited) outcome.skippedEdited.push(q.ref)

      await prisma.question.update({
        where: { id: prev.id },
        data: {
          ...(humanEdited ? {} : content),
          ...(humanClassified ? {} : autoClassification),
        },
      })
      id = prev.id
      outcome.updated++
    }

    idByRef.set(q.ref, id)
    if (kind !== 'ORIGINAL' || q.extraConcepts?.length) {
      pending.push({ q, id, kind, own: difficulty })
    }
  }

  // ── 2차: 원본 연결 · 복합 개념 · 변형 난이도 ───────────────────────────────
  //
  // 원본이 이번 페이로드에 없으면 이미 DB 에 있는지 찾는다. 그것도 없으면
  // 연결하지 못한 채로 남긴다 — 문항 자체는 이미 저장돼 있으므로 잃지 않는다.
  const needOrigin = pending.filter(p => p.q.variantOf && !idByRef.has(p.q.variantOf))
  if (needOrigin.length) {
    const found = await prisma.question.findMany({
      where: { sourceType: 'external', sourceRef: { in: needOrigin.map(p => p.q.variantOf!) } },
      select: { id: true, sourceRef: true },
    })
    found.forEach(f => idByRef.set(f.sourceRef!, f.id))
  }

  for (const { q, id, kind, own } of pending) {
    let originId: string | null = null
    if (q.variantOf) {
      originId = idByRef.get(q.variantOf) ?? null
      if (!originId) outcome.danglingVariants.push({ ref: q.ref, variantOf: q.variantOf })
    }

    // 숫자·표현 변형은 원본 난이도를 물려받고, 복합 유형은 하한(4)을 적용한다
    const originDifficulty = originId
      ? (await prisma.question.findUnique({
          where: { id: originId }, select: { difficulty: true },
        }))?.difficulty ?? null
      : null
    const finalDifficulty = applyVariantDifficulty(
      own,
      kind,
      (originDifficulty as Difficulty | null) ?? null
    )

    // 사람이 고쳐 둔 분류는 여기서도 건드리지 않는다
    const prev = existingByRef.get(q.ref)
    const humanClassified = prev?.classifiedBy != null && prev.classifiedBy !== 'auto'

    await prisma.question.update({
      where: { id },
      data: {
        originId,
        ...(humanClassified ? {} : { difficulty: finalDifficulty }),
      },
    })

    // 복합 유형이 함께 쓰는 개념들. 주 개념도 primary 로 같이 담아 둔다 —
    // "개념 A와 B가 함께 나오는 문제"를 한 표에서 찾을 수 있어야 한다.
    const extra = matchExtraConcepts(ctx, q.extraConcepts)
    if (extra.length) outcome.conceptMatches.push({ ref: q.ref, matches: extra })
    const extraIds = extra.map(m => m.id).filter((v): v is string => v != null)

    const primary = (await prisma.question.findUnique({
      where: { id }, select: { conceptNodeId: true },
    }))?.conceptNodeId ?? null

    if (extraIds.length || primary) {
      await prisma.questionConcept.deleteMany({ where: { questionId: id } })
      const rows = [
        ...(primary ? [{ questionId: id, conceptNodeId: primary, role: 'primary' }] : []),
        ...extraIds
          .filter(cid => cid !== primary)
          .map(cid => ({ questionId: id, conceptNodeId: cid, role: 'secondary' })),
      ]
      if (rows.length) await prisma.questionConcept.createMany({ data: rows, skipDuplicates: true })
    }
  }

  return outcome
}
