'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { upload } from '@vercel/blob/client';

export default function FilesUploader({ action }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const router = useRouter();

  async function onSubmit(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const memo = fd.get('memo')?.toString() || '';
    const files = fd.getAll('files').filter((f) => f && typeof f === 'object' && f.size > 0);
    if (!files.length) {
      setError('파일을 선택하세요.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const uploaded = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProgress(`업로드 중… (${i + 1}/${files.length})`);
        const blob = await upload(file.name, file, { access: 'public', handleUploadUrl: '/api/blob/upload' });
        uploaded.push({ url: blob.url, pathname: blob.pathname, name: file.name, type: file.type, size: file.size });
      }
      setProgress('저장 중…');
      await action(memo, uploaded);
      form.reset();
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError('업로드 실패: ' + (err?.message || err));
    } finally {
      setBusy(false);
      setProgress('');
    }
  }

  return (
    <>
      <button type="button" className="btn-primary" onClick={() => setOpen((v) => !v)}>＋ 파일 올리기</button>
      {open && (
        <form onSubmit={onSubmit} className="form-card">
          {error && <div className="flash error">{error}</div>}
          <label>파일 선택 (여러 개 가능 · 사진/동영상/공문 등)
            <input type="file" name="files" multiple required />
          </label>
          <label>메모<input type="text" name="memo" placeholder="예: 3일차 정문 앞 채증 사진" /></label>
          <div className="form-actions">
            <button className="btn-primary" disabled={busy}>{busy ? (progress || '업로드 중…') : '업로드'}</button>
          </div>
        </form>
      )}
    </>
  );
}
