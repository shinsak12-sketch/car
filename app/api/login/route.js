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
  // status 컬럼이 있고 pending 이면 승인 대기 (컬럼이 없던 기존 DB 는 통과)
  if (user.status && user.status !== 'active') {
    return Response.json(
      { ok: false, error: '아직 관리자 승인 대기 중입니다. 승인 후 로그인할 수 있습니다.' },
      { status: 403 }
    );
  }

  const token = await signSession(user);
  await setSessionCookie(token);
  return Response.json({ ok: true });
}
