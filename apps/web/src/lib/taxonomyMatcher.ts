/**
 * apps/web/src/lib/taxonomyMatcher.ts
 * 학습지 파일명(예: "[기본] 4-1-1.이차함수 y=ax²의 그래프(05) 중3 수학 [25문제] [Q].pdf")을
 * AI 호출 없이 시드된 K-수학 4계층 택소노미(MathMajorUnit/MathMiddleUnit/MathSubUnit) DB와
 * 직접 대조하여 대/중/소단원을 결정적으로 채운다.
 *
 * 근거: 이 벤더의 파일명 번호 체계(대-중-소)가 시드 데이터의 orderIndex 경로와 정확히 일치하고,
 * 소단원명 텍스트도 표기만 미세하게 다를 뿐(예: "제곱근의 뜻과 성질" vs DB "제곱근의 뜻과 표현")
 * 거의 동일하다 — 실제 두 예시 파일로 검증됨.
 */
import { prisma } from '@/lib/prisma';
import type { MathGradeSubject } from '@prisma/client';

export interface FilenameParseResult {
  subUnitNameRaw: string;
  majorIdx: number | null;
  middleIdx: number | null;
  subIdx: number | null;
  gradeLevel: '초' | '중' | '고' | null;
  gradeNumber: number | null;
  semester: number | null; // 파일명에 학기가 명시된 경우만
}

export interface TaxonomyMatch {
  subUnitId: string;
  subUnitName: string;
  middleUnitName: string;
  majorUnitName: string;
  subject: MathGradeSubject;
  similarity: number; // 0~1
  matchMethod: 'INDEX' | 'FUZZY_NAME';
}

// 파일명 패턴: "[기본] 4-1-1.이차함수 y=ax²의 그래프(05) 중3 수학 [25문제] [Q].pdf"
const FILE_NAME_PATTERN =
  /(\d{1,2})-(\d{1,2})-(\d{1,2})\.(.+?)(?:\(\d+\))?\s*(초|중|고)\s*(\d)(?:\s*-\s*(\d))?\s*수학/;

export function parseWorksheetFileName(fileName: string): FilenameParseResult | null {
  const m = fileName.match(FILE_NAME_PATTERN);
  if (!m) return null;

  return {
    majorIdx: parseInt(m[1], 10),
    middleIdx: parseInt(m[2], 10),
    subIdx: parseInt(m[3], 10),
    subUnitNameRaw: m[4].trim(),
    gradeLevel: m[5] as '초' | '중' | '고',
    gradeNumber: parseInt(m[6], 10),
    semester: m[7] ? parseInt(m[7], 10) : null,
  };
}

/** 한글 텍스트에 안전한 2-gram Dice 유사도 (형태소 분석 없이 근사) */
function bigrams(s: string): Set<string> {
  const clean = s.replace(/\s+/g, '');
  const grams = new Set<string>();
  for (let i = 0; i < clean.length - 1; i++) grams.add(clean.slice(i, i + 2));
  return grams;
}

function textSimilarity(a: string, b: string): number {
  const A = bigrams(a);
  const B = bigrams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let overlap = 0;
  for (const g of A) if (B.has(g)) overlap++;
  return (2 * overlap) / (A.size + B.size);
}

/** "초/중/고 + 학년(+학기)" → 후보 MathGradeSubject 목록 (학기 미명시 시 두 학기 모두 시도) */
function resolveCandidateSubjects(parsed: FilenameParseResult): MathGradeSubject[] {
  const { gradeLevel, gradeNumber, semester } = parsed;
  if (!gradeLevel || !gradeNumber) return [];

  if (gradeLevel === '초') {
    const sems = semester ? [semester] : [1, 2];
    return sems.map(s => `ELEM_${gradeNumber}_${s}` as MathGradeSubject);
  }
  if (gradeLevel === '중') {
    const sems = semester ? [semester] : [1, 2];
    return sems.map(s => `MID_${gradeNumber}_${s}` as MathGradeSubject);
  }
  // 고등학교는 과목명이 학년 숫자에 1:1 대응되지 않아(공통수학/대수/미적분/확통/기하 등)
  // 파일명만으로 특정할 수 없다 — 전체 고등 과목을 후보로 반환해 이름 기반 검색으로 처리
  return [
    'HIGH_COMMON_1', 'HIGH_COMMON_2', 'HIGH_ALGEBRA',
    'HIGH_CALC_1', 'HIGH_CALC_2', 'HIGH_PROB_STAT', 'HIGH_GEOMETRY',
  ] as MathGradeSubject[];
}

const INDEX_MATCH_MIN_SIMILARITY = 0.3; // 번호가 일치하므로 이름은 대략적 유사만 확인
const FUZZY_MATCH_MIN_SIMILARITY = 0.5; // 번호 없이 이름만으로 찾을 때는 더 엄격하게

/**
 * 파일명을 파싱해 택소노미 DB와 대조한다.
 * 1순위: 대-중-소 번호로 직접 조회(가장 정확) → 2순위: 후보 학년 전체에서 이름 유사도 검색
 */
export async function matchTaxonomyFromFileName(fileName: string): Promise<TaxonomyMatch | null> {
  const parsed = parseWorksheetFileName(fileName);
  if (!parsed) return null;

  const candidateSubjects = resolveCandidateSubjects(parsed);
  if (candidateSubjects.length === 0) return null;

  // 1. 번호 기반 직접 조회
  if (parsed.majorIdx != null && parsed.middleIdx != null && parsed.subIdx != null) {
    for (const subject of candidateSubjects) {
      const major = await prisma.mathMajorUnit.findFirst({ where: { subject, orderIndex: parsed.majorIdx } });
      if (!major) continue;
      const middle = await prisma.mathMiddleUnit.findFirst({ where: { majorUnitId: major.id, orderIndex: parsed.middleIdx } });
      if (!middle) continue;
      const sub = await prisma.mathSubUnit.findFirst({ where: { middleUnitId: middle.id, orderIndex: parsed.subIdx } });
      if (!sub) continue;

      const similarity = textSimilarity(parsed.subUnitNameRaw, sub.name);
      if (similarity >= INDEX_MATCH_MIN_SIMILARITY) {
        return {
          subUnitId: sub.id,
          subUnitName: sub.name,
          middleUnitName: middle.name,
          majorUnitName: major.name,
          subject,
          similarity,
          matchMethod: 'INDEX',
        };
      }
    }
  }

  // 2. 번호 매칭 실패 시: 후보 학년 전체에서 소단원명 유사도로 검색
  const candidates = await prisma.mathSubUnit.findMany({
    where: { middleUnit: { majorUnit: { subject: { in: candidateSubjects } } } },
    include: { middleUnit: { include: { majorUnit: true } } },
  });

  let best: TaxonomyMatch | null = null;
  for (const sub of candidates) {
    const similarity = textSimilarity(parsed.subUnitNameRaw, sub.name);
    if (similarity >= FUZZY_MATCH_MIN_SIMILARITY && (!best || similarity > best.similarity)) {
      best = {
        subUnitId: sub.id,
        subUnitName: sub.name,
        middleUnitName: sub.middleUnit.name,
        majorUnitName: sub.middleUnit.majorUnit.name,
        subject: sub.middleUnit.majorUnit.subject,
        similarity,
        matchMethod: 'FUZZY_NAME',
      };
    }
  }

  return best;
}
