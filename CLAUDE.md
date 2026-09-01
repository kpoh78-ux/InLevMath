# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**InLevMath** (Infinity Level Up Math) — 오근표 수학학원 학생들을 위한 게임형 수학 학습 동기부여 앱.
학생이 오프라인 문제를 풀고 결과를 입력하면 능력치(이해력/추론력/계산력)가 오르고 미션을 클리어해 레벨업하는 구조.

- 학생 최대 300명, 선생님 최대 10명 (`APP_LIMITS` in `packages/shared/src/index.ts`)
- 로그인 아이디: 핸드폰번호 11자리, 학생·선생님 초기 비밀번호: `math1234`

### 계정 비밀번호 규칙

- **본인 변경** — 학원관리 → 내 계정(`/dashboard/manage/account`). 현재 비밀번호를 반드시 묻는다
- **잊었을 때** — 관리자가 선생님 관리에서 `비번 초기화` → `math1234`. 현재 비밀번호를 묻지 않는다
- Supabase Auth 비밀번호는 `HMAC(JWT_SECRET, "supa_"+userId)` 라 사용자 비밀번호와 무관하다.
  비밀번호를 바꿀 때 Supabase 쪽은 건드리지 않는다
- **로그인 아이디(핸드폰번호)를 바꾸면 반드시 `syncSupabaseEmail()` 을 함께 부른다.**
  Supabase 계정 이메일이 `phoneToEmail(phone)` 로 만들어져 있어, 번호만 바꾸면 로그인이
  매번 로컬 JWT 폴백으로 조용히 떨어진다

## Target Platforms

| 앱 | 대상 기기 | 실행 환경 |
|---|---|---|
| **학생용** (`apps/mobile`) | Android 스마트폰 / 태블릿 | Android 네이티브 앱 (Expo) |
| **선생님용** (`apps/web`) | 태블릿 / 노트북 / 데스크탑 | Chrome 브라우저 웹 앱 |

### 개발 시 항상 적용할 제약

**학생 앱 (Android 전용):**
- iOS 지원 고려 불필요 — Android 전용 API (`ToastAndroid`, `Vibration` 등) 자유롭게 사용 가능
- 화면 크기: 스마트폰(360~420dp) + 태블릿(768~1024dp) 양쪽 고려
- 터치 인터페이스 기준으로 UI 설계 — 버튼 최소 44dp 이상
- 태블릿에서는 콘텐츠가 좌우로 너무 늘어나지 않도록 `maxWidth` 제한 권장

**선생님 웹 (태블릿부터 데스크탑까지):**
- **최소 지원 폭 768px**(태블릿 세로)부터 데스크탑까지 동작해야 한다.
  데스크탑 전용으로 짜지 않는다 — 선생님이 수업 중 태블릿으로 출결·채점을 처리한다
- 브레이크포인트 기준: `~767` 좁은 화면 / `md 768~1023` 태블릿 / `lg 1024+` 데스크탑
- **터치와 마우스 양쪽**을 고려한다. hover에만 기능을 걸지 말고, 터치 대상은 최소 44px
- 고정 폭 사이드바를 화면에 못 박지 않는다. 좁은 화면에서는 접히거나 서랍(drawer)으로 열려야 한다
- 넓은 표·그리드는 `overflow-x: auto` 컨테이너 안에 두어 본문이 가로로 밀리지 않게 한다
- Chrome 최신 버전 기준 — 크로스브라우저 호환성 고려 불필요

## Monorepo Structure

Turborepo + npm workspaces 구성:

```
apps/mobile   — Expo 56 + Expo Router (학생용 Android 앱)
apps/web      — Next.js 16 App Router (선생님용 웹 + 백엔드 API)
packages/shared — 공통 타입/상수/유틸 (TypeScript, 빌드 없이 직접 ts 임포트)
```

워크스페이스는 이 셋뿐이다. `apps/kiosk`(고아 폴더)와 `packages/database`(쓰이지 않는
중복 schema.prisma)는 정리했다. 키오스크 화면은 `apps/web/src/components/kiosk/` 안에 있다.

### 아직 화면에 연결되지 않은 기능

### 키오스크는 선생님 로그인을 쓴다

입구 태블릿의 `/kiosk` 와 그 API 두 개(`kiosk-check`, `confirm-checkout`)는
**선생님 로그인이 있어야 부를 수 있다** (`src/lib/kioskAuth.ts`).

