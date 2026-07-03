import crypto from 'crypto';

// 비상 알림 발송 서비스 (어댑터 방식)
//   NOTIFY_PROVIDER = none  → 실제 발송 없이 "기록 모드"
//   NOTIFY_PROVIDER = solapi → Solapi(구 CoolSMS) SMS 발송

export function normalizePhone(p) {
  return (p || '').replace(/[^0-9]/g, '');
}

export function providerInfo() {
  const provider = (process.env.NOTIFY_PROVIDER || 'none').toLowerCase();
  const sender = process.env.NOTIFY_SENDER || '';
  return { provider, sender, live: provider === 'solapi' && !!sender };
}

export async function send(message, recipients) {
  const { provider, sender } = providerInfo();
  const valid = recipients
    .map((r) => ({ name: r.name, phone: normalizePhone(r.phone) }))
    .filter((r) => r.phone.length >= 9);

  if (provider === 'solapi' && sender) {
    return sendViaSolapi(message, valid, sender);
  }

  return {
    channel: 'record',
    provider: 'none',
    status: 'recorded',
    results: valid.map((r) => ({ ...r, ok: true, info: '기록 모드(실발송 안 함)' })),
    note:
      provider === 'solapi'
        ? 'NOTIFY_SENDER(발신번호)가 없어 기록 모드로 처리했습니다.'
        : '실제 문자 발송을 원하면 환경변수 NOTIFY_PROVIDER 를 설정하세요.',
  };
}

async function sendViaSolapi(message, recipients, sender) {
  const apiKey = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;
  if (!apiKey || !apiSecret) {
    return {
      channel: 'sms',
      provider: 'solapi',
      status: 'failed',
      results: recipients.map((r) => ({ ...r, ok: false, info: 'API 키 미설정' })),
      note: 'SOLAPI_API_KEY / SOLAPI_API_SECRET 를 설정하세요.',
    };
  }

  const date = new Date().toISOString();
  const salt = crypto.randomBytes(32).toString('hex');
  const signature = crypto.createHmac('sha256', apiSecret).update(date + salt).digest('hex');
  const auth = `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;

  const messages = recipients.map((r) => ({ to: r.phone, from: normalizePhone(sender), text: message }));

  try {
    const resp = await fetch('https://api.solapi.com/messages/v4/send-many/detail', {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      return {
        channel: 'sms',
        provider: 'solapi',
        status: 'failed',
        results: recipients.map((r) => ({ ...r, ok: false, info: data.errorMessage || '발송 실패' })),
        note: JSON.stringify(data).slice(0, 400),
      };
    }
    const failed = (data.failedMessageList || []).map((f) => normalizePhone(f.to));
    const results = recipients.map((r) => ({
      ...r,
      ok: !failed.includes(r.phone),
      info: failed.includes(r.phone) ? '발송 실패' : '발송 요청됨',
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
