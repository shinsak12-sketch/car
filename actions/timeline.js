'use server';

import { sql } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { deleteFile } from '@/lib/blob';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { TIMELINE_CATEGORIES } from '@/lib/constants';

function cat(v) {
  return TIMELINE_CATEGORIES.includes(v) ? v : '기타';
}

// 파일은 클라이언트에서 이미 Blob 에 업로드됨 → 여기선 메타데이터만 DB 에 저장
async function saveFileRows(files, timelineId, userId) {
  for (const f of files || []) {
    if (f && f.url && f.pathname) {
      await sql`INSERT INTO files (url, pathname, original, mimetype, size, timeline_id, uploader_id)
        VALUES (${f.url}, ${f.pathname}, ${f.name || '파일'}, ${f.type || ''}, ${Number(f.size) || 0}, ${timelineId}, ${userId})`;
    }
  }
}

export async function createTimeline(data) {
  const user = await requireUser();
  const title = (data.title?.toString().trim()) || '(제목 없음)';
  const body = data.body?.toString() || '';
  const category = cat(data.category?.toString());
  const occurred_at = data.occurred_at?.toString() || new Date().toISOString();

  const rows = await sql`INSERT INTO timeline (title, body, category, occurred_at, author_id)
    VALUES (${title}, ${body}, ${category}, ${occurred_at}, ${user.id}) RETURNING id`;
  const id = rows[0].id;
  await saveFileRows(data.files, id, user.id);

  revalidatePath('/timeline');
  revalidatePath('/');
  redirect('/timeline/' + id);
}

export async function updateTimeline(id, data) {
  const user = await requireUser();
  const title = (data.title?.toString().trim()) || '(제목 없음)';
  const body = data.body?.toString() || '';
  const category = cat(data.category?.toString());
  const occurred_at = data.occurred_at?.toString() || new Date().toISOString();

  await sql`UPDATE timeline SET title=${title}, body=${body}, category=${category}, occurred_at=${occurred_at}
    WHERE id=${id}`;
  await saveFileRows(data.files, id, user.id);

  revalidatePath('/timeline');
  revalidatePath('/timeline/' + id);
  redirect('/timeline/' + id);
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
