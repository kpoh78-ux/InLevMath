// 학습지 목록 정렬 — 학습지 관리·배포·수업준비가 같은 순서를 쓰도록 한 곳에 모은다.
//
// 서버(GET /api/worksheets)는 최신 등록순(createdAt desc)으로 내려준다.
// 화면에서 이 비교 함수로 다시 정렬하지 않으면 (04),(03),(02),(01) 처럼 거꾸로 보인다.

/**
 * 학습지 정렬 키 — 제목 앞의 단원 번호와 끝의 회차를 숫자로 읽는다.
 * 예) "4-2-1.정비례와 반비례(17)" → units [4,2,1], seq 17
 * 문자열 비교로는 "1-10"이 "1-2"보다 앞서므로 반드시 숫자로 비교해야 한다.
 */
export function worksheetOrderKey(title: string) {
  const t = (title ?? '').trim()
  // 앞쪽 단원 번호: 1 / 1-2 / 1-2-3 (뒤에 . 이나 공백, 한글이 와도 됨)
  const head = /^(\d+(?:\s*-\s*\d+)*)/.exec(t)
  const units = head ? head[1].split('-').map(n => parseInt(n.trim(), 10)) : []
  // 끝의 회차: (17) / (1회) / (3 회)
  const tail = /\((\d+)\s*회?\s*\)\s*$/.exec(t)
  const seq = tail ? parseInt(tail[1], 10) : Number.MAX_SAFE_INTEGER
  return { units, seq }
}

/** 단원 번호 → 회차 → 제목 순으로 오름차순 */
export function compareWorksheets(a: { title: string }, b: { title: string }) {
  const ka = worksheetOrderKey(a.title)
  const kb = worksheetOrderKey(b.title)

  // 번호가 없는 제목은 뒤로 보낸다
  if ((ka.units.length === 0) !== (kb.units.length === 0)) {
    return ka.units.length === 0 ? 1 : -1
  }

  const depth = Math.max(ka.units.length, kb.units.length)
  for (let i = 0; i < depth; i++) {
    // 짧은 쪽이 먼저 (1-1 이 1-1-1 보다 앞)
    const x = ka.units[i] ?? -1
    const y = kb.units[i] ?? -1
    if (x !== y) return x - y
  }

  if (ka.seq !== kb.seq) return ka.seq - kb.seq
  return a.title.localeCompare(b.title, 'ko')
}

/** 학년 표시 순서 (초1 → 고3) */
export const WS_GRADE_ORDER = [
  '초1', '초2', '초3', '초4', '초5', '초6',
  '중1', '중2', '중3', '고1', '고2', '고3',
]