- 예전에는 검사가 없어 누구나 4자리를 1만 번 넣어 볼 수 있었고, 맞으면 남의 아이
  등원 기록이 생기고 학부모에게 알림톡이 나갔다. `confirm-checkout` 은 `studentId`
  만 알면 PIN 없이도 하원 처리가 됐다
- **별도 기기 토큰을 만들지 않는다.** `NEXT_PUBLIC_*` 로 넣으면 `/kiosk` 를 여는
  누구나 소스에서 읽어 지금과 똑같아지고, 기기에 따로 입력해 두는 방식은 관리할
  비밀이 하나 더 생긴다. 태블릿에 한 번 로그인하면 토큰이 30일 유지된다
- 관리자로 좁히지 않고 **선생님이면 통과**시킨다. 아침에 태블릿이 로그아웃돼 있을 때
  관리자를 기다려야 하면 출결이 멈춘다
- 로그아웃 상태에서는 **키패드를 아예 띄우지 않는다.** 눌러도 안 되는 화면을
  보여 주면 학생이 기기 고장으로 오해한다
- PIN 조회와 `studentId` 조회 모두 **학원으로 좁힌다.** 지금은 학원이 하나뿐이라
  차이가 없지만, 안 좁히면 학원이 늘어나는 순간 PIN 이 학원을 넘어 겹친다

### 아직 화면에 연결되지 않은 기능

`/api/diagnostic/*`, `/api/knowledge/trace-deficit` 와 그 라이브러리
(`src/lib/irt.ts`, `knowledgeGraph.ts`, `diagnosticStore.ts`)는 IRT 진단평가·지식그래프
기능이다. **호출하는 UI가 아직 없다.** 죽은 코드가 아니라 만들다 만 기능이므로 지우지 않는다.
다만 배포되면 실제로 열리는 엔드포인트이므로 로그인 검사는 들어가 있다.

## Common Commands

### 모바일 앱 실행
```bash
cd apps/mobile
npx expo start          # Metro 시작 → 터미널에서 a 키로 Android 에뮬레이터 실행
npx expo start --android
```

### 백엔드 개발 서버
```bash
cd apps/web
npx next dev
```

### 루트에서 전체 실행
```bash
npm run dev:mobile      # apps/mobile expo start
npm run dev:web         # apps/web next dev
npm run build:web
npm run lint            # turbo lint
```

### DB 마이그레이션

> ⚠️ **`npx prisma migrate dev` 를 실행하지 않는다.**
> 이 DB(Railway 운영)는 마이그레이션 이력에 없는 테이블이 `db push` 로 만들어져 드리프트가 있다.
> `migrate dev` 는 이를 만나면 **DB 전체 리셋을 요구한다** — 학습지 1,200여 개와 정답이 사라진다.
> 개발 DB가 따로 없으므로 로컬에서도 같은 운영 DB를 본다.

스키마를 바꿀 때는 **SQL 을 손으로 쓰고 `migrate deploy` 로만 적용한다.**

```bash
cd apps/web
# 1) prisma/schema.prisma 수정
# 2) prisma/migrations/<YYYYMMDDHHMMSS>_<이름>/migration.sql 을 직접 작성
#    ALTER TABLE ... ADD COLUMN IF NOT EXISTS ... 처럼 여러 번 돌려도 안전하게 쓴다
npx prisma migrate deploy   # 이력에 없는 마이그레이션만 적용 (리셋 없음)
npx prisma generate         # 클라이언트 재생성
npx prisma studio           # DB 브라우저
```

기존 예시: `20260827200000_class_schedule_students`, `20260827210000_daily_report_fields`

## Architecture

### 인증 흐름
- JWT (jose) — 30일 만료, Bearer 토큰
- 모바일: `expo-secure-store`에 토큰 저장 (`store/authStore.ts`)
- 백엔드: `src/lib/auth.ts`의 `getAuthUser(req)` — 모든 보호 라우트에서 사용
- `JWTPayload`: `{ sub: userId, role, name, phone }`

### 실시간 연동 (SSE)
- `GET /api/events` — 클라이언트가 연결 유지 (30초 heartbeat)
- `src/lib/sse.ts` — 인메모리 Map으로 클라이언트 관리 (단일 서버 한정)
- 학생 결과 입력 → `broadcastToTeacher()` → 선생님 앱에 실시간 알림
- 레벨업 시 → `broadcastToStudentsOfTeacher()` → 학생에게 LEVEL_UP 이벤트
- 모바일 SSE 클라이언트: `store/useEvents.ts` (EventSource 대신 fetch 스트리밍, 자동 재연결)

