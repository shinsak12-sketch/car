'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const MAX_MB = 4;

export default function FilesUploader({ action }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    const form = e.currentTarget;
    const fd = new FormData(form);
    const files = fd.getAll('files').filter((f) => f && f.size > 0);
    if (!files.length) {
      setError('파일을 선택하세요.');
      return;
    }
    const big = files.filter((f) => f.size > MAX_MB * 1024 * 1024);
    if (big.length) {
      setError(`파일이 너무 큽니다 (${MAX_MB}MB 이하만 가능): ${big[0].name}`);
      return;
    }
    setBusy(true);
    try {
      const res = await action(fd);
      if (res?.ok) {
        form.reset();
        setOpen(false);
        router.refresh();
      } else {
        setError(res?.error || '업로드에 실패했습니다.');
      }
    } catch (err) {
      setError('업로드 실패: ' + (err?.message || err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="btn-primary" onClick={() => setOpen((v) => !v)}>＋ 파일 올리기</button>
      {open && (
        <form onSubmit={onSubmit} className="form-card">
          {error && <div className="flash error">{error}</div>}
          <label>파일 선택 (여러 개 가능 · 장당 {MAX_MB}MB 이하)
            <input type="file" name="files" multiple required accept="image/*,.pdf,.doc,.docx,.hwp" />
          </label>
          <label>메모<input type="text" name="memo" placeholder="예: 3일차 정문 앞 채증 사진" /></label>
          <div className="form-actions">
            <button className="btn-primary" disabled={busy}>{busy ? '업로드 중…' : '업로드'}</button>
          </div>
        </form>
      )}
    </>
  );
}
