import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'
import { getAuthUser } from '@/lib/auth'
import { APP_LIMITS } from '@inlevmath/shared'
import { academyTeacher } from '@/lib/academy'

const INITIAL_PASSWORD = process.env.STUDENT_INITIAL_PASSWORD ?? 'math1234'

// GET /api/students — 선생님이 학원 학생 목록 조회
// ?sidebar=1           : 사이드바 전용 경량 응답 (id·grade·name 3개 필드만, results 조인 없음)
// ?includeWithdrawn=1  : 퇴원 학생까지 포함 (학생관리 화면의 재원/퇴원 탭 전용)
//                        기본값은 재원 학생만 — 현황·배포·보상 등 모든 화면에서 퇴원 학생이 빠진다
export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user || user.role !== 'teacher') {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  }

  const teacher = await academyTeacher(user.sub)
  if (!teacher) return NextResponse.json({ error: '선생님 정보를 찾을 수 없습니다.' }, { status: 404 })

  // 사이드바는 id·grade·name 3개 필드만 필요 — results(최근 5건) 조인 생략
  const isSidebar = req.nextUrl.searchParams.get('sidebar') === '1'
  const includeWithdrawn = req.nextUrl.searchParams.get('includeWithdrawn') === '1'

  if (isSidebar) {
    const today = new Date().toLocaleDateString('sv-SE');
    const students = await prisma.student.findMany({
      where: { teacherId: teacher.id, status: 'active' },
      select: {
        id: true,
        grade: true,
        attendancePin: true,
        user: { select: { name: true, phone: true } },
        attendanceLogs: {
          where: { date: today },
          select: { type: true, status: true, checkInTime: true, checkOutTime: true },
          take: 1,
        },
      },
      orderBy: { grade: 'asc' },
    })
    return NextResponse.json(students)
  }

  const students = await prisma.student.findMany({
    where: {
      teacherId: teacher.id,
      ...(includeWithdrawn ? {} : { status: 'active' }),
    },
    include: {
      user: { select: { id: true, name: true, phone: true, createdAt: true } },
      results: { orderBy: { createdAt: 'desc' }, take: 5 },
    },
    orderBy: { currentLevel: 'desc' },
  })

  return NextResponse.json(students)
}

// POST /api/students — 선생님이 학생 등록 (초기 비밀번호: math1234)
export async function POST(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user || user.role !== 'teacher') {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  }

  const { name, phone, school, grade, parentName, parentPhone, startDate } = await req.json()

  if (!name || !phone || !grade) {
    return NextResponse.json({ error: '이름, 핸드폰번호, 학년을 모두 입력하세요.' }, { status: 400 })
  }

  if (!/^\d{11}$/.test(phone)) {
    return NextResponse.json({ error: '핸드폰번호는 11자리 숫자로 입력하세요.' }, { status: 400 })
  }

  const teacher = await academyTeacher(user.sub)
  if (!teacher) return NextResponse.json({ error: '선생님 정보를 찾을 수 없습니다.' }, { status: 404 })

  // 학생 수 한도 확인 — 재원생만 센다.
  // 퇴원생까지 세면 몇 해 지나 학생이 50명뿐인 학원도 등록이 막힌다.
  const studentCount = await prisma.student.count({
    where: { teacherId: teacher.id, status: 'active' },
  })
  if (studentCount >= APP_LIMITS.maxStudents) {
    return NextResponse.json({ error: `학생 등록 한도(${APP_LIMITS.maxStudents}명)를 초과했습니다.` }, { status: 409 })
  }

  // 핸드폰번호 중복 확인
  const existing = await prisma.user.findUnique({ where: { phone } })
  if (existing) {
    return NextResponse.json({ error: '이미 등록된 핸드폰번호입니다.' }, { status: 409 })
  }

  const hashed = await bcrypt.hash(INITIAL_PASSWORD, 10)

  const newUser = await prisma.user.create({
    data: {
      name, phone, password: hashed, role: 'student',
      student: {
        create: {
          teacherId: teacher.id,
          school: school ?? '',
          grade,
          parentName: parentName ?? '',
          parentPhone: parentPhone ?? '',
          startDate: startDate ?? '',
        },
      },
    },
    include: { student: true },
  })

  return NextResponse.json(
    {
      id: newUser.student!.id,
      name: newUser.name,
      phone: newUser.phone,
      school: newUser.student!.school,
      grade: newUser.student!.grade,
      parentName: newUser.student!.parentName,
      parentPhone: newUser.student!.parentPhone,
      startDate: newUser.student!.startDate,
      message: '학생 등록 완료. 초기 비밀번호는 관리자에게 문의하세요.',
    },
    { status: 201 }
  )
}
