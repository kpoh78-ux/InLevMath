# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**InLevMath** (Infinity Level Up Math) — 오근표 수학학원 학생들을 위한 게임형 수학 학습 동기부여 앱.
학생이 오프라인 문제를 풀고 결과를 입력하면 능력치(이해력/추론력/계산력)가 오르고 미션을 클리어해 레벨업하는 구조.

- 학생 최대 300명, 선생님 최대 10명 (`APP_LIMITS` in `packages/shared/src/index.ts`)
- 로그인 아이디: 핸드폰번호 11자리, 학생 초기 비밀번호: `math1234`

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
```bash
cd apps/web
npx prisma migrate dev   # 스키마 변경 후 반드시 실행
npx prisma generate      # 클라이언트 재생성
npx prisma studio        # DB 브라우저
```

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
POST /api/auth/change-password    — 본인 비밀번호 변경
GET  /api/students                — 선생님: 담당 학생 목록
POST /api/students                — 선생님: 학생 등록 (초기PW math1234 자동 설정)
POST /api/students/[id]/reset-password — 선생님: 학생 비밀번호 math1234로 초기화
POST /api/missions/results        — 학생: 미션 결과 입력 + SSE 발송
GET  /api/missions/results        — 학생: 본인 학습 이력
GET  /api/events                  — SSE 연결 엔드포인트
```

### 모바일 화면 구조

**학생 전용 앱이다.** 선생님용 화면은 웹으로 옮겼으므로 여기에 다시 만들지 않는다.
선생님 계정으로 로그인을 시도하면 로그인 화면에서 막고 웹으로 안내한다.

```
app/(auth)/login.tsx              — 핸드폰번호 로그인 (학생 계정만 통과)
app/(student)/index.tsx           — 학생 대시보드 (레벨/능력치/미션 로드맵)
app/(student)/mission.tsx         — 미션 결과 입력
app/(student)/history.tsx         — 학습 이력
app/(student)/worksheet-omr.tsx   — 배포받은 학습지 OMR 답안 제출
app/(student)/textbook-omr.tsx    — 배정받은 교재 OMR 답안 제출
app/(student)/inventory.tsx       — 보상 보관창고
app/(student)/change-password.tsx — 비밀번호 변경
```

학생 앱이 쓰는 API — 이 목록 밖의 엔드포인트는 웹 전용이다.
```
POST /api/auth/login              — 로그인
POST /api/auth/change-password    — 비밀번호 변경
GET  /api/student/progress        — 레벨·능력치·미션 진행 (홈 화면)
GET  /api/student/worksheets      — 배포받은 학습지 목록
GET  /api/student/textbooks       — 배정받은 교재 목록
POST /api/student/worksheets/[distributionId]/submit — 답안 제출 (1차 자동 채점)
POST /api/student/textbooks/[textbookId]/submit      — 교재 답안 제출
GET/POST /api/missions/results    — 학습 이력 조회 / 미션 결과 입력
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

- **ClassSchedule 의 소유자는 수업을 맡은 선생님 본인**이다. 학생·학습지·교재와 달리
  `academyTeacher()` 로 대표 계정에 몰지 않는다 (`src/lib/academy.ts` 참고).
  목록 조회는 학원 전체를 주되, 수정·삭제는 본인 수업만 (관리자는 전부).
- 수업에 붙는 학생은 `ClassScheduleStudent` 관계다. 이름 문자열은 동명이인을 가릴 수 없다.
- **한 학생이 같은 날 여러 선생님 수업을 들을 수 있다.** 그날 수업을 모을 때는 반드시
  `src/lib/dailyClasses.ts` 의 `getStudentDayClasses()` 를 거친다. ClassSchedule 을
  직접 조회하면 다른 선생님 수업이 빠져 지각 판정과 리포트가 어긋난다.
- 지각은 **연강 구간의 첫 수업** 기준으로 하루 한 번만 판정한다 (유예 5분,
  10·20·30·40·50·60분 이상 눈금). 뒤 수업 시작 시각과 맞대면 멀쩡히 온 학생이 지각이 된다.
- 하원 학습리포트(5대 항목)는 `src/lib/dailyReportAggregator.ts` 가 **날짜 단위**로 집계한다.
  수업이 여러 개여도 알림톡은 한 통이고 숫자는 합산된다. 수업 후 채점이 흔하므로
  시각이 아니라 날짜로 자르고, 채점이 들어올 때 다시 부른다 (순수 집계 — 아무것도 쓰지 않는다).

### 구현 지침
- 학원현황은 `/api/dashboard/summary` 단일 API에서 모든 집계 데이터를 가져온다
- 모달/작업 완료 후 `fetchSummary()`를 호출해 학원현황을 항상 최신 상태로 유지한다
- 새로운 기능 추가 시 summary API에 관련 집계 항목을 함께 추가한다
- SSE(`/api/events`)를 통해 학생 제출 결과는 선생님 화면에 실시간 push된다

## 정답 데이터 확장성 원칙

