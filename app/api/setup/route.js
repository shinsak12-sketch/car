import bcrypt from 'bcryptjs';
import { sql, exec } from '@/lib/db';
import { schemaStatements } from '@/db/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Vercel 배포 후 최초 1회 DB를 초기화하는 엔드포인트.
//   GET /api/setup?token=<SETUP_TOKEN>
export async function GET(request) {
  const token = new URL(request.url).searchParams.get('token');
  if (!process.env.SETUP_TOKEN || token !== process.env.SETUP_TOKEN) {
    return Response.json({ ok: false, error: 'SETUP_TOKEN 이 올바르지 않습니다.' }, { status: 403 });
  }
  if (!process.env.DATABASE_URL) {
    return Response.json({ ok: false, error: 'DATABASE_URL 미설정' }, { status: 500 });
  }

  try {
    for (const stmt of schemaStatements()) await exec(stmt);

    const existing = await sql`SELECT COUNT(*)::int AS c FROM users`;
    let created = false;
    if (existing[0].c === 0) {
      await sql`INSERT INTO users (username, password, name, role)
                VALUES ('admin', ${bcrypt.hashSync('1234', 10)}, '관리자', 'admin')`;
      created = true;
    }
    return Response.json({
      ok: true,
      message: '초기화 완료',
      admin: created
        ? { username: 'admin', password: '1234', note: '로그인 후 비밀번호를 변경하세요.' }
        : '이미 사용자가 있어 관리자 생성을 건너뛰었습니다.',
    });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
