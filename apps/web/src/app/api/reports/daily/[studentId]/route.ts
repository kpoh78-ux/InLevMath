import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getTeacherAuth } from '@/lib/teacherAuth'
import { buildDailyStudentReport, formatDailyReportMessage } from '@/lib/dailyReportAggregator'
import {
  resolveReportOptions,
  readItemsFromBody,
  getTeacherPreset,
} from '@/lib/reportOptions'
import { sendDailyReport } from '@/lib/kakaoReportDispatcher'
import { getTodayDateString } from '@/lib/attendanceService'

// 학생 1명의 하루치 학습리포트 — 미리보기 / 당일 항목 조절 / 직접 발송.
//
// 여기서 바꾸는 것은 **그날 하루짜리 오버라이드**다. 상시 설정은
// /api/reports/config (선생님 프리셋)에서 바꾼다.

export const dynamic = 'force-dynamic'

function readDate(req: NextRequest): string {
  return req.nextUrl.searchParams.get('date') || getTodayDateString()
}

/** 미리보기 — 적용된 항목과 실제 발송될 문구를 그대로 돌려준다 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ studentId: string }> }
) {
  const me = await getTeacherAuth(req)
  if (!me) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const { studentId } = await params
  const date = readDate(req)

  const options = await resolveReportOptions(me.teacherId, studentId, date)
  const report = await buildDailyStudentReport(studentId, date, {
    attitude: options.attitude,
    comment: options.comment,
  })
  if (!report) return NextResponse.json({ error: '학생을 찾을 수 없습니다.' }, { status: 404 })

  return NextResponse.json({
    date,
    report,
    items: options.items,
    source: options.source,
    attitude: options.attitude,
    comment: options.comment,
    editedBy: options.editedBy,
    message: formatDailyReportMessage(report, options.items),
  })
}

/** 당일 오버라이드 저장 — 그날 하루만 유효하다 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ studentId: string }> }
) {
  const me = await getTeacherAuth(req)
  if (!me) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const { studentId } = await params
  const body = await req.json().catch(() => ({}))
  const date = typeof body?.date === 'string' && body.date ? body.date : getTodayDateString()

  const student = await prisma.student.findUnique({ where: { id: studentId }, select: { id: true } })
  if (!student) return NextResponse.json({ error: '학생을 찾을 수 없습니다.' }, { status: 404 })

  // 오버라이드를 처음 만들 때는 선생님 프리셋을 바탕으로 깐다.
  // 기본값에서 시작하면 프리셋에서 꺼 둔 항목이 되살아난다.
  const preset = await getTeacherPreset(me.teacherId)
  const patch = readItemsFromBody(body)

  const attitude = typeof body?.attitude === 'string' ? body.attitude.trim() || null : undefined
  const comment = typeof body?.comment === 'string' ? body.comment.trim() || null : undefined

  const saved = await prisma.dailyStudentReportOverride.upsert({
    where: { studentId_date: { studentId, date } },
    create: {
      studentId,
      date,
      ...preset.items,
      ...patch,
      ...(attitude === undefined ? {} : { attitude }),
      ...(comment === undefined ? {} : { comment }),
      editedBy: me.name,
    },
    update: {
      ...patch,
      ...(attitude === undefined ? {} : { attitude }),
      ...(comment === undefined ? {} : { comment }),
      editedBy: me.name,
    },
  })

  const options = await resolveReportOptions(me.teacherId, studentId, date)
  const report = await buildDailyStudentReport(studentId, date, {
    attitude: options.attitude,
    comment: options.comment,
  })

  return NextResponse.json({
    date,
    items: options.items,
    source: options.source,
    attitude: saved.attitude,
    comment: saved.comment,
    editedBy: saved.editedBy,
    message: report ? formatDailyReportMessage(report, options.items) : '',
  })
}

/** 이 학생에게 지금 바로 발송 (선생님이 직접 누른 경우 — 중복이어도 보낸다) */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ studentId: string }> }
) {
  const me = await getTeacherAuth(req)
  if (!me) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const { studentId } = await params
  const body = await req.json().catch(() => ({}))
  const date = typeof body?.date === 'string' && body.date ? body.date : getTodayDateString()

  const result = await sendDailyReport({
    teacherId: me.teacherId,
    studentId,
    date,
    force: true,
  })

  return NextResponse.json(result, { status: result.sent ? 200 : 202 })
}

/** 당일 오버라이드 되돌리기 — 선생님 프리셋으로 돌아간다 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ studentId: string }> }
) {
  const me = await getTeacherAuth(req)
  if (!me) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const { studentId } = await params
  const date = readDate(req)

  await prisma.dailyStudentReportOverride
    .delete({ where: { studentId_date: { studentId, date } } })
    .catch(() => null) // 없으면 이미 프리셋 상태다

  const options = await resolveReportOptions(me.teacherId, studentId, date)
  return NextResponse.json({ date, items: options.items, source: options.source })
}