### 미션 → 레벨 로직 (`packages/shared/src/index.ts`)
- `MISSION_ORDER`: 5단계 순서 배열
- `MISSION_CLEAR_THRESHOLD`: 미션별 클리어 정답률 기준
- `calcAbilityDelta()`: 정답률 기반 능력치 증가량 계산 (gain = rate × 0.1)
- 결과 저장 → 능력치 업데이트 → 클리어 판정 → 레벨업 순서로 처리 (`/api/missions/results`)

### Metro 모노레포 설정
`apps/mobile/metro.config.js`에서 `watchFolders`를 모노레포 루트로 설정해야 `@inlevmath/shared` 임포트가 동작함.
`packages/shared`는 빌드 없이 TypeScript 소스를 직접 참조 (`"main": "./src/index.ts"`).

### API 라우트 구조
```
POST /api/auth/login              — 핸드폰번호+비밀번호 로그인
POST /api/auth/register           — 선생님 계정 생성
POST /api/auth/change-password    — 본인 비밀번호 변경 (선생님·학생 공용)
GET  /api/students                — 선생님: 담당 학생 목록
POST /api/students                — 선생님: 학생 등록 (초기PW math1234 자동 설정)
POST /api/students/[id]/reset-password — 선생님: 학생 비밀번호 math1234로 초기화
GET/POST/PATCH/DELETE /api/admin/teachers — 관리자: 선생님 목록·등록·정보수정/권한·삭제
POST /api/admin/teachers/[teacherId]/reset-password — 관리자: 선생님 비밀번호 math1234로 초기화
POST /api/missions/results        — 선생님: 학습 관찰 결과 입력 + SSE 발송
GET  /api/missions/results        — 학생: 본인 학습 이력
GET  /api/events                  — SSE 연결 엔드포인트
```

### 모바일 화면 구조

**학생 전용 앱이다.** 선생님용 화면은 웹으로 옮겼으므로 여기에 다시 만들지 않는다.
선생님 계정으로 로그인을 시도하면 로그인 화면에서 막고 웹으로 안내한다.

**학생이 직접 넣는 것은 학습지 답안뿐이다.** 그것은 저장된 정답으로 자동
채점된다. 미션 결과(문제 수·맞은 개수)는 학생이 스스로 적으면 확인할 방법이 없어
선생님 웹(수업준비 → 학습 관찰 입력)으로 옮겼다.

```
app/(auth)/login.tsx              — 핸드폰번호 로그인 (학생 계정만 통과)
app/(student)/index.tsx           — 학생 대시보드 (레벨/능력치/미션 로드맵)
app/(student)/history.tsx         — 학습 이력
app/(student)/worksheet-omr.tsx   — 배포받은 학습지 OMR 답안 제출
app/(student)/inventory.tsx       — 보상 보관창고
app/(student)/change-password.tsx — 비밀번호 변경
```

학생 앱이 쓰는 API — 이 목록 밖의 엔드포인트는 웹 전용이다.
```
POST /api/auth/login              — 로그인
POST /api/auth/change-password    — 비밀번호 변경
GET  /api/student/progress        — 레벨·능력치·미션 진행 (홈 화면)
GET  /api/student/worksheets      — 배포받은 학습지 목록
POST /api/student/worksheets/[distributionId]/submit — 답안 제출 (1차 자동 채점)
GET  /api/missions/results        — 학습 이력 조회
GET  /api/student/inventory       — 보관창고
GET  /api/events                  — SSE 실시간 알림
```

## 메뉴 간 데이터 연결 원칙

**모든 메뉴는 실시간으로 연결되어야 한다.** 한 화면에서 데이터를 변경하면 관련된 다른 화면에도 즉시 반영된다.

| 데이터 | 원천 메뉴 | 연결된 메뉴 |
|---|---|---|
| 학생 등록/수정 | 학생관리 | 학원현황(학생 현황), 수업준비(배포 대상), 주간시간표(학생 명단) |
| 학습지 등록/정답 설정 | 학습지 | 학원현황(정답 설정 현황), 수업준비(배포 목록) |
| 학습지 배포 | 수업준비 | 학원현황(배포 현황), 학생 앱(배포된 학습지 목록) |
| 채점 결과 제출 | 학생 앱(채점 입력) | 학원현황(채점 완료 건수), 학생 능력치, 학생관리(상세) |
| 주간시간표 입력 | 학원관리(수업 시간표, 선생님별) | 학원현황(오늘의 수업), 출결(지각 자동 판정), 하원 학습리포트 |

