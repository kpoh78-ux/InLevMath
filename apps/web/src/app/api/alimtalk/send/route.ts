import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { getBizmsgConfig, ALIMTALK_NOT_CONFIGURED } from '@/lib/kakaoBizmsg';

// EUC-KR 기준 바이트 계산 (한글 2byte, 영문/기호 1byte)
function calculateEucKrBytes(str: string): number {
  let bytes = 0;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    bytes += code > 127 ? 2 : 1;
  }
  return bytes;
}

export async function POST(req: Request) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const {
    reportId,
    parentPhone,
    studentName = '',
    message,
    channel = 'ALIMTALK',
    options,
    senderPhone: customSenderPhone,
  } = await req.json();

  if (!parentPhone || !message) {
    return NextResponse.json({ error: '전화번호와 메시지 내용은 필수입니다.' }, { status: 400 });
  }

  const config = getBizmsgConfig();
  const cleanPhone = parentPhone.replace(/[^0-9]/g, '');
  const cleanSenderPhone = customSenderPhone
    ? String(customSenderPhone).replace(/[^0-9]/g, '')
    : config.senderPhone;

  const byteCount = calculateEucKrBytes(message);
  const isLms = byteCount > 90;
  const templateId = process.env.KAKAO_ALIMTALK_TEMPLATE_ID || '';

  try {
    let bizRequestBody: any[] = [];

    if (channel === 'ALIMTALK') {
      // 1. 카카오 알림톡(AT) 발송 (미수신 시 LMS 자동 대체)
      bizRequestBody = [
        {
          message_type: 'AT',
          phn: cleanPhone,
          profile: config.senderKey,
          tmplId: templateId,
          msg: message,
          smsKind: 'LMS', // 알림톡 실패 시 장문 문자 자동 전환
          msgSms: message,
          smsSender: cleanSenderPhone,
        },
      ];
    } else {
      // 2. 일반 이동통신사 문자메시지(SMS / LMS) 직접 발송
      bizRequestBody = [
        {
          message_type: isLms ? 'LMS' : 'SMS',
          phn: cleanPhone,
          msg: message,
          title: '[InLevMath 수학학원 리포트]',
          smsSender: cleanSenderPhone,
        },
      ];
    }

    let isSuccess = false;
    let responseCode = ALIMTALK_NOT_CONFIGURED;
    let responseMessage =
      '카카오 비즈엠 인증정보(KAKAO_BIZ_USER_ID / KAKAO_SENDER_KEY)가 설정되지 않아 실제로 발송되지 않았습니다.';
    let bizmsgMsgId: string | undefined;
    let bizResponseData: any = null;

    if (!config.configured) {
      // ⚠️ 미연동 상태 — 성공으로 위장하지 않고 미발송으로 기록한다.
      console.warn(
        `[알림톡 미발송] 비즈엠 인증정보 미설정 — ${cleanPhone} 앞으로 ${channel} 발송이 이루어지지 않았습니다.`
      );
    } else if (channel === 'ALIMTALK' && !templateId) {
      responseCode = 'NO_TEMPLATE';
      responseMessage = '승인된 알림톡 템플릿 코드(KAKAO_ALIMTALK_TEMPLATE_ID)가 설정되지 않았습니다.';
      console.warn('[알림톡 미발송] 템플릿 코드 미설정');
    } else if (!cleanSenderPhone) {
      responseCode = 'NO_SENDER_PHONE';
      responseMessage = '사전등록된 발신번호(KAKAO_SENDER_PHONE)가 설정되지 않았습니다.';
      console.warn('[알림톡 미발송] 발신번호 미설정');
    } else {
      // 카카오 비즈메시지 API 호출 (비즈엠 규격)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      try {
        const response = await fetch(config.apiUrl, {
          method: 'POST',
          headers: {
            userId: config.userId,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(bizRequestBody),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          responseCode = `HTTP_${response.status}`;
          responseMessage = `비즈엠 응답 오류 (HTTP ${response.status})`;
        } else {
          bizResponseData = await response.json().catch(() => null);
          const first = Array.isArray(bizResponseData) ? bizResponseData[0] : bizResponseData;
          const code = String(first?.code ?? '');
          isSuccess = code.toLowerCase() === 'success';
          responseCode = code || 'UNKNOWN';
          responseMessage = first?.message || (isSuccess ? '발송 완료' : '비즈엠 발송 실패');
          bizmsgMsgId = first?.msgid;
        }
      } catch (err: any) {
        clearTimeout(timeoutId);
        responseCode = 'NETWORK_ERROR';
        responseMessage = err?.name === 'AbortError' ? '비즈엠 응답 시간 초과' : err?.message || '비즈엠 연결 실패';
      }
    }

    // 발송 로그 DB 저장 (알림톡 vs 문자 구분 기록)
    const log = await prisma.alimtalkSendLog.create({
      data: {
        reportId: reportId && reportId !== 'MANUAL_SEND' ? reportId : null,
        studentName: studentName || user.name || '',
        parentPhone: cleanPhone,
        receiverPhone: cleanPhone,
        sendChannel: channel === 'ALIMTALK' ? 'ALIMTALK' : (isLms ? 'LMS' : 'SMS'),
        messageType: channel === 'ALIMTALK' ? 'AT' : (isLms ? 'LMS' : 'SMS'),
        templateCode: channel === 'ALIMTALK' ? (templateId || null) : null,
        messageTitle: `[InLevMath] 학습 리포트`,
        sentMessageText: message,
        messageBody: message,
        includedOptions: options || {},
        status: isSuccess ? 'SUCCESS' : 'FAILED',
        statusCode: isSuccess ? 'SUCCESS' : 'FAIL',
        responseCode,
        responseMessage,
        bizmsgMsgId,
        resendChannel: channel === 'ALIMTALK' ? (isLms ? 'LMS' : 'SMS') : null,
      },
    });

    if (!isSuccess) {
      return NextResponse.json(
        {
          success: false,
          configured: config.configured,
          logId: log.id,
          errorCode: responseCode,
          error: responseMessage,
          result: bizResponseData,
        },
        { status: config.configured ? 502 : 503 }
      );
    }

    return NextResponse.json({
      success: true,
      configured: true,
      logId: log.id,
      channelUsed: channel,
      messageType: channel === 'ALIMTALK' ? 'AT (알림톡)' : (isLms ? 'LMS (장문문자)' : 'SMS (단문문자)'),
      result: bizResponseData,
    });
  } catch (error: any) {
    console.error('메시지 발송 중 오류:', error?.message);
    return NextResponse.json({ error: '메시지 발송 실패', details: error.message }, { status: 500 });
  }
}
