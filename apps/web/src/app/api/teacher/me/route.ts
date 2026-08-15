import { NextRequest, NextResponse } from 'next/server'
import { getTeacherAuth } from '@/lib/teacherAuth'

// GET /api/teacher/me — 로그인한 선생님 정보 (화면에서 관리자 기능 노출 판단용)
export async function GET(req: NextRequest) {
  const auth = await getTeacherAuth(req)
  if (!auth) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  return NextResponse.json({
    teacherId: auth.teacherId,
    name: auth.name,
    isAdmin: auth.isAdmin,
  })
}