### 시간표는 선생님별, 학생의 하루는 하나

- **ClassSchedule 의 소유자는 수업을 맡은 선생님 본인**이다. 학생·학습지와 달리
  `academyTeacher()` 로 대표 계정에 몰지 않는다 (`src/lib/academy.ts` 참고).
  목록 조회는 학원 전체를 주되, 수정·삭제는 본인 수업만 (관리자는 전부).
- 수업에 붙는 학생은 `ClassScheduleStudent` 관계다. 이름 문자열은 동명이인을 가릴 수 없다.
- 시간표 화면의 선생님 목록은 `Teacher.teachesClasses` 로 정한다. 자기 수업 없이
  학원 전체를 관리만 하는 계정(교육실장 등)은 `false` 로 두면 빠진다.
  **이름으로 거르지 않는다** — 사람이 바뀔 때마다 코드를 고쳐야 한다.
  수업이 0개여도 목록에는 남긴다. 새로 온 선생님이 거기서 시간표를 시작한다.
- **한 학생이 같은 날 여러 선생님 수업을 들을 수 있다.** 그날 수업을 모을 때는 반드시
  `src/lib/dailyClasses.ts` 의 `getStudentDayClasses()` 를 거친다. ClassSchedule 을
  직접 조회하면 다른 선생님 수업이 빠져 지각 판정과 리포트가 어긋난다.
- 지각은 **연강 구간의 첫 수업** 기준으로 하루 한 번만 판정한다.
  뒤 수업 시작 시각과 맞대면 멀쩡히 온 학생이 지각이 된다.
- **10분 이상 늦어야 지각**이다 (`LATE_THRESHOLD_MINUTES`). 9분까지는 정상 출석으로 두고
  학부모에게도 지각으로 알리지 않는다. 늦은 정도는 10·20·30·40·50·60분 이상 눈금으로 올린다.
- 하원 학습리포트는 `src/lib/dailyReportAggregator.ts` 가 **날짜 단위**로 집계한다.
  수업이 여러 개여도 알림톡은 한 통이고 숫자는 합산된다. 수업 후 채점이 흔하므로
  시각이 아니라 날짜로 자르고, 채점이 들어올 때 다시 부른다 (순수 집계 — 아무것도 쓰지 않는다).

### 학습리포트 설정은 2계층까지만

| 계층 | 테이블 | 범위 |
|---|---|---|
| 프리셋 | `AttendanceNotificationConfig` | 선생님 본인의 상시 기본값. 알림톡 → 학습리포트 항목 |
| 당일 오버라이드 | `DailyStudentReportOverride` | 학생 1명의 그날 하루만. 출결 → 학습리포트 발송 모달 |

- 병합은 `src/lib/reportOptions.ts` 가 한다. 오버라이드가 있으면 그것이, 없으면 프리셋이 이긴다.
- **학생별 상시 설정을 만들지 않는다.** 계층이 셋이 되면 어느 설정이 이겼는지 따라갈 수 없다.
  그날 하루만 바꾸고 `editedBy` 를 남기는 쪽이 운영에서 덜 위험하다.
- 켜진 항목이라도 **그날 기록이 없으면 줄을 넣지 않는다.** 빈 항목을 "0건"으로 채우면
  학부모가 매일 같은 껍데기를 받는다.
- 하원 자동 발송(`autoSendOnCheckOut`)의 **기본값은 꺼짐**이다. 켜지 않은 학원에서
  하원 버튼 한 번에 학부모 전원에게 문자가 나가면 안 된다. 같은 날 두 번 보내지도 않는다.
- 수업 태도·선생님 코멘트는 데이터로 뽑을 수 없어 오버라이드에 선생님이 직접 적는다.

### 구현 지침
- 학원현황은 `/api/dashboard/summary` 단일 API에서 모든 집계 데이터를 가져온다
- 모달/작업 완료 후 `fetchSummary()`를 호출해 학원현황을 항상 최신 상태로 유지한다
- 새로운 기능 추가 시 summary API에 관련 집계 항목을 함께 추가한다
- SSE(`/api/events`)를 통해 학생 제출 결과는 선생님 화면에 실시간 push된다

## 문제은행 — 분류 축과 반입 경계

문제를 계속 쌓으려면 **교육과정 좌표**에 앉혀야 한다. 이미 시딩된 트리가 둘 있다.

