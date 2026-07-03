'use server';

import bcrypt from 'bcryptjs';
import { sql } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { ensureSchema } from '@/lib/ensureSchema';
import { revalidatePath } from 'next/cache';

async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== 'admin') throw new Error('관리자 권한이 필요합니다.');
  return user;
}

export async function createUser(prevState, formData) {
  await requireAdmin();
  await ensureSchema();
  const username = formData.get('username')?.toString().trim();
  const name = formData.get('name')?.toString().trim();
  const password = formData.get('password')?.toString();
  const phone = formData.get('phone')?.toString() || '';
  const position = formData.get('position')?.toString() || '';
  const role = formData.get('role')?.toString() === 'admin' ? 'admin' : 'member';
  if (!username || !name || !password) return { error: '아이디·이름·비밀번호는 필수입니다.' };

  const exists = await sql`SELECT 1 FROM users WHERE username = ${username}`;
  if (exists.length) return { error: '이미 있는 아이디입니다.' };

  await sql`INSERT INTO users (username, name, phone, position, password, role)
    VALUES (${username}, ${name}, ${phone}, ${position}, ${bcrypt.hashSync(password, 10)}, ${role})`;
  revalidatePath('/users');
  return { ok: '추가되었습니다.' };
}

// 직책(및 이름·전화) 저장/수정
export async function updateProfile(id, formData) {
  await requireAdmin();
  await ensureSchema();
  const name = formData.get('name')?.toString().trim();
  const position = formData.get('position')?.toString() || '';
  const phone = formData.get('phone')?.toString() || '';
  if (!name) return;
  await sql`UPDATE users SET name = ${name}, position = ${position}, phone = ${phone} WHERE id = ${id}`;
  revalidatePath('/users');
}

export async function resetPassword(id, formData) {
  await requireAdmin();
  const password = formData.get('password')?.toString();
  if (password && password.length >= 4) {
    await sql`UPDATE users SET password = ${bcrypt.hashSync(password, 10)} WHERE id = ${id}`;
  }
  revalidatePath('/users');
}

export async function toggleActive(id) {
  const admin = await requireAdmin();
  if (id === admin.id) return;
  await sql`UPDATE users SET active = NOT active WHERE id = ${id}`;
  revalidatePath('/users');
}

export async function approveUser(id) {
  await requireAdmin();
  await sql`UPDATE users SET status = 'active', active = true WHERE id = ${id}`;
  revalidatePath('/users');
}

export async function rejectUser(id) {
  await requireAdmin();
  // 대기 상태인 신청만 삭제 (활성 사용자 보호)
  await sql`DELETE FROM users WHERE id = ${id} AND status = 'pending'`;
  revalidatePath('/users');
}

export async function setRole(id, formData) {
  const admin = await requireAdmin();
  if (id === admin.id) return;
  const role = formData.get('role')?.toString() === 'admin' ? 'admin' : 'member';
  await sql`UPDATE users SET role = ${role} WHERE id = ${id}`;
  revalidatePath('/users');
}
