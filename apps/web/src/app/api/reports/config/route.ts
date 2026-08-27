import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getTeacherAuth } from '@/lib/teacherAuth'
import {
  getTeacherPreset,
  readItemsFromBody,
  REPORT_ITEM_META,
  REPORT_ITEM_KEYS,
} from '@/lib/reportOptions'
import { isAlimtalkConfigured } from '@/lib/kakaoBizmsg'

// 하원 학습리포트에 무엇을 담을지 — 선생님별 프리셋.
//
// 학원 공용이 아니라 로그인한 선생님 본인 것이다. 담임마다 학부모에게 알리는
// 항목이 다르고, 남의 설정을 말없이 바꾸면 누가 왜 바꿨는지 따라갈 수 없다.

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const me = await getTeacherAuth(req)
  if (!me) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const preset = await getTeacherPreset(me.teacherId)

  return NextResponse.json({
    items: preset.items,
    autoSendOnCheckOut: preset.autoSendOnCheckOut,
    /** 아직 저장한 적이 없으면 기본값을 보고 있는 것이다 */
    saved: preset.exists,
    meta: REPORT_ITEM_META,
    order: REPORT_ITEM_KEYS,
    /** 카카오 미연동이면 저장은 되지만 실제 발송은 되지 않는다 */
    alimtalkConfigured: isAlimtalkConfigured(),
  })
}

export async function PUT(req: NextRequest) {
  const me = await getTeacherAuth(req)
  if (!me) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const items = readItemsFromBody(body)
  const autoSend = typeof body?.autoSendOnCheckOut === 'boolean' ? body.autoSendOnCheckOut : undefined

  const row = await prisma.attendanceNotificationConfig.upsert({
    where: { teacherId: me.teacherId },
    create: {
      teacherId: me.teacherId,
      ...items,
      ...(autoSend === undefined ? {} : { autoSendOnCheckOut: autoSend }),
    },
    update: {
      ...items,
      ...(autoSend === undefined ? {} : { autoSendOnCheckOut: autoSend }),
    },
  })

  const preset = await getTeacherPreset(me.teacherId)
  return NextResponse.json({
    items: preset.items,
    autoSendOnCheckOut: row.autoSendOnCheckOut,
    saved: true,
  })
}
