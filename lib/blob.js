import { put, del } from '@vercel/blob';

// Vercel Blob 업로드. 반환: { url, pathname }
export async function uploadFile(file) {
  const safe = (file.name || 'file').replace(/[^\w.\-가-힣]/g, '_');
  const key = `evidence/${Date.now()}-${Math.round(Math.random() * 1e9)}-${safe}`;
  const blob = await put(key, file, {
    access: 'public',
    addRandomSuffix: false,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  return { url: blob.url, pathname: blob.pathname };
}

export async function deleteFile(url) {
  try {
    await del(url, { token: process.env.BLOB_READ_WRITE_TOKEN });
  } catch (e) {
    console.warn('[blob] 삭제 실패:', e?.message);
  }
}

export function blobConfigured() {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}
