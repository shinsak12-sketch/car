'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { compressImage } from '@/lib/imageCompress';
import { nowLocalInput } from '@/lib/format';

const MAX_NONIMG_MB = 4; // 이미지가 아닌 파일(PDF 등) 서버 업로드 한도

export default function FilesUploader({ action }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const router = useRouter();

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    const form = e.currentTarget;
    const fd = new FormData(form);
    const raw = fd.getAll('files').filter((f) => f && typeof f === 'object' && f.size > 0);
    if (!raw.length) {
      setError('파일을 선택하세요.');
      return;
    }
    // 이미지가 아닌 큰 파일은 서버 한도 초과
    const bigNonImg = raw.find((f) => !f.type?.startsWith('image/') && f.size > MAX_NONIMG_MB * 1024 * 1024);
    if (bigNonImg) {
      setError(`이미지가 아닌 파일은 ${MAX_NONIMG_MB}MB 이하만 가능합니다: ${bigNonImg.name}`);
      return;
    }

    setBusy(true);
    try {
      const out = new FormData();
      out.set('memo', fd.get('memo')?.toString() || '');
      out.set('occurred_at', fd.get('occurred_at')?.toString() || '');
      for (let i = 0; i < raw.length; i++) {
        setProgress(`사진 최적화 중… (${i + 1}/${raw.length})`);
        const c = await compressImage(raw[i]);
        out.append('files', c, c.name);
      }
      setProgress('업로드 중…');
      const res = await action(out);
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
      setProgress('');
    }
  }

  return (
    <>
      <button type="button" className="btn-primary" onClick={() => setOpen((v) => !v)}>＋ 파일 올리기</button>
      {open && (
        <form onSubmit={onSubmit} className="form-card">
          {error && <div className="flash error">{error}</div>}
          <label>파일 선택 (여러 개 가능 · 큰 사진은 자동 최적화)
            <input type="file" name="files" multiple required accept="image/*,.pdf,.doc,.docx,.hwp" />
          </label>
          <label>발생일자 · 시각
            <input type="datetime-local" name="occurred_at" defaultValue={nowLocalInput()} />
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
