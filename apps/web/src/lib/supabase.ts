import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !serviceKey || !anonKey) {
  throw new Error('Supabase 환경변수(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY)가 설정되지 않았습니다.')
}

// 서버 전용 Admin 클라이언트 — RLS 우회, 관리 작업용
export const supabaseAdmin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// 사용자 JWT 발급용 클라이언트 — anon key로 signInWithPassword 호출
export const supabaseAnon = createClient(url, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// 핸드폰번호 → Supabase Auth 이메일 형식 변환
export const phoneToEmail = (phone: string) => `${phone}@inlevmath.local`
