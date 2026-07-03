'use server';

import { sql } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { uploadFile, deleteFile, blobConfigured } from '@/lib/blob';
import { revalidatePath } from 'next/cache';

export async function uploadFiles(formData) {
  const user = await requireUser();
  if (!blobConfigured()) {
    throw new Error('파일 저장소(Vercel Blob)가 설정되지 않았습니다. BLOB_READ_WRITE_TOKEN 을 설정하세요.');
  }
  const memo = formData.get('memo')?.toString() || '';
  const files = formData.getAll('files');
  for (const file of files) {
    if (file && typeof file === 'object' && typeof file.arrayBuffer === 'function' && file.size > 0) {
      const { url, pathname } = await uploadFile(file);
      await sql`INSERT INTO files (url, pathname, original, mimetype, size, memo, uploader_id)
        VALUES (${url}, ${pathname}, ${file.name}, ${file.type}, ${file.size}, ${memo}, ${user.id})`;
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
