// 선생님/관리자 권한 확인 (서버 전용)
//
// 권한 구분
//   선생님 : 학생 등록·수정, 비밀번호 초기화, 시간표, 학습지, 교재 등 대부분의 기능
//   관리자 : 위 전부 + 선생님 계정 등록·삭제 + 학생 퇴원(재원 복귀) 처리
//
// 화면에서 버튼을 숨기는 것만으로는 막을 수 없으므로 API에서 반드시 확인한다.

import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from './auth'
import { prisma } from './db'

export type TeacherAuth = {
  teacherId: string
  userId: string
  name: string
  isAdmin: boolean
}

/** 로그인한 선생님 정보. 선생님이 아니면 null */
export async function getTeacherAuth(req: NextRequest): Promise<TeacherAuth | null> {
  const auth = await getAuthUser(req)
  if (!auth || auth.role !== 'teacher') return null

  const teacher = await prisma.teacher.findUnique({
    where: { userId: auth.sub },
    select: { id: true, userId: true, isAdmin: true, user: { select: { name: true } } },
  })
  if (!teacher) return null

  return {
    teacherId: teacher.id,
    userId: teacher.userId,
    name: teacher.user.name,
    isAdmin: teacher.isAdmin,
  }
}

/** 관리자 전용 라우트 가드. 통과하면 TeacherAuth, 아니면 응답을 돌려준다 */
export async function requireAdmin(
  req: NextRequest
): Promise<{ auth: TeacherAuth } | { response: NextResponse }> {
  const auth = await getTeacherAuth(req)
  if (!auth) {
    return { response: NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 }) }
  }
  if (!auth.isAdmin) {
    return { response: NextResponse.json({ error: '관리자만 사용할 수 있는 기능입니다.' }, { status: 403 }) }
  }
  return { auth }
}