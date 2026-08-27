import { createHmac } from 'crypto'
import { NextRequest } from 'next/server'
import { SignJWT, jwtVerify } from 'jose'
import { LRUCache } from 'lru-cache'
import { supabaseAdmin, supabaseAnon, phoneToEmail } from './supabase'
import { prisma } from './db'

export interface JWTPayload {
  id?: string       // Prisma User.id (sub의 alias)
  sub: string       // Prisma User.id
  role: 'student' | 'teacher'
  name: string
  phone: string
}

// ─── 초고속 인메모리 토큰 검증 캐시 (LRU) ──────────────────────────────────────────
// 60초 TTL, 최대 5,000명 동시 토큰 인메모리 캐시 (캐시 적중 시 0.1ms 미만 즉시 반환)
const tokenUserCache = new LRUCache<string, JWTPayload>({
  max: 5000,
  ttl: 1000 * 60, // 60초 캐싱 (보안과 성능 최적 균형)
  allowStale: false,
})

function jwtSecret() {
  return new TextEncoder().encode(process.env.JWT_SECRET!)
}

async function signLocalJWT(userId: string, phone: string): Promise<string> {
  return new SignJWT({ sub: userId, phone })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .sign(jwtSecret())
}

async function verifyLocalJWT(token: string): Promise<{ sub: string; phone: string } | null> {
  try {
    const { payload } = await jwtVerify(token, jwtSecret())
    if (typeof payload.sub === 'string' && typeof payload.phone === 'string') {
      return { sub: payload.sub, phone: payload.phone as string }
    }
    return null
  } catch {
    return null
  }
}

// Supabase Auth 전용 비밀번호 — 서버 전용 해시
function computeSupabasePassword(userId: string): string {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET 환경변수가 설정되지 않았습니다.')
  return createHmac('sha256', secret).update(`supa_${userId}`).digest('hex')
}

// Supabase Auth에 사용자 계정이 없으면 생성하고 supabaseId를 DB에 저장
export async function ensureSupabaseUser(userId: string, phone: string): Promise<string> {
  const existing = await prisma.user.findUnique({ where: { id: userId }, select: { supabaseId: true } })
  if (existing?.supabaseId) return existing.supabaseId

  const email = phoneToEmail(phone)
  const password = computeSupabasePassword(userId)

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  let supabaseUserId: string

  if (error) {
    if (!error.message.includes('already been registered') && !error.message.includes('already registered')) {
      throw new Error(`Supabase Auth 사용자 생성 실패: ${error.message}`)
    }
    const { data: list, error: listError } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })
    if (listError) throw new Error(`Supabase 사용자 조회 실패: ${listError.message}`)
    const found = list.users.find(u => u.email === email)
    if (!found) throw new Error('Supabase Auth에서 기존 계정을 찾을 수 없습니다.')
    supabaseUserId = found.id
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(supabaseUserId, { password })
    if (updateError) throw new Error(`Supabase 비밀번호 업데이트 실패: ${updateError.message}`)
  } else {
    supabaseUserId = data.user.id
  }

  await prisma.user.update({ where: { id: userId }, data: { supabaseId: supabaseUserId } })
  return supabaseUserId
}

/**
 * 로그인 아이디(핸드폰번호)를 바꿨을 때 Supabase Auth 이메일도 같이 옮긴다.
 *
 * Supabase 계정의 이메일은 phoneToEmail(phone) 로 만들어져 있다. 번호만 바꾸고
 * 여기를 두면 signInWithSupabase 가 새 번호로 만든 이메일을 찾지 못해 매번
 * 로컬 JWT 폴백으로 떨어진다 (로그인은 되지만 조용히 반쪽이 된다).
 *
 * Supabase 가 막혀 있어도 번호 변경 자체는 성공으로 둔다 — 폴백이 있어
 * 로그인은 계속 되고, 다음에 다시 맞출 수 있다.
 */
export async function syncSupabaseEmail(userId: string, newPhone: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { supabaseId: true } })
  if (!user?.supabaseId) return true // 아직 Supabase 계정이 없으면 다음 로그인 때 새 번호로 만들어진다

  try {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(user.supabaseId, {
      email: phoneToEmail(newPhone),
      email_confirm: true,
    })
    if (error) throw new Error(error.message)
    return true
  } catch (e) {
    console.warn('[auth] Supabase 이메일 변경 실패 — 로컬 JWT로 로그인합니다:',
      e instanceof Error ? e.message : e)
    return false
  }
}

// Supabase Auth로 로그인하여 access_token(JWT) 반환. Supabase 불가 시 로컬 JWT 폴백
export async function signInWithSupabase(userId: string, phone: string): Promise<string> {
  try {
    await ensureSupabaseUser(userId, phone)
    const { data, error } = await supabaseAnon.auth.signInWithPassword({
      email: phoneToEmail(phone),
      password: computeSupabasePassword(userId),
    })
    if (error) throw new Error(`Supabase 로그인 실패: ${error.message}`)
    return data.session.access_token
  } catch (e: any) {
    console.warn('[auth] Supabase 오류 — 로컬 JWT 폴백:', e?.message)
    return signLocalJWT(userId, phone)
  }
}

// Supabase JWT 검증 후 Prisma User 정보 반환. 실패 시 로컬 JWT 폴백
export async function verifyToken(token: string): Promise<JWTPayload> {
  // 1. 메모리 캐시 적중 시 즉시 반환 (0.1ms 미만)
  const cached = tokenUserCache.get(token)
  if (cached) return cached

  // 2. 로컬 JWT 우선 시도 (Supabase 불가 환경 대응)
  const local = await verifyLocalJWT(token)
  if (local) {
    const prismaUser = await prisma.user.findUnique({ where: { id: local.sub } })
    if (prismaUser) {
      const payload: JWTPayload = {
        id: prismaUser.id,
        sub: prismaUser.id,
        role: prismaUser.role as 'student' | 'teacher',
        name: prismaUser.name,
        phone: prismaUser.phone,
      }
      tokenUserCache.set(token, payload)
      return payload
    }
  }

  // 3. Supabase 외부 검증 수행 (캐시 미스 시에만 실행)
  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
    if (error || !user) throw new Error('유효하지 않은 토큰입니다.')
    const prismaUser = await prisma.user.findUnique({ where: { supabaseId: user.id } })
    if (!prismaUser) throw new Error('사용자를 찾을 수 없습니다.')
    const payload: JWTPayload = {
      id: prismaUser.id,
      sub: prismaUser.id,
      role: prismaUser.role as 'student' | 'teacher',
      name: prismaUser.name,
      phone: prismaUser.phone,
    }
    tokenUserCache.set(token, payload)
    return payload
  } catch (e: any) {
    throw new Error('유효하지 않은 토큰입니다.')
  }
}

/** 로그아웃 또는 역할 변경 시 해당 토큰의 캐시를 즉시 무효화 */
export function invalidateTokenCache(token: string): void {
  tokenUserCache.delete(token)
}

/** Authorization 헤더에서 Bearer 토큰 추출 후 검증 (NextRequest / Request 공용) */
export async function getAuthUser(req: NextRequest | Request): Promise<JWTPayload | null> {
  const header = req.headers.get('authorization') || req.headers.get('Authorization')
  if (!header?.startsWith('Bearer ')) return null
  const token = header.split(' ')[1]
  if (!token) return null
  try {
    return await verifyToken(token)
  } catch {
    return null
  }
}

/** getCurrentUser 별칭 지원 (Request 호환) */
export const getCurrentUser = getAuthUser
