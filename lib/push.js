import webpush from 'web-push';
import { sql } from '@/lib/db';

let _configured = false;
function ensure() {
  if (_configured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@example.com', pub, priv);
  _configured = true;
  return true;
}

export function pushConfigured() {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export async function countSubscriptions() {
  try {
    const r = await sql`SELECT COUNT(*)::int AS c FROM push_subscriptions`;
    return r[0].c;
  } catch {
    return 0;
  }
}

// 알림 켠 모든 기기로 웹 푸시 발송. 만료된 구독은 자동 삭제.
export async function sendPushToAll(payload) {
  if (!ensure()) return { sent: 0, failed: 0, total: 0 };
  let subs;
  try {
    subs = await sql`SELECT * FROM push_subscriptions`;
  } catch {
    return { sent: 0, failed: 0, total: 0 };
  }
  const body = JSON.stringify(payload);
  let sent = 0;
  let failed = 0;

  // 느리거나 응답 없는 푸시 서비스가 전체 발송을 지연시키지 않도록 개별 타임아웃
  const withTimeout = (promise, ms) =>
    Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
    ]);

  await Promise.all(
    subs.map(async (s) => {
      try {
        await withTimeout(
          webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            body,
            { TTL: 3600 }
          ),
          8000
        );
        sent++;
      } catch (e) {
        failed++;
        // 만료/삭제된 구독만 정리 (일시적 오류는 유지)
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          await sql`DELETE FROM push_subscriptions WHERE id = ${s.id}`;
        }
      }
    })
  );
  return { sent, failed, total: subs.length };
}
