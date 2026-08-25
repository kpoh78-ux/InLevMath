/**
 * 카카오 비즈엠(Bizmsg) 알림톡 및 SMS 발송 모듈
 *
 * ⚠️ 현재 상태: 비즈엠 계정·발신프로필·승인 템플릿이 준비되지 않아 실제 발송은 되지 않는다.
 * 인증정보가 없으면 절대 성공으로 처리하지 않고 `NOT_CONFIGURED` 실패를 돌려준다.
 * (예전 구현은 발송 여부와 무관하게 항상 success: true를 반환해 "발송완료"로 잘못 기록됐다)
 */

export const ALIMTALK_NOT_CONFIGURED = 'NOT_CONFIGURED';

export interface BizmsgConfig {
  userId: string;
  senderKey: string;
  senderPhone: string;
  apiUrl: string;
  configured: boolean;
}

/** .env에서 비즈엠 인증정보를 읽는다. userId + senderKey가 둘 다 있어야 발송 가능. */
export function getBizmsgConfig(): BizmsgConfig {
  const userId = process.env.KAKAO_BIZ_USER_ID || process.env.BIZMSG_USER_ID || '';
  const senderKey = process.env.KAKAO_SENDER_KEY || process.env.BIZMSG_PROFILE_KEY || '';
  const senderPhone = (process.env.KAKAO_SENDER_PHONE || process.env.BIZMSG_SENDER_PHONE || '').replace(/[^0-9]/g, '');
  const apiUrl = process.env.BIZMSG_API_URL || 'https://api.bizmsg.kr/v2/sender/send';

  return {
    userId,
    senderKey,
    senderPhone,
    apiUrl,
    configured: Boolean(userId && senderKey),
  };
}

export function isAlimtalkConfigured(): boolean {
  return getBizmsgConfig().configured;
}

export interface SendKakaoAlimtalkParams {
  templateCode: string;
  recipientPhone: string;
  /** 템플릿 치환 변수. 실제 발송 시 승인된 템플릿 본문과 함께 사용된다. */
  variables: Record<string, string>;
  /** 발송할 메시지 본문. 없으면 variables만으로는 발송할 수 없다. */
  message?: string;
  fallbackSms?: boolean;
}

export interface SendKakaoAlimtalkResult {
  success: boolean;
  /** 미발송이면 null */
  messageId: string | null;
  /** 실제 발송된 건만 과금. 미발송·실패는 0원 */
  cost: number;
  channel: 'ALIMTALK' | 'SMS' | 'LMS' | 'NONE';
  sentAt: string;
  configured: boolean;
  error?: string;
  errorMessage?: string;
}

function notSent(error: string, errorMessage: string, configured: boolean): SendKakaoAlimtalkResult {
  return {
    success: false,
    messageId: null,
    cost: 0,
    channel: 'NONE',
    sentAt: new Date().toISOString(),
    configured,
    error,
    errorMessage,
  };
}

export async function sendKakaoAlimtalk(params: SendKakaoAlimtalkParams): Promise<SendKakaoAlimtalkResult> {
  const { templateCode, recipientPhone, variables, message } = params;
  const config = getBizmsgConfig();
  const cleanPhone = (recipientPhone || '').replace(/[^0-9]/g, '');

  if (!cleanPhone) {
    return notSent('INVALID_PHONE', '수신 번호가 없습니다.', config.configured);
  }

  if (!config.configured) {
    console.warn(
      `[알림톡 미발송] 비즈엠 인증정보 미설정 — 템플릿 ${templateCode} / 수신 ${cleanPhone} 건이 발송되지 않았습니다. ` +
        `.env에 KAKAO_BIZ_USER_ID, KAKAO_SENDER_KEY를 설정하세요.`
    );
    return notSent(
      ALIMTALK_NOT_CONFIGURED,
      '카카오 비즈엠 인증정보(KAKAO_BIZ_USER_ID / KAKAO_SENDER_KEY)가 설정되지 않아 실제로 발송되지 않았습니다.',
      false
    );
  }

  const body = message || '';
  if (!body) {
    return notSent('EMPTY_MESSAGE', '발송할 메시지 본문이 없습니다.', true);
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(config.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        userId: config.userId,
      },
      body: JSON.stringify([
        {
          message_type: 'AT',
          phn: cleanPhone,
          profile: config.senderKey,
          tmplId: templateCode,
          msg: body,
          smsKind: 'LMS',
          msgSms: body,
          smsSender: config.senderPhone,
          ...(Object.keys(variables || {}).length > 0 ? { variables } : {}),
        },
      ]),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      console.warn(`[알림톡 실패] 비즈엠 HTTP ${res.status}`);
      return notSent('HTTP_ERROR', `비즈엠 응답 오류 (HTTP ${res.status})`, true);
    }

    const data = await res.json().catch(() => null);
    const first = Array.isArray(data) ? data[0] : data;
    const code = String(first?.code ?? '');
    const ok = code.toLowerCase() === 'success';

    if (!ok) {
      console.warn(`[알림톡 실패] 비즈엠 응답 코드 ${code}: ${first?.message ?? ''}`);
      return notSent(code || 'SEND_FAILED', first?.message || '비즈엠 발송 실패', true);
    }

    return {
      success: true,
      messageId: first?.msgid ?? null,
      cost: 6.5, // 알림톡 6.5원
      channel: 'ALIMTALK',
      sentAt: new Date().toISOString(),
      configured: true,
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.warn('[알림톡 실패] 네트워크 오류:', detail);
    return notSent('NETWORK_ERROR', detail || '비즈엠 서버 연결 실패', true);
  }
}
