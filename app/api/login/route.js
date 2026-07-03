import bcrypt from 'bcryptjs';
import { sql } from '@/lib/db';
import { signSession, setSessionCookie } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: '잘못된 요청' }, { status: 400 });
  }
  const username = (body.username || '').trim();
  const password = body.password || '';

  let rows;
  try {
    rows = await sql`SELECT * FROM users WHERE username = ${username} AND active = true`;
  } catch (e) {
    return Response.json({ ok: false, error: 'DB 연결 오류: ' + e.message }, { status: 500 });
  }
  const user = rows[0];
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return Response.json({ ok: false, error: '아이디 또는 비밀번호가 올바르지 않습니다.' }, { status: 401 });
  }

  const token = await signSession(user);
  await setSessionCookie(token);
  return Response.json({ ok: true });
}
