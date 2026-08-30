// apps/web/src/lib/kioskAuth.ts
//
// 키오스크 API 가드.
//
// ── 왜 필요했나 ─────────────────────────────────────────────────────────────
// /api/attendance/kiosk-check 와 confirm-checkout 에는 로그인 검사가 없었다.
// 입구 태블릿에 로그인이 없으니 그렇게 둔 것인데, 배포하면 누구나 부를 수 있다.
//   · kiosk-check     4자리라 1만 가지를 다 넣어 볼 수 있다. 맞으면 남의 아이
//                     등원 기록이 생기고 학부모에게 알림톡이 나간다
//   · confirm-checkout studentId 를 그대로 받는다. PIN 도 필요 없다
//
// ── 어떻게 막나 ─────────────────────────────────────────────────────────────
// **학원 로그인을 그대로 쓴다.** 별도 기기 토큰을 만들지 않는 이유:
//   · 토큰을 번들에 넣으면(NEXT_PUBLIC_*) /kiosk 를 여는 누구나 소스에서 읽는다
//     — 지금과 똑같아진다
//   · 기기에 따로 입력해 두는 방식은 관리할 비밀이 하나 더 생긴다
// 태블릿에 선생님 계정으로 한 번 로그인해 두면 토큰이 30일 유지되므로
// 운영상 부담도 거의 없다.
//
// 관리자(isAdmin)로 좁히지 않고 **선생님이면 통과**시킨다. 모두 같은 학원
// 직원이고, 아침에 태블릿이 로그아웃돼 있을 때 관리자를 기다려야 하면
// 출결 자체가 멈춘다. 더 좁히려면 아래 requireAdmin 한 줄만 켜면 된다.

import { NextRequest, NextResponse } from 'next/server'
import { getTeacherAuth } from './teacherAuth'
import { academyTeacher } from './academy'

export type KioskAuth = {
  /** 이 키오스크가 속한 학원(대표 계정) id — PIN 조회를 이 학원으로 좁힌다 */
  academyTeacherId: string
  /** 태블릿에 로그인해 둔 선생님 */
  operatorName: string
}

/**
 * 키오스크 요청을 확인한다. 통과하면 학원 id 를, 아니면 응답을 돌려준다.
 *
 * 학원 id 를 함께 넘기는 이유 — findStudentByPin 이 teacherId 를 받으면
 * PIN 조회가 그 학원 안으로 좁혀진다. 지금은 학원이 하나뿐이라 차이가 없지만,
 * 넘기지 않으면 학원이 늘어나는 순간 PIN 이 학원을 넘어 겹친다.
 */
export async function requireKiosk(
  req: NextRequest
): Promise<{ auth: KioskAuth } | { response: NextResponse }> {
  const me = await getTeacherAuth(req)
  if (!me) {
    return {
      response: NextResponse.json(
        {
          error: '키오스크를 쓰려면 선생님 계정으로 로그인해야 합니다.',
          // 화면이 로그인 안내를 띄울 수 있게 사유를 구분해 준다
          reason: 'KIOSK_LOGIN_REQUIRED',
        },
        { status: 401 }
      ),
    }
  }

  const academy = await academyTeacher(me.userId)
  if (!academy) {
    return {
      response: NextResponse.json({ error: '학원 정보를 찾을 수 없습니다.' }, { status: 404 }),
    }
  }

  return { auth: { academyTeacherId: academy.id, operatorName: me.name } }
}
