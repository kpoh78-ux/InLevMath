// apps/mobile/store/sfxSource.ts
//
// 효과음 파일을 가리키는 단 한 곳.
//
// Metro 는 require 를 **번들 시점에 정적으로** 해석한다. 없는 파일을 require 하면
// try/catch 로도 막지 못하고 번들이 통째로 실패한다. 그래서 파일 유무를 코드로
// 판단할 수 없고, 넣은 사람이 여기서 주석을 바꿔 다는 방식으로 둔다.
//
// ── 소리를 넣는 법 ──────────────────────────────────────────────────────────
//   1) assets/audio/ 에 mp3 를 넣는다 (라이선스는 그 폴더 README 참고)
//   2) 아래에서 해당 줄의 주석을 바꿔 단다
//
// 일부만 넣어도 된다. 넣은 것만 울리고 나머지는 조용히 넘어간다.

import type { SoundCue } from '@inlevmath/shared'

export const SFX_SOURCES: Record<SoundCue, number | null> = {
  // 채점 5단계
  perfect: null,   // require('../assets/audio/sfx-perfect.mp3')  — 완벽 (95%+)
  great: null,     // require('../assets/audio/sfx-great.mp3')    — 훌륭 (85%+)
  good: null,      // require('../assets/audio/sfx-good.mp3')     — 좋음 (70%+)
  soso: null,      // require('../assets/audio/sfx-soso.mp3')     — 조금 더 (50%+)
  poor: null,      // require('../assets/audio/sfx-poor.mp3')     — 분발 (50% 미만)

  // 레벨 변화
  levelup: null,   // require('../assets/audio/sfx-levelup.mp3')   — 레벨업 (축하)
  leveldown: null, // require('../assets/audio/sfx-leveldown.mp3') — 레벨 다운 (경고)
  warn: null,      // require('../assets/audio/sfx-warn.mp3')      — 레벨 다운 근접 (주의)

  // 그 밖
  quest: null,     // require('../assets/audio/sfx-quest.mp3')     — 퀘스트 안내
}