| 트리 | 규모 | 무엇에 쓰나 |
|---|---|---|
| 4계층 (`MathMajorUnit`→`MathMiddleUnit`→`MathSubUnit`→`MathPatternType`) | 92 / 216 / 581 / 1,305 | "어디서 배우는 문제인가" — 학습지 편성 |
| 지식그래프 (`ConceptNode` + `ConceptDependency`) | 1,474 노드 / 1,503 간선 | "무슨 개념인가" — 선수 결손 역추적 |

`Question` 은 **셋 다 붙인다** (`subUnitId`·`patternTypeId`·`conceptNodeId`).
전부 Nullable — 분류는 한 번에 끝나지 않고 계속 붙여 나간다.

> **2026-08-31 결정 — 채점·문제은행·학습지 생성은 LevMathPro로 옮긴다.**
> InLevMath는 학원 수업관리·시험대비, 상담 및 학생관리, 알림톡을 주기능으로 한다.
> 교재(Textbook) 기능은 스키마째 삭제했다(마이그레이션 `20260831000000_remove_textbook`).
> 아래 `Question`·교육과정 트리·반입 계약은 이미 시딩된 데이터라 지우지 않고 남겨 뒀지만,
> **실제로 채우고 쓰는 일(문제은행 적재, 교재유사문제·교재오답·학습지오답·단원평가·
> 모의고사 학습지 생성)은 LevMathPro 쪽에서 한다.** 학습지 배포·채점(OMR)과 그로 인한
> 레벨업만 InLevMath에 남는다.

### 난이도는 1~5 하나뿐

`packages/shared` 의 `Difficulty`. 1 최하 / 2 하 / 3 중 / 4 상 / 5 최상.
**`null` 은 "아직 안 매김"이고 3(중)과 다르다** — 기본값 3을 넣으면 둘을 구분할 수 없다.
시드된 `ConceptNode.difficulty`(1~3)는 그대로 두고 `conceptDifficultyTo5()` 로 환산해 읽는다.

문제집에 난이도 표시가 있으면 그것이 우선, 없으면 문제가 속한 구획으로 정한다
(`resolveDifficulty()`). 우선순위: 명시값 → 문제집 표시(★·상중하·A~E) → 구획 → null.

| 구획 | 난이도 |
|---|---|
| 개념·공식 적용 | 2 |
| 유형별 분류 | 3 |
| 학교시험대비·단원평가 | 4 |
| 서술형·심화 | 5 |

### 문제 반입은 LevMathPro가 직접 한다 (2026-09-01 갱신 — 아래는 옛 계획)

> **2026-09-01 결정 — "반입 전용 3번째 앱"은 안 만든다. LevMathPro가 PDF
> 업로드 → Gemini OCR/AI 추출 → 교육과정 대조 → 검수까지 직접 맡는다.**
> 아래 문단(별도 앱·`packages/shared/src/questionImport.ts` JSON 계약·
> `GET /api/question-bank/import`)은 이 결정 이전의 계획이라 지금은 안 쓴다 —
> 그 계약을 구현한 적이 없으므로 지울 코드도 없다. 남겨 둔 이유는 아래 세
> 원칙(좌표·개념노드 ID를 직접 안 보낸다, 매칭 실패해도 버리지 않는다,
> 사람이 손댄 분류는 재반입이 안 덮는다)이 여전히 옳고, LevMathPro의 반입
> 파이프라인(`src/lib/questionBank/`)도 그대로 따르고 있어서다.
>
> 애초에 "같은 Postgres에 두 앱이 각자 Prisma로 붙으면 충돌한다"는 게
> 별도 앱을 두려던 이유였는데, LevMathPro는 처음부터 별도 Supabase
> 프로젝트를 쓰고 있어 그 위험이 없다 — 3번째 앱과 JSON 계약을 거칠
> 이유 자체가 사라졌다. 이 DB(InLevMath 쪽)의 `Question`·교육과정 트리는
> 여전히 시딩된 데이터로 남아 있지만, 새 문항 반입은 여기 붙지 않는다.
> LevMathPro 쪽 실제 구현: `apps/web` 아님, `C:\My-Project\fourth_Project_LevMathPro`
> (별도 저장소·별도 배포) — `src/lib/ai/gemini.ts`(추출), `src/lib/questionBank/
> curriculumMatch.ts`(대조), `src/lib/questionBank/review.ts`(검수).

문제집 PDF 파싱·해설 추출·사람 검수를 별도 앱이 자기 DB로 맡는다는 게 원래
계획이었다. 같은 PostgreSQL 에 두 앱이 각자 Prisma 스키마로 붙으면 한쪽
마이그레이션이 다른 쪽을 리셋하려 든다 (이 DB 는 이미 드리프트가 있어 특히
위험하다) — 그래서 별도 DB를 쓰는 별도 앱을 상정했었다.

