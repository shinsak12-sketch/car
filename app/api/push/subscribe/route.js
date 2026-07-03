import { sql } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { ensureSchema } from '@/lib/ensureSchema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const user = await getSession();
  if (!user) return Response.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 });

  let sub;
  try {
    sub = await request.json();
  } catch {
    return Response.json({ ok: false, error: '잘못된 요청' }, { status: 400 });
  }
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    return Response.json({ ok: false, error: '구독 정보가 올바르지 않습니다.' }, { status: 400 });
  }

  try {
    await ensureSchema();
    await sql`INSERT INTO push_subscriptions (endpoint, p256dh, auth, user_id, user_name)
      VALUES (${sub.endpoint}, ${sub.keys.p256dh}, ${sub.keys.auth}, ${user.id}, ${user.name})
      ON CONFLICT (endpoint) DO UPDATE SET user_id = ${user.id}, user_name = ${user.name}`;
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
