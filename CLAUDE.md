# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**InLevMath** (Infinity Level Up Math) — 오근표 수학학원 학생들을 위한 게임형 수학 학습 동기부여 앱.
학생이 오프라인 문제를 풀고 결과를 입력하면 능력치(이해력/추론력/계산력)가 오르고 미션을 클리어해 레벨업하는 구조.

- 학생 최대 300명, 선생님 최대 10명 (`APP_LIMITS` in `packages/shared/src/index.ts`)
- 로그인 아이디: 핸드폰번호 11자리, 학생 초기 비밀번호: `math1234`

## Target Platforms (초기 버전 기준 — 항상 적용)

| 앱 | 대상 플랫폼 | 실행 환경 |
|---|---|---|
| **학생용** (`apps/mobile`) | Android 스마트폰 / 태블릿 | Android OS 네이티브 앱 (Expo) |
| **선생님용** (`apps/web`) | Windows PC | Chrome 브라우저 웹 앱 |

### 개발 시 항상 적용할 제약

**학생 앱 (Android 전용):**
- iOS 지원 고려 불필요 — Android 전용 API (`ToastAndroid`, `Vibration` 등) 자유롭게 사용 가능
- 화면 크기: 스마트폰(360~420dp) + 태블릿(768~1024dp) 양쪽 고려
- 터치 인터페이스 기준으로 UI 설계 — 버튼 최소 44dp 이상
- 태블릿에서는 콘텐츠가 좌우로 너무 늘어나지 않도록 `maxWidth` 제한 권장

**선생님 웹 (Windows Chrome 전용):**
- 모바일 반응형 불필요 — 데스크탑 해상도(1280px 이상) 기준으로만 설계
- 마우스 + 키보드 인터랙션 기준으로 UI 설계 (hover 효과, 오른쪽 클릭 등 사용 가능)
- Chrome 최신 버전 기준 — 크로스브라우저 호환성 고려 불필요
- 테이블·그리드 레이아웃을 적극 활용해 많은 정보를 한 화면에 표시

## Monorepo Structure

Turborepo + npm workspaces 구성:

```
apps/mobile   — Expo 56 + Expo Router (학생용 Android 앱)
apps/web      — Next.js 16 App Router (선생님용 Windows Chrome 웹 + 백엔드 API)
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
```
app/(auth)/login.tsx              — 핸드폰번호 로그인
app/(auth)/register.tsx           — 선생님 계정 가입
app/(student)/index.tsx           — 학생 대시보드 (레벨/능력치/미션 로드맵)
app/(student)/mission.tsx         — 미션 결과 입력
app/(student)/history.tsx         — 학습 이력
app/(student)/change-password.tsx — 비밀번호 변경
app/(teacher)/index.tsx           — 선생님 대시보드 (실시간 SSE 알림)
app/(teacher)/students.tsx        — 학생 관리 (등록/검색/비밀번호 초기화)
```

## 메뉴 간 데이터 연결 원칙

**모든 메뉴는 실시간으로 연결되어야 한다.** 한 화면에서 데이터를 변경하면 관련된 다른 화면에도 즉시 반영된다.

| 데이터 | 원천 메뉴 | 연결된 메뉴 |
|---|---|---|
| 학생 등록/수정 | 학생관리 | 학원현황(학생 현황), 수업준비(배포 대상), 주간시간표(학생 명단) |
| 학습지 등록/정답 설정 | 학습지 | 학원현황(정답 설정 현황), 수업준비(배포 목록) |
| 학습지 배포 | 수업준비 | 학원현황(배포 현황), 학생 앱(배포된 학습지 목록) |
| 채점 결과 제출 | 학생 앱(채점 입력) | 학원현황(채점 완료 건수), 학생 능력치, 학생관리(상세) |
| 주간시간표 입력 | 학원현황(주간시간표 모달) | 학원현황(오늘의 수업) |

### 구현 지침
- 학원현황은 `/api/dashboard/summary` 단일 API에서 모든 집계 데이터를 가져온다
- 모달/작업 완료 후 `fetchSummary()`를 호출해 학원현황을 항상 최신 상태로 유지한다
- 새로운 기능 추가 시 summary API에 관련 집계 항목을 함께 추가한다
- SSE(`/api/events`)를 통해 학생 제출 결과는 선생님 화면에 실시간 push된다

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
```

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