두 앱이 공유하기로 했던 것은 `packages/shared/src/questionImport.ts` 의 JSON
형식 하나뿐이었다.

- 반입 쪽은 **소단원 ID·유형 ID·개념노드 ID 를 보내지 않는다.** 트리를 복제하면 곧 어긋난다.
  문제집에 적힌 문자열만 보내고, 매칭은 받는 쪽이 한다(LevMathPro는 `curriculumMatch.ts`)
- 매칭에 실패해도 문항은 저장한다. 원본 표기가 남아 나중에 다시 붙일 수 있다.
  못 찾았다고 버리면 검수까지 끝낸 문항이 사라진다
- **사람이 손댄 분류(`classifiedBy` ≠ 'auto')는 재반입이 덮어쓰지 않는다.** 좌표와 난이도
  모두 지킨다. 문항 내용(본문·답·풀이)만 최신으로 갱신한다

경계: **학습지**(PDF 1장 = 25문항, 정답만)는 지금처럼 InLevMath 안에서 처리하고,
**문제집**(문항 단위 + 해설 + 분류)은 LevMathPro가 맡는다.

### 문제 확장 — 원본 하나에서 세 갈래

| `variantKind` | 뜻 | 난이도 |
|---|---|---|
| `ORIGINAL` | 문제집에 실린 그대로 | 구획·표시로 정한다 |
| `NUMERIC` | 숫자 바꾼 문제 | 단서 없으면 **원본을 물려받는다** |
| `REPHRASED` | 표현 바꾼 문제 | 단서 없으면 **원본을 물려받는다** |
| `COMPOSITE` | 복합 유형 — 다른 단원 개념을 얹었다 | **하한 4** (`COMPOSITE_MIN_DIFFICULTY`) |

- 변형은 `originId` 로 원본을 가리킨다. 반입 시에는 원본의 `ref` 를 적어 보내고,
  **원본과 변형을 같은 페이로드에 섞어 보내도 순서와 무관하게 붙는다** (2차 통과에서 연결).
  원본이 아직 없으면 문항은 저장하되 `danglingVariants` 로 알린다 — 버리지 않는다.
- 복합 유형은 개념 하나에 담기지 않으므로 `QuestionConcept`(다대다)에 primary/secondary 로 담는다.
  "개념 A와 B가 함께 나오는 문제"를 뽑으려면 이 표를 본다.
- 개념 이름 매칭은 유사도라 **비슷하지만 다른 개념에 걸릴 수 있다.** 반입 결과의
  `conceptMatches` 가 무엇이 무엇으로 붙었는지 그대로 돌려주니 확인하고 고친다.

### 오류 문제는 지우지 않고 표시한다

`PATCH /api/question-bank/[id]` 로 선생님이 본문·답·풀이·좌표·난이도를 고친다.

- `status`: `active` | `flagged`(오류 의심) | `retired`(더 쓰지 않음).
  **지우지 않는 이유** — 이미 학생에게 나간 기록이 그 문항을 가리키고 있다
- 고친 흔적을 두 갈래로 남긴다. 재반입이 되돌리지 못하게 하기 위해서다
  - `editedAt`/`editedBy` — 본문·답·풀이를 고쳤다 → 반입이 **내용**을 건드리지 않는다
  - `classifiedBy` (≠ 'auto') — 좌표·난이도를 고쳤다 → 반입이 **분류**를 건드리지 않는다
  - 둘을 따로 두는 이유: 본문만 고쳤는데 자동 분류까지 잠기면 안 된다

## 정답 데이터 확장성 원칙

학습지 정답과 서술형 스냅샷 이미지는 계속 쌓이면 DB가 수십~수백 GB로 커진다.
정답 관련 기능을 추가·수정할 때는 아래를 반드시 지킨다.

### 1. 큰 값은 목록/집계 쿼리에서 읽지 않는다
- 정답 이미지는 `AnswerImage` 테이블에 분리 저장하고, `Worksheet.answersJson`에는
  마커 `__img__`(`IMAGE_ANSWER_MARKER`)만 넣는다
- 학생별 오답 번호 배열도 목록·집계 API에는 넣지 않는다 (개수만)

