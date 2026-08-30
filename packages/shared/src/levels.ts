// packages/shared/src/levels.ts
//
// 레벨 등급표. index.ts 와 feedback.ts 가 함께 쓰므로 따로 뒀다.
//
// feedback.ts 가 index.ts 에서 이것을 가져가면 index → feedback → index 순환이
// 생긴다. 순환 자체는 허용되지만, 모듈이 초기화되는 순서에 따라 LEVEL_TIERS 가
// undefined 인 채로 읽힐 수 있다 (Metro 가 경고로 알려 준다).

export type LevelTier = {
  level: number      // Lv.1 ~ Lv.9
  grade: number      // 9등급 ~ 1등급 (레벨이 높을수록 등급 숫자는 작다)
  title: string
  minRate: number    // 이 정답률(%) 이상
}

/** 레벨이 높은 것부터 — 정답률로 찾을 때 위에서부터 보면 된다 */
export const LEVEL_TIERS: LevelTier[] = [
  { level: 9, grade: 1, title: '프라임 마스터', minRate: 96 },
  { level: 8, grade: 2, title: '그랜드 마스터', minRate: 92 },
  { level: 7, grade: 3, title: '마스터',       minRate: 88 },
  { level: 6, grade: 4, title: '엘리트',       minRate: 82 },
  { level: 5, grade: 5, title: '어드밴스',     minRate: 76 },
  { level: 4, grade: 6, title: '스텐다드',     minRate: 70 },
  { level: 3, grade: 7, title: '트레이니',     minRate: 60 },
  { level: 2, grade: 8, title: '루키',         minRate: 40 },
  { level: 1, grade: 9, title: '비기너',       minRate: 0 },
]
