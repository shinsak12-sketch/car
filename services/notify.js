'use strict';

const crypto = require('crypto');

/**
 * 비상 알림 발송 서비스 (어댑터 방식)
 *
 * 환경변수 NOTIFY_PROVIDER 값에 따라 동작:
 *   - none   : 실제 발송하지 않고 "기록 모드"로 동작 (누구에게 무엇을 보내려 했는지 기록)
 *   - solapi : Solapi(구 CoolSMS) 문자 발송
 *
 * 새로운 서비스(네이버 SENS, 알리고 등)를 붙이려면
 * 아래 send 함수에 provider 분기를 추가하면 됩니다.
 */

const PROVIDER = (process.env.NOTIFY_PROVIDER || 'none').toLowerCase();
const SENDER = process.env.NOTIFY_SENDER || '';

function normalizePhone(p) {
  return (p || '').replace(/[^0-9]/g, '');
}

/**
 * @param {string} message  보낼 메시지
 * @param {Array<{name:string, phone:string}>} recipients  수신자 목록
 * @returns {Promise<{channel, provider, status, results:Array}>}
 */
async function send(message, recipients) {
  const valid = recipients
    .map((r) => ({ name: r.name, phone: normalizePhone(r.phone) }))
    .filter((r) => r.phone.length >= 9);

  if (PROVIDER === 'solapi' && SENDER) {
    return sendViaSolapi(message, valid);
  }

  // 기록 모드: 실제 발송 없이 성공으로 기록만 남김
  return {
    channel: 'record',
    provider: 'none',
    status: 'recorded',
    results: valid.map((r) => ({ ...r, ok: true, info: '기록 모드(실발송 안 함)' })),
    note:
      PROVIDER === 'solapi'
        ? 'NOTIFY_SENDER(발신번호)가 설정되지 않아 기록 모드로 처리했습니다.'
        : '실제 문자 발송을 원하면 .env 의 NOTIFY_PROVIDER 를 설정하세요.',
  };
}

// ─── Solapi (구 CoolSMS) ────────────────────────────────
async function sendViaSolapi(message, recipients) {
  const apiKey = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;
  if (!apiKey || !apiSecret) {
    return {
      channel: 'sms',
      provider: 'solapi',
      status: 'failed',
      results: recipients.map((r) => ({ ...r, ok: false, info: 'API 키 미설정' })),
      note: 'SOLAPI_API_KEY / SOLAPI_API_SECRET 를 .env 에 설정하세요.',
    };
  }

  const date = new Date().toISOString();
  const salt = crypto.randomBytes(32).toString('hex');
  const signature = crypto
    .createHmac('sha256', apiSecret)
    .update(date + salt)
    .digest('hex');
  const authHeader = `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;

  const messages = recipients.map((r) => ({
    to: r.phone,
    from: normalizePhone(SENDER),
    text: message,
  }));

  try {
    const resp = await fetch('https://api.solapi.com/messages/v4/send-many/detail', {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messages }),
    });
    const data = await resp.json();

    if (!resp.ok) {
      return {
        channel: 'sms',
        provider: 'solapi',
        status: 'failed',
        results: recipients.map((r) => ({ ...r, ok: false, info: data.errorMessage || '발송 실패' })),
        note: JSON.stringify(data).slice(0, 500),
      };
    }

    // Solapi 응답: groupInfo.count.registeredSuccess 등
    const failedList = (data.failedMessageList || []).map((f) => normalizePhone(f.to));
    const results = recipients.map((r) => ({
      ...r,
      ok: !failedList.includes(r.phone),
      info: failedList.includes(r.phone) ? '발송 실패' : '발송 요청됨',
    }));

    return {
      channel: 'sms',
      provider: 'solapi',
      status: results.some((r) => r.ok) ? 'sent' : 'failed',
      results,
      note: `등록 ${data.groupInfo?.count?.registeredSuccess ?? '-'}건`,
    };
  } catch (err) {
    return {
      channel: 'sms',
      provider: 'solapi',
      status: 'failed',
      results: recipients.map((r) => ({ ...r, ok: false, info: '네트워크 오류' })),
      note: String(err).slice(0, 300),
    };
  }
}

function providerInfo() {
  return {
    provider: PROVIDER,
    sender: SENDER,
    live: PROVIDER === 'solapi' && !!SENDER,
  };
}

module.exports = { send, providerInfo, normalizePhone };