학습지·교재 정답과 서술형 스냅샷 이미지는 계속 쌓이면 DB가 수십~수백 GB로 커진다.
정답 관련 기능을 추가·수정할 때는 아래를 반드시 지킨다.

### 1. 큰 값은 목록/집계 쿼리에서 읽지 않는다
- 정답 이미지는 `AnswerImage` 테이블에 분리 저장하고, `Worksheet.answersJson` /
  `TextbookProblem.answer`에는 마커 `__img__`(`IMAGE_ANSWER_MARKER`)만 넣는다
- 교재 개요 API(`GET /api/textbooks/[id]`)는 문제 목록을 내려주지 않는다.
  단원/단계 트리와 집계만 주고, 문제는 `GET /api/textbooks/[id]/problems`에서 구간별로 가져간다
- 학생별 오답 번호 배열도 개요에 넣지 않는다 (개수만) — 상세는
  `GET /api/textbooks/[id]/results/[studentId]`로 학생 1명 단위 조회

### 2. 이미지는 오브젝트 스토리지로 뺄 수 있게 둔다
- `src/lib/answerImageStore.ts`가 저장 위치를 추상화한다. 정답 이미지를 직접
  `prisma.answerImage`로 읽고 쓰지 말고 반드시 이 모듈을 거친다
- `ANSWER_IMAGE_STORAGE=db`(기본)는 base64를 DB에, `supabase`는 Supabase Storage에 저장하고
  DB에는 `objectKey`만 남긴다. 조회 시 서명 URL을 돌려주므로 이미지 트래픽이 앱 서버를 거치지 않는다
- 전환 절차: Supabase → Storage → 비공개 버킷 `answer-images` 생성 → `.env`에
  `ANSWER_IMAGE_STORAGE=supabase` 설정. 기존 `db` 저장분은 그대로 계속 보인다 (혼재 가능)
- 학습지/교재 삭제 시 `purgeAnswerImages()`를 호출해 버킷 파일까지 정리한다
- 현재 용량은 학원관리 → 백업·용량(`/dashboard/manage/backup`, 관리자 전용) 또는
  `GET /api/admin/storage`에서 확인

### 3. 대량 저장은 전체 교체가 아니라 증분으로
- 교재 정답 저장(`PUT /api/textbooks/[id]/problems`)은 화면에서 바뀐 문제만 upsert한다.
  전체 삭제 후 재생성하면 3000문제에서 요청·트랜잭션이 감당되지 않는다
- 문제 수 상한: 교재 1권 `MAX_TEXTBOOK_PROBLEMS`(5000), 한 번에 저장 `PROBLEM_PAGE_SIZE_MAX`(500)
- 이미지 1장 `MAX_ANSWER_IMAGE_BYTES`(500KB), 요청당 합계 `MAX_ANSWER_IMAGE_TOTAL_BYTES`(8MB)
- 이미지는 클라이언트(`src/lib/imageCompress.ts`)에서 webp로 리사이즈·압축한 뒤 전송한다

### 4. 문제집 정답 입력 구조 — 페이지 → 구역
- `TextbookProblem`은 아래 값을 자유 입력 문자열/정수로 갖는다
  - `bookPage` — 교재 쪽번호 (0 = 미지정). **정답 입력 화면의 기본 이동 단위**
  - `majorUnit`(대단원) / `middleUnit`(중단원) / `minorUnit`(소단원)
  - `section` — 문제유형/단계. 프리셋은 `TEXTBOOK_SECTION_PRESETS`
    (A~C단계, 개념익히기, 대표문제, 필수유형, 확인 체크, 한번 더 풀기, 표현 더하기,
    이런 문제가 시험에 나온다, 중단원/대단원 마무리, 서술형 …). 목록에 없으면 직접 입력
- **구역(Block)** = 한 페이지 안에서 `(minorUnit, section)`이 같은 문제 묶음.
  화면에서는 구역별 카드로 나뉘어 머리말(페이지·소단원·유형)을 통째로 바꿀 수 있다
- 왼쪽 사이드바에서 페이지를 고르면 정답 화면도 그 페이지로 따라간다.
  `이전/다음 페이지` 버튼도 같은 동작. 소단원이 바뀌는 지점에는 구분 머리말이 들어간다
- 조회 인덱스: 페이지별은 `TextbookProblem_page_idx`, 단원/유형별은 `TextbookProblem_unit_idx`.
  필터 컬럼을 부분만 넘기면 인덱스를 제대로 못 타므로 조합을 지켜서 넘긴다
- 저장하지 않고 페이지를 옮기면 편집분이 사라지므로 이동 시 `confirmDiscard()`로 확인받는다

## Key Constraints

- `SafeAreaView`는 반드시 `react-native-safe-area-context`에서 임포트 (`react-native` 내장 버전 사용 금지)
- JSX에 `import React` 불필요 (React 17+ transform)
- `@inlevmath/shared` 타입 변경 시 모바일/웹 양쪽 영향 검토 필요
- SSE는 단일 서버 인메모리 방식 — 다중 서버 배포 시 Redis Pub/Sub으로 교체 필요
- 스키마 변경 시 `npx prisma migrate dev` 실행 필수

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
