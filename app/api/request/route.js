import bcrypt from 'bcryptjs';
import { sql } from '@/lib/db';
import { ensureSchema } from '@/lib/ensureSchema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 접속 권한 신청 (비로그인 공개). 승인 대기(status='pending') 사용자로 저장.
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: '잘못된 요청' }, { status: 400 });
  }
  const username = (body.username || '').trim();
  const name = (body.name || '').trim();
  const phone = (body.phone || '').trim();
  const password = body.password || '';

  if (!username || !name || !password) {
    return Response.json({ ok: false, error: '이름·아이디·비밀번호를 모두 입력하세요.' }, { status: 400 });
  }
  if (password.length < 4) {
    return Response.json({ ok: false, error: '비밀번호는 4자 이상이어야 합니다.' }, { status: 400 });
  }
  if (!/^[a-zA-Z0-9_.-]{3,20}$/.test(username)) {
    return Response.json({ ok: false, error: '아이디는 영문/숫자 3~20자로 입력하세요.' }, { status: 400 });
  }

  try {
    await ensureSchema();
    const exists = await sql`SELECT 1 FROM users WHERE username = ${username}`;
    if (exists.length) {
      return Response.json({ ok: false, error: '이미 사용 중인 아이디입니다. 다른 아이디를 써주세요.' }, { status: 409 });
    }
    await sql`INSERT INTO users (username, name, phone, password, role, active, status)
      VALUES (${username}, ${name}, ${phone}, ${bcrypt.hashSync(password, 10)}, 'member', true, 'pending')`;
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false, error: 'DB 오류: ' + e.message }, { status: 500 });
  }
}
