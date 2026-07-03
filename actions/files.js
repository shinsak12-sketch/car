'use server';

import { sql } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { uploadFile, deleteFile, blobConfigured } from '@/lib/blob';
import { revalidatePath } from 'next/cache';

// 반환: {ok:true, count} 또는 {error}
export async function uploadFiles(formData) {
  const user = await requireUser();
  if (!blobConfigured()) return { error: 'Blob 저장소가 연결되지 않았습니다.' };

  const memo = formData.get('memo')?.toString() || '';
  const files = formData.getAll('files').filter((f) => f && typeof f === 'object' && f.size > 0);
  if (!files.length) return { error: '파일을 선택하세요.' };

  let count = 0;
  try {
    for (const file of files) {
      const { url, pathname } = await uploadFile(file);
      await sql`INSERT INTO files (url, pathname, original, mimetype, size, memo, uploader_id)
        VALUES (${url}, ${pathname}, ${file.name || '파일'}, ${file.type || ''}, ${file.size || 0}, ${memo}, ${user.id})`;
      count++;
    }
  } catch (e) {
    return { error: '업로드 실패: ' + (e?.message || e), count };
  }
  revalidatePath('/files');
  revalidatePath('/');
  return { ok: true, count };
}

export async function deleteFileRecord(id) {
  await requireUser();
  const rows = await sql`SELECT url FROM files WHERE id=${id}`;
  if (rows[0]) await deleteFile(rows[0].url);
  await sql`DELETE FROM files WHERE id=${id}`;
  revalidatePath('/files');
  revalidatePath('/');
}
