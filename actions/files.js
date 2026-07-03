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
  let failed = 0;
  for (const file of files) {
    if (file && typeof file === 'object' && typeof file.arrayBuffer === 'function' && file.size > 0) {
      try {
        const { url, pathname } = await uploadFile(file);
        await sql`INSERT INTO files (url, pathname, original, mimetype, size, memo, uploader_id)
          VALUES (${url}, ${pathname}, ${file.name}, ${file.type}, ${file.size}, ${memo}, ${user.id})`;
      } catch (e) {
        failed++;
        console.error('[files] 업로드 실패:', e?.message);
      }
    }
  }
  revalidatePath('/files');
  revalidatePath('/');
  if (failed > 0) {
    // 업로드가 전부/일부 실패해도 500 대신 안내 페이지로
    throw new Error('파일 업로드에 실패했습니다. Blob 저장소 연결(토큰)을 확인하세요.');
  }
}

export async function deleteFileRecord(id) {
  await requireUser();
  const rows = await sql`SELECT url FROM files WHERE id=${id}`;
  if (rows[0]) await deleteFile(rows[0].url);
  await sql`DELETE FROM files WHERE id=${id}`;
  revalidatePath('/files');
  revalidatePath('/');
}
