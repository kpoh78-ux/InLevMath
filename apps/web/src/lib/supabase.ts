import { createClient, SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────
// Supabase 클라이언트 지연 초기화(lazy initialization)
//
// 이전에는 이 파일을 import하는 순간(= next build 시점) 환경변수를
// 읽고, 없으면 throw 해서 빌드 자체가 실패했습니다.
// 이제는 클라이언트를 "실제로 처음 사용하는 시점"(런타임)에 만들기
// 때문에, 빌드 환경에 Supabase 환경변수가 없어도 빌드가 성공합니다.
// 환경변수는 서버가 실행될 때(Railway 배포 환경)만 있으면 됩니다.
// ─────────────────────────────────────────────────────────────

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `Supabase 환경변수 ${name}가 설정되지 않았습니다. ` +
      '(필요 변수: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY)'
    )
  }
  return value
}

let adminClient: SupabaseClient | null = null
let anonClient: SupabaseClient | null = null

// 서버 전용 Admin 클라이언트 — RLS 우회, 관리 작업용
function getSupabaseAdmin(): SupabaseClient {
  if (!adminClient) {
    adminClient = createClient(
      requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
      requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { autoRefreshToken: false, persistSession: false } },
    )
  }
  return adminClient
}

// 사용자 JWT 발급용 클라이언트 — anon key로 signInWithPassword 호출
function getSupabaseAnon(): SupabaseClient {
  if (!anonClient) {
    anonClient = createClient(
      requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
      requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
      { auth: { autoRefreshToken: false, persistSession: false } },
    )
  }
  return anonClient
}

// 기존 코드(supabaseAdmin.auth... 형태)를 그대로 쓸 수 있도록
// Proxy로 감쌉니다. 속성에 처음 접근하는 순간 클라이언트가 생성됩니다.
function lazyProxy(getClient: () => SupabaseClient): SupabaseClient {
  return new Proxy({} as SupabaseClient, {
    get(_target, prop) {
      const client = getClient()
      const value = Reflect.get(client, prop)
      return typeof value === 'function' ? value.bind(client) : value
    },
  })
}

export const supabaseAdmin = lazyProxy(getSupabaseAdmin)
export const supabaseAnon = lazyProxy(getSupabaseAnon)

// 핸드폰번호 → Supabase Auth 이메일 형식 변환
export const phoneToEmail = (phone: string) => `${phone}@inlevmath.local`
