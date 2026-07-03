'use server';

import { sql } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { deleteFile } from '@/lib/blob';
import { revalidatePath } from 'next/cache';

// 파일은 클라이언트에서 이미 Blob 에 업로드됨 → 메타데이터만 저장
export async function saveUploadedFiles(memo, files) {
  const user = await requireUser();
  for (const f of files || []) {
    if (f && f.url && f.pathname) {
      await sql`INSERT INTO files (url, pathname, original, mimetype, size, memo, uploader_id)
        VALUES (${f.url}, ${f.pathname}, ${f.name || '파일'}, ${f.type || ''}, ${Number(f.size) || 0}, ${memo || ''}, ${user.id})`;
    }
  }
  revalidatePath('/files');
  revalidatePath('/');
}

export async function deleteFileRecord(id) {
  await requireUser();
  const rows = await sql`SELECT url FROM files WHERE id=${id}`;
  if (rows[0]) await deleteFile(rows[0].url);
  await sql`DELETE FROM files WHERE id=${id}`;
  revalidatePath('/files');
  revalidatePath('/');
}
