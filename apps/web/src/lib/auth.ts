import { createHmac } from 'crypto'
import { NextRequest } from 'next/server'
import { supabaseAdmin, supabaseAnon, phoneToEmail } from './supabase'
import { prisma } from './db'

export interface JWTPayload {
  sub: string       // Prisma User.id
  role: 'student' | 'teacher'
  name: string
  phone: string
}

// Supabase Auth 전용 비밀번호 — 사용자가 직접 사용하지 않음, 서버만 알고 있음
function computeSupabasePassword(userId: string): string {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET 환경변수가 설정되지 않았습니다.')
  return createHmac('sha256', secret).update(`supa_${userId}`).digest('hex')
}

// Supabase Auth에 사용자 계정이 없으면 생성하고 supabaseId를 DB에 저장
export async function ensureSupabaseUser(userId: string, phone: string): Promise<string> {
  const existing = await prisma.user.findUnique({ where: { id: userId }, select: { supabaseId: true } })
  if (existing?.supabaseId) return existing.supabaseId

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: phoneToEmail(phone),
    password: computeSupabasePassword(userId),
    email_confirm: true,
  })
  if (error) throw new Error(`Supabase Auth 사용자 생성 실패: ${error.message}`)

  await prisma.user.update({ where: { id: userId }, data: { supabaseId: data.user.id } })
  return data.user.id
}

// Supabase Auth로 로그인하여 access_token(JWT) 반환
export async function signInWithSupabase(userId: string, phone: string): Promise<string> {
  await ensureSupabaseUser(userId, phone)

  const { data, error } = await supabaseAnon.auth.signInWithPassword({
    email: phoneToEmail(phone),
    password: computeSupabasePassword(userId),
  })
  if (error) throw new Error(`Supabase 로그인 실패: ${error.message}`)

  return data.session.access_token
}

// Supabase JWT 검증 후 Prisma User 정보 반환 (기존 verifyToken 시그니처 호환 유지)
export async function verifyToken(token: string): Promise<JWTPayload> {
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) throw new Error('유효하지 않은 토큰입니다.')

  const prismaUser = await prisma.user.findUnique({ where: { supabaseId: user.id } })
  if (!prismaUser) throw new Error('사용자를 찾을 수 없습니다.')

  return {
    sub: prismaUser.id,
    role: prismaUser.role as 'student' | 'teacher',
    name: prismaUser.name,
    phone: prismaUser.phone,
  }
}

// Authorization 헤더에서 Bearer 토큰 추출 후 검증
export async function getAuthUser(req: NextRequest): Promise<JWTPayload | null> {
  const header = req.headers.get('authorization')
  if (!header?.startsWith('Bearer ')) return null
  try {
    return await verifyToken(header.slice(7))
  } catch {
    return null
  }
}