### 2. 이미지는 오브젝트 스토리지로 뺄 수 있게 둔다
- `src/lib/answerImageStore.ts`가 저장 위치를 추상화한다. 정답 이미지를 직접
  `prisma.answerImage`로 읽고 쓰지 말고 반드시 이 모듈을 거친다
- `ANSWER_IMAGE_STORAGE=db`(기본)는 base64를 DB에, `supabase`는 Supabase Storage에 저장하고
  DB에는 `objectKey`만 남긴다. 조회 시 서명 URL을 돌려주므로 이미지 트래픽이 앱 서버를 거치지 않는다
- 전환 절차: Supabase → Storage → 비공개 버킷 `answer-images` 생성 → `.env`에
  `ANSWER_IMAGE_STORAGE=supabase` 설정. 기존 `db` 저장분은 그대로 계속 보인다 (혼재 가능)
- 학습지 삭제 시 `purgeAnswerImages()`를 호출해 버킷 파일까지 정리한다
- 현재 용량은 학원관리 → 백업·용량(`/dashboard/manage/backup`, 관리자 전용) 또는
  `GET /api/admin/storage`에서 확인

### 3. 대량 저장은 전체 교체가 아니라 증분으로
- 이미지 1장 `MAX_ANSWER_IMAGE_BYTES`(500KB), 요청당 합계 `MAX_ANSWER_IMAGE_TOTAL_BYTES`(8MB)
- 이미지는 클라이언트(`src/lib/imageCompress.ts`)에서 webp로 리사이즈·압축한 뒤 전송한다

## Key Constraints

