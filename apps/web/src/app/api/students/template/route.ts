import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import * as XLSX from 'xlsx'

// GET /api/students/template — 학생 일괄 등록용 엑셀 템플릿 다운로드
export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user || user.role !== 'teacher') {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  }

  const headers = [
    '학생이름*', '핸드폰번호*', '학년*',
    '학교명', '보호자이름', '보호자연락처', '수업시작일(YYYY-MM-DD)',
  ]

  const example = [
    ['홍길동', '01012345678', '중2', '오성중학교', '홍부모', '01098765432', '2026-03-02'],
    ['김철수', '01087654321', '고1', '한빛고등학교', '', '', ''],
  ]

  const ws = XLSX.utils.aoa_to_sheet([headers, ...example])

  // 열 너비 설정
  ws['!cols'] = [
    { wch: 12 }, { wch: 16 }, { wch: 8 },
    { wch: 16 }, { wch: 12 }, { wch: 16 }, { wch: 22 },
  ]

  // 헤더 스타일 (xlsx는 기본 스타일 미지원, 주석으로 안내)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '학생명단')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="students_template.xlsx"',
    },
  })
}
