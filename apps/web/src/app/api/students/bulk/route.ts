import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'
import { getAuthUser } from '@/lib/auth'
import { APP_LIMITS } from '@inlevmath/shared'
import * as XLSX from 'xlsx'
import { academyTeacher } from '@/lib/academy'

const INITIAL_PASSWORD = process.env.STUDENT_INITIAL_PASSWORD ?? 'math1234'

const VALID_GRADES = ['초1','초2','초3','초4','초5','초6','중1','중2','중3','고1','고2','고3']

// POST /api/students/bulk — 엑셀 파일로 학생 일괄 등록
export async function POST(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user || user.role !== 'teacher') {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  }

  const teacher = await academyTeacher(user.sub)
  if (!teacher) return NextResponse.json({ error: '선생님 정보를 찾을 수 없습니다.' }, { status: 404 })

  // multipart form data에서 파일 추출
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 })

  const arrayBuffer = await file.arrayBuffer()
  const wb = XLSX.read(arrayBuffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' }) as string[][]

  // 첫 번째 행은 헤더 → 두 번째 행부터 데이터
  const dataRows = rows.slice(1).filter(r => r.some(c => String(c).trim() !== ''))

  if (dataRows.length === 0) {
    return NextResponse.json({ error: '등록할 학생 데이터가 없습니다.' }, { status: 400 })
  }

  // 현재 학생 수 확인 — 재원생만 센다 (퇴원생은 한도에서 뺀다)
  const currentCount = await prisma.student.count({
    where: { teacherId: teacher.id, status: 'active' },
  })
  if (currentCount + dataRows.length > APP_LIMITS.maxStudents) {
    return NextResponse.json({
      error: `등록 가능 학생 수를 초과합니다. (현재 ${currentCount}명 / 한도 ${APP_LIMITS.maxStudents}명 / 업로드 ${dataRows.length}명)`,
    }, { status: 409 })
  }

  const results: { row: number; name: string; status: '성공' | '실패'; reason?: string }[] = []
  const hashed = await bcrypt.hash(INITIAL_PASSWORD, 10)

  // ─── 1단계: 엑셀 전체 행 파싱 및 유효성 검사 ────────────────────────────────
  type ValidRow = {
    rowNum: number; name: string; phone: string; grade: string
    school: string; parentName: string; parentPhone: string; startDate: string
  }
  const validRows: ValidRow[] = []
  const excelPhones = new Set<string>() // 엑셀 내 중복 감지용

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i]
    const rowNum = i + 2

    const name        = String(row[0] ?? '').trim()
    const phone       = String(row[1] ?? '').replace(/\D/g, '')
    const grade       = String(row[2] ?? '').trim()
    const school      = String(row[3] ?? '').trim()
    const parentName  = String(row[4] ?? '').trim()
    const parentPhone = String(row[5] ?? '').replace(/\D/g, '')
    const startDate   = String(row[6] ?? '').trim()

    if (!name) {
      results.push({ row: rowNum, name: `(${rowNum}행)`, status: '실패', reason: '학생이름 누락' })
      continue
    }
    if (!/^\d{11}$/.test(phone)) {
      results.push({ row: rowNum, name, status: '실패', reason: '핸드폰번호가 11자리 숫자가 아닙니다' })
      continue
    }
    if (!VALID_GRADES.includes(grade)) {
      results.push({ row: rowNum, name, status: '실패', reason: `학년 형식 오류 (예: 중2, 고1) — 입력값: "${grade}"` })
      continue
    }
    if (excelPhones.has(phone)) {
      results.push({ row: rowNum, name, status: '실패', reason: `파일 내 핸드폰번호 중복 (${phone})` })
      continue
    }
    excelPhones.add(phone)
    validRows.push({ rowNum, name, phone, grade, school, parentName, parentPhone, startDate })
  }

  // ─── 2단계: DB 중복 번호 1회 조회 ────────────────────────────────────────────
  // 기존: 행마다 findUnique → 최대 N회 쿼리
  // 개선: 전체 번호를 한 번에 조회하여 Set으로 관리
  if (validRows.length > 0) {
    const phones = validRows.map(r => r.phone)
    const existingUsers = await prisma.user.findMany({
      where: { phone: { in: phones } },
      select: { phone: true },
    })
    const existingPhones = new Set(existingUsers.map(u => u.phone))

    // 중복 번호가 있는 행은 실패 처리, 나머지만 일괄 생성 대상으로 분류
    const toCreate = validRows.filter(r => {
      if (existingPhones.has(r.phone)) {
        results.push({ row: r.rowNum, name: r.name, status: '실패', reason: `핸드폰번호 중복 (${r.phone})` })
        return false
      }
      return true
    })

    // ─── 3단계: 유효 행 일괄 생성 (트랜잭션) ──────────────────────────────────
    // 기존: 행마다 user.create 순차 실행 → 최대 N회 쿼리
    // 개선: prisma.$transaction으로 한 번에 처리 (원자성 보장)
    if (toCreate.length > 0) {
      try {
        await prisma.$transaction(
          toCreate.map(r =>
            prisma.user.create({
              data: {
                name: r.name, phone: r.phone, password: hashed, role: 'student',
                student: {
                  create: {
                    teacherId: teacher.id,
                    school: r.school,
                    grade: r.grade,
                    parentName: r.parentName,
                    parentPhone: r.parentPhone,
                    startDate: r.startDate,
                  },
                },
              },
            })
          )
        )
        for (const r of toCreate) {
          results.push({ row: r.rowNum, name: r.name, status: '성공' })
        }
      } catch {
        for (const r of toCreate) {
          results.push({ row: r.rowNum, name: r.name, status: '실패', reason: 'DB 저장 오류' })
        }
      }
    }
  }

  const successCount = results.filter(r => r.status === '성공').length
  const failCount    = results.filter(r => r.status === '실패').length

  return NextResponse.json({ successCount, failCount, results })
}