- `SafeAreaView`는 반드시 `react-native-safe-area-context`에서 임포트 (`react-native` 내장 버전 사용 금지)
- JSX에 `import React` 불필요 (React 17+ transform)
- `@inlevmath/shared` 타입 변경 시 모바일/웹 양쪽 영향 검토 필요
- SSE는 단일 서버 인메모리 방식 — 다중 서버 배포 시 Redis Pub/Sub으로 교체 필요
- **스키마 변경 시 `migrate dev` 금지** — SQL 을 손으로 쓰고 `npx prisma migrate deploy` 로만 적용한다 (위 [DB 마이그레이션](#db-마이그레이션) 참고)

## Environment Variables (apps/web/.env)

```
DATABASE_URL=           # PostgreSQL 연결 문자열 (Railway)
JWT_SECRET=             # JWT 서명 키
GEMINI_API_KEY=         # Google Gemini API 키
ANTHROPIC_API_KEY=      # Anthropic Claude API 키
ANSWER_IMAGE_STORAGE=   # 정답 이미지 저장 위치: 'db'(기본) | 'supabase'
ANSWER_IMAGE_BUCKET=    # supabase 모드 버킷명 (기본 'answer-images')
KAKAO_BIZ_USER_ID=      # 카카오 알림톡(비즈엠) userId
KAKAO_SENDER_KEY=       # 카카오 채널 발신프로필 키
KAKAO_ALIMTALK_TEMPLATE_ID=  # 심사 승인된 알림톡 템플릿 코드
KAKAO_SENDER_PHONE=     # 사전등록된 SMS/LMS 대체 발송 발신번호
```

### 카카오 알림톡 발송 상태
- 위 카카오 키 4개가 **모두** 설정되어야 실제 발송이 이루어진다 (`src/lib/kakaoBizmsg.ts`의 `isAlimtalkConfigured()`).
- 미설정 시 발송을 시도해도 실제로 전송되지 않으며, 로그에 `responseCode: NOT_CONFIGURED` /
  `status: FAILED`로 남고 화면에는 **"미발송(미연동)"**으로 표시된다.
- **발송 결과를 절대 낙관적으로 성공 처리하지 않는다.** 발송 코드는 비즈엠 응답 코드가
  `success`일 때만 `SUCCESS`로 기록해야 한다 (과거 Mock 모드가 가짜 성공을 기록해 학부모에게
  전달되지 않은 알림을 "발송완료"로 표시한 사고가 있었다).
- 사전 절차: 비즈엠 계약 → 카카오 채널 발신프로필 등록 → 알림톡 템플릿 심사 승인 → 발신번호 사전등록

- **모든 API 키는 반드시 `.env` 파일에만 저장한다.** 코드에 하드코딩 절대 금지.
- `apps/web/.env`는 `.gitignore`에 포함되어 있어야 한다. 커밋 전 확인 필수.
- 새 LLM 키나 외부 서비스 키가 생기면 `.env`에 추가하고, 키 이름(변수명)만 이 파일에 문서화한다.

## 보안 및 배포 원칙

### RLS (Row Level Security)
- PostgreSQL 배포 시 **RLS를 반드시 활성화**한다.
- 현재는 JWT + Prisma 레벨에서 `teacherId` 필터로 접근을 제한하고 있으나, DB 레벨 RLS가 최종 방어선이다.
- 배포 전 체크리스트:
  - `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` 적용 여부 확인
  - 각 테이블에 `teacherId = auth.uid()` 조건의 Policy가 존재하는지 확인
  - 직접 DB 접속(Prisma Studio, psql 등)은 관리자 계정으로만 허용

### API 키 및 시크릿 관리
- `.env` 파일은 절대 Git에 커밋하지 않는다.
- Railway 배포 시 환경변수는 Railway 대시보드 → Variables 탭에서 직접 설정한다.
- 로컬 개발: `apps/web/.env.local` 사용 (`.env.example`에 키 이름만 남겨 팀 공유).

### 인증 (Authentication) — Supabase Auth 적용 완료
- **Supabase Auth 기반으로 마이그레이션 완료.** `src/lib/auth.ts` + `src/lib/supabase.ts` 참고.
- 로그인 흐름: bcrypt 비밀번호 검증 → `signInWithSupabase()` → Supabase JWT 반환
- Supabase Auth 비밀번호: `HMAC(JWT_SECRET, "supa_"+userId)` — 서버만 알고 있음, 사용자 비밀번호와 무관
- JWT 검증: `verifyToken(token)` → `supabaseAdmin.auth.getUser()` → `prisma.user.findUnique({ supabaseId })`
- 모든 기존 `verifyToken()` 호출 코드는 변경 없이 동작함 (시그니처 유지)

### Supabase 초기 설정 절차 (신규 배포 시)
1. supabase.com → 새 프로젝트 생성
2. Settings → API → `URL`, `anon key`, `service_role key` 복사 → `.env`에 저장
3. Settings → Database → Connection string(URI) 복사 → `DATABASE_URL`에 저장
4. `cd apps/web && npx prisma migrate deploy` 실행 (테이블 생성)
5. Supabase 대시보드 → SQL Editor → `apps/web/supabase-rls.sql` 전체 실행 (RLS 정책 적용)
6. Supabase 대시보드 → Authentication → Providers → Email 활성화, "Confirm email" **OFF** 설정

### Supabase 자동정지 방지 (헬스체크 Cron)
- 무료 티어는 7일 미활동 시 자동 정지됨
- **cron-job.org** (무료)에서 5일마다 `/api/health` 호출 설정:
  1. cron-job.org 가입 → 새 크론잡 생성
  2. URL: `https://your-app-domain.com/api/health`
  3. 실행 주기: 5일마다 (또는 `0 9 */5 * *`)
  4. 저장 → 활성화
- 헬스체크 엔드포인트: `GET /api/health` → DB 쿼리(user count) 후 `{ status: "ok" }` 반환

### 요청 제한 (Rate Limiting)
- **앱 앞단에 Cloudflare(또는 동급 CDN/WAF)를 두어 IP당 요청 횟수를 제한한다.**
- 기본 정책: IP당 1일 최대 **10회** (로그인·API 엔드포인트 기준).
- 배포 전 체크리스트:
  - Cloudflare Rate Limiting 규칙 활성화 여부 확인
  - `/api/auth/login`, `/api/students/bulk` 등 남용 가능한 엔드포인트에 규칙 적용
  - 필요 시 Next.js 미들웨어(`middleware.ts`)에 보조 rate limit 추가 (예: `@upstash/ratelimit`)

### 커밋 전 API 키 유출 방지
- **커밋 전에 API 키·시크릿이 코드에 섞여 있는지 반드시 확인한다.**
- 권장 도구: `git-secrets` 또는 `trufflehog` — 패턴 매칭으로 키 유출 자동 감지.
- pre-commit hook 예시 (`apps/web/.husky/pre-commit` 또는 `.git/hooks/pre-commit`):
  ```bash
  # API 키 패턴 감지 (AIza..., sk-..., ghp_... 등)
  git diff --cached | grep -E "(AIza[0-9A-Za-z_-]{35}|sk-[A-Za-z0-9]{48}|ghp_[A-Za-z0-9]{36})" && echo "❌ API 키가 포함된 것 같습니다. 커밋을 중단합니다." && exit 1 || exit 0
  ```
- Claude Code로 코드 작성 후 커밋 전, 변경 파일에 하드코딩된 키가 없는지 `git diff --cached`로 확인한다.
