'use server';

import { sql } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { uploadFile, deleteFile, blobConfigured } from '@/lib/blob';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { TIMELINE_CATEGORIES } from '@/lib/constants';
import { localInputToTimestamp } from '@/lib/format';

function cat(v) {
  return TIMELINE_CATEGORIES.includes(v) ? v : '기타';
}

// 서버에서 Blob 업로드 후 파일 행 저장. 실패하면 예외를 던져 호출측에서 메시지 표시.
async function uploadAndSave(formData, timelineId, userId) {
  if (!blobConfigured()) return;
  const files = formData.getAll('photos').filter((f) => f && typeof f === 'object' && f.size > 0);
  for (const file of files) {
    const { url, pathname } = await uploadFile(file); // 실패 시 throw → 상위에서 catch
    await sql`INSERT INTO files (url, pathname, original, mimetype, size, timeline_id, uploader_id)
      VALUES (${url}, ${pathname}, ${file.name || '파일'}, ${file.type || ''}, ${file.size || 0}, ${timelineId}, ${userId})`;
  }
}

// 반환: {ok:true, id} 또는 {error}. (리다이렉트하지 않음 → 클라이언트에서 에러 표시 가능)
export async function createTimeline(formData) {
  const user = await requireUser();
  const title = (formData.get('title')?.toString().trim()) || '(제목 없음)';
  const body = formData.get('body')?.toString() || '';
  const category = cat(formData.get('category')?.toString());
  const occurred_at = localInputToTimestamp(formData.get('occurred_at')?.toString());

  const rows = await sql`INSERT INTO timeline (title, body, category, occurred_at, author_id)
    VALUES (${title}, ${body}, ${category}, ${occurred_at}, ${user.id}) RETURNING id`;
  const id = rows[0].id;

  try {
    await uploadAndSave(formData, id, user.id);
  } catch (e) {
    revalidatePath('/timeline');
    return { ok: true, id, warn: '글은 저장됐지만 사진 업로드에 실패했습니다: ' + (e?.message || e) };
  }
  revalidatePath('/timeline');
  revalidatePath('/');
  return { ok: true, id };
}

export async function updateTimeline(id, formData) {
  const user = await requireUser();
  const title = (formData.get('title')?.toString().trim()) || '(제목 없음)';
  const body = formData.get('body')?.toString() || '';
  const category = cat(formData.get('category')?.toString());
  const occurred_at = localInputToTimestamp(formData.get('occurred_at')?.toString());

  await sql`UPDATE timeline SET title=${title}, body=${body}, category=${category}, occurred_at=${occurred_at}
    WHERE id=${id}`;
  try {
    await uploadAndSave(formData, id, user.id);
  } catch (e) {
    return { ok: true, id, warn: '수정됐지만 사진 업로드에 실패했습니다: ' + (e?.message || e) };
  }
  revalidatePath('/timeline');
  revalidatePath('/timeline/' + id);
  return { ok: true, id };
}

export async function deleteTimeline(id) {
  await requireUser();
  const files = await sql`SELECT url FROM files WHERE timeline_id = ${id}`;
  for (const f of files) await deleteFile(f.url);
  await sql`DELETE FROM files WHERE timeline_id = ${id}`;
  await sql`DELETE FROM timeline WHERE id = ${id}`;
  revalidatePath('/timeline');
  revalidatePath('/');
  redirect('/timeline');
}
