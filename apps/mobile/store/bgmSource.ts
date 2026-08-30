// apps/mobile/store/bgmSource.ts
//
// 배경음악 파일을 가리키는 단 한 곳.
//
// ── 왜 파일을 따로 뺐나 ─────────────────────────────────────────────────────
// Metro 는 require 를 **번들 시점에 정적으로** 해석한다. 없는 파일을 require 하면
// try/catch 로 감싸도 소용없이 번들이 통째로 실패한다 ("Unable to resolve module").
// 그래서 음악 파일 유무를 코드에서 판단할 수 없고, 넣은 사람이 여기 한 줄을
// 바꾸는 방식으로 둔다. 가짜 무음 mp3 를 넣어 두면 버튼은 보이는데 소리가 안 나
// 고장으로 보이므로 그렇게 하지 않았다.
//
// ── 음악을 넣는 법 ──────────────────────────────────────────────────────────
//   1) assets/audio/bgm.mp3 에 파일을 넣는다 (라이선스 확인은 그 폴더 README 참고)
//   2) 아래 두 줄의 주석을 바꿔 단다
//
// export const BGM_SOURCE = require('../assets/audio/bgm.mp3')
export const BGM_SOURCE: number | null = null
