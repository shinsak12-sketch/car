'use server';

import { sql } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { uploadFile, deleteFile, blobConfigured } from '@/lib/blob';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { TIMELINE_CATEGORIES } from '@/lib/constants';

function cat(v) {
  return TIMELINE_CATEGORIES.includes(v) ? v : '기타';
}

async function saveFiles(formData, timelineId, userId) {
  if (!blobConfigured()) return;
  const photos = formData.getAll('photos');
  for (const file of photos) {
    if (file && typeof file === 'object' && typeof file.arrayBuffer === 'function' && file.size > 0) {
      const { url, pathname } = await uploadFile(file);
      await sql`INSERT INTO files (url, pathname, original, mimetype, size, timeline_id, uploader_id)
        VALUES (${url}, ${pathname}, ${file.name}, ${file.type}, ${file.size}, ${timelineId}, ${userId})`;
    }
  }
}

export async function createTimeline(formData) {
  const user = await requireUser();
  const title = (formData.get('title')?.toString().trim()) || '(제목 없음)';
  const body = formData.get('body')?.toString() || '';
  const category = cat(formData.get('category')?.toString());
  const occurred_at = formData.get('occurred_at')?.toString() || new Date().toISOString();

  const rows = await sql`INSERT INTO timeline (title, body, category, occurred_at, author_id)
    VALUES (${title}, ${body}, ${category}, ${occurred_at}, ${user.id}) RETURNING id`;
  const id = rows[0].id;
  await saveFiles(formData, id, user.id);

  revalidatePath('/timeline');
  revalidatePath('/');
  redirect('/timeline/' + id);
}

export async function updateTimeline(id, formData) {
  const user = await requireUser();
  const title = (formData.get('title')?.toString().trim()) || '(제목 없음)';
  const body = formData.get('body')?.toString() || '';
  const category = cat(formData.get('category')?.toString());
  const occurred_at = formData.get('occurred_at')?.toString() || new Date().toISOString();

  await sql`UPDATE timeline SET title=${title}, body=${body}, category=${category}, occurred_at=${occurred_at}
    WHERE id=${id}`;
  await saveFiles(formData, id, user.id);

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
