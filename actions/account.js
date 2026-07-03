'use server';

import bcrypt from 'bcryptjs';
import { sql } from '@/lib/db';
import { requireUser } from '@/lib/auth';

export async function changePassword(prevState, formData) {
  const session = await requireUser();
  const current = formData.get('current')?.toString() || '';
  const next1 = formData.get('next1')?.toString() || '';
  const next2 = formData.get('next2')?.toString() || '';

  const rows = await sql`SELECT * FROM users WHERE id = ${session.id}`;
  const user = rows[0];
  if (!user || !bcrypt.compareSync(current, user.password)) {
    return { error: '현재 비밀번호가 올바르지 않습니다.' };
  }
  if (next1.length < 4) return { error: '새 비밀번호는 4자 이상이어야 합니다.' };
  if (next1 !== next2) return { error: '새 비밀번호가 서로 다릅니다.' };

  await sql`UPDATE users SET password = ${bcrypt.hashSync(next1, 10)} WHERE id = ${user.id}`;
  return { ok: '비밀번호가 변경되었습니다.' };
}
