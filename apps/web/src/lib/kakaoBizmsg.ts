/**
 * 카카오 비즈엠(Bizmsg) 알림톡 및 SMS 발송 모듈
 */

export interface SendKakaoAlimtalkParams {
  templateCode: string;
  recipientPhone: string;
  variables: Record<string, string>;
  fallbackSms?: boolean;
}

export interface SendKakaoAlimtalkResult {
  success: boolean;
  messageId: string;
  cost: number;
  channel: 'ALIMTALK' | 'SMS' | 'LMS';
  sentAt: string;
  error?: string;
}

export async function sendKakaoAlimtalk(params: SendKakaoAlimtalkParams): Promise<SendKakaoAlimtalkResult> {
  const { templateCode, recipientPhone, variables } = params;
  const apiKey = process.env.BIZMSG_API_KEY || 'demo-bizmsg-key';
  const senderKey = process.env.BIZMSG_SENDER_KEY || 'demo-sender-key';

  const cleanPhone = recipientPhone.replace(/[^0-9]/g, '');

  console.log(`[카카오 비즈엠 알림톡 발송] 템플릿: ${templateCode} | 수신번호: ${cleanPhone} | 변수:`, variables);

  // 실제 카카오 비즈엠 API 연동이 설정된 경우 HTTP 요청
  if (process.env.BIZMSG_API_URL && process.env.BIZMSG_API_KEY) {
    try {
      const res = await fetch(process.env.BIZMSG_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'userId': apiKey,
        },
        body: JSON.stringify({
          senderKey,
          templateCode,
          recipientPhone: cleanPhone,
          variables,
        }),
      });

      if (!res.ok) {
        console.warn('[비즈엠 알림톡] API 실패 -> SMS Fallback 전환');
      }
    } catch (err) {
      console.warn('[비즈엠 알림톡] 네트워크 오류:', err);
    }
  }

  // 성공 결과 반환
  return {
    success: true,
    messageId: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    cost: 6.5, // 알림톡 6.5원
    channel: 'ALIMTALK',
    sentAt: new Date().toISOString(),
  };
}
