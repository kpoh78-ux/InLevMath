import { SignJWT, jwtVerify } from 'jose'
import { NextRequest } from 'next/server'

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'inlevmath-dev-secret-change-in-production'
)

export interface JWTPayload {
  sub: string       // userId
  role: 'student' | 'teacher'
  name: string
  email: string
}

export async function signToken(payload: JWTPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30d')
    .sign(SECRET)
}

export async function verifyToken(token: string): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, SECRET)
  return payload as unknown as JWTPayload
}

export async function getAuthUser(req: NextRequest): Promise<JWTPayload | null> {
  const header = req.headers.get('authorization')
  if (!header?.startsWith('Bearer ')) return null
  try {
    return await verifyToken(header.slice(7))
  } catch {
    return null
  }
}
