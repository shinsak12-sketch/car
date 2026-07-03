// 브라우저에서 큰 이미지를 서버 업로드 한도(약 4.5MB) 아래로 자동 압축.
// 이미지가 아니거나 디코딩 불가(예: 일부 HEIC)면 원본을 그대로 반환.
export async function compressImage(file, { maxDim = 2560, maxBytes = 4 * 1024 * 1024 } = {}) {
  if (!file || !file.type || !file.type.startsWith('image/')) return file;
  if (file.size <= maxBytes && file.size <= 2 * 1024 * 1024) return file; // 이미 충분히 작으면 그대로

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file; // 디코딩 불가 → 원본
  }

  let { width, height } = bitmap;
  const scale = Math.min(1, maxDim / Math.max(width, height));
  width = Math.max(1, Math.round(width * scale));
  height = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, width, height);
  if (bitmap.close) bitmap.close();

  let q = 0.85;
  let blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', q));
  while (blob && blob.size > maxBytes && q > 0.4) {
    q -= 0.1;
    blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', q));
  }
  if (!blob || blob.size >= file.size) return file;

  const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
  return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() });
}
