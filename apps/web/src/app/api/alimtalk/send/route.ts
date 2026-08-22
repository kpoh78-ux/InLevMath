import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

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

  const cleanPhone = parentPhone.replace(/[^0-9]/g, '');
  const cleanSenderPhone = customSenderPhone
    ? String(customSenderPhone).replace(/[^0-9]/g, '')
    : (process.env.KAKAO_SENDER_PHONE || process.env.BIZMSG_SENDER_PHONE || '0212345678').replace(/[^0-9]/g, '');

  const byteCount = calculateEucKrBytes(message);
  const isLms = byteCount > 90;

  try {
    let bizRequestBody: any[] = [];

    const senderKey = process.env.KAKAO_SENDER_KEY || process.env.BIZMSG_PROFILE_KEY || '';
    const bizUserId = process.env.KAKAO_BIZ_USER_ID || process.env.BIZMSG_USER_ID || '';
    const senderPhone = cleanSenderPhone;
    const templateId = process.env.KAKAO_ALIMTALK_TEMPLATE_ID || 'TEMPLATE_INLEVMATH_DAILY_REPORT_01';

    if (channel === 'ALIMTALK') {
      // 1. 카카오 알림톡(AT) 발송 (미수신 시 LMS 자동 대체)
      bizRequestBody = [
        {
          message_type: 'AT',
          phn: cleanPhone,
          profile: senderKey,
          tmplId: templateId,
          msg: message,
          smsKind: 'LMS', // 알림톡 실패 시 장문 문자 자동 전환
          msgSms: message,
          smsSender: senderPhone,
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
          smsSender: senderPhone,
        },
      ];
    }

    let bizResponseData: any = null;

    if (senderKey && bizUserId) {
      // 카카오 비즈메시지 API 호출 (비즈엠 규격)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch('https://api.bizmsg.kr/v2/sender/send', {
        method: 'POST',
        headers: {
          'userId': bizUserId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(bizRequestBody),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      bizResponseData = await response.json();
    } else {
      // 개발 환경 Mock 모드
      console.log(`[BizM Mock 발송] 채널: ${channel}, 대상: ${cleanPhone}, 바이트: ${byteCount}B`);
      bizResponseData = [
        {
          code: 'success',
          msgid: `mock_${Date.now()}`,
          message: '테스트 환경 발송 성공 시뮬레이션',
        },
      ];
    }

    const isSuccess = Array.isArray(bizResponseData) && bizResponseData[0]?.code === 'success';

    // 발송 로그 DB 저장 (알림톡 vs 문자 구분 기록)
    const log = await prisma.alimtalkSendLog.create({
      data: {
        reportId: reportId && reportId !== 'MANUAL_SEND' ? reportId : null,
        studentName: studentName || user.name || '',
        parentPhone: cleanPhone,
        receiverPhone: cleanPhone,
        sendChannel: channel === 'ALIMTALK' ? 'ALIMTALK' : (isLms ? 'LMS' : 'SMS'),
        messageType: channel === 'ALIMTALK' ? 'AT' : (isLms ? 'LMS' : 'SMS'),
        templateCode: channel === 'ALIMTALK' ? templateId : null,
        messageTitle: `[InLevMath] 학습 리포트`,
        sentMessageText: message,
        messageBody: message,
        includedOptions: options || {},
        status: isSuccess ? 'SUCCESS' : 'FAILED',
        statusCode: isSuccess ? 'SUCCESS' : 'FAIL',
        responseCode: bizResponseData?.[0]?.code || '200',
        responseMessage: bizResponseData?.[0]?.message || '발송 완료',
        bizmsgMsgId: bizResponseData?.[0]?.msgid,
        resendChannel: channel === 'ALIMTALK' ? (isLms ? 'LMS' : 'SMS') : null,
      },
    });

    return NextResponse.json({
      success: true,
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
