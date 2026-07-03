'use client';

import { useState } from 'react';
import Link from 'next/link';
import { upload } from '@vercel/blob/client';
import { TIMELINE_CATEGORIES } from '@/lib/constants';
import { toLocalInput } from '@/lib/format';

// item 이 있으면 수정, 없으면 새 작성. action 은 서버 액션.
// 사진/파일은 브라우저에서 Vercel Blob 으로 직접 업로드 후 URL 을 서버로 전달.
export default function TimelineForm({ item, action, blobReady = true }) {
  const occ = toLocalInput(item?.occurred_at);
  const cancelHref = item ? `/timeline/${item.id}` : '/timeline';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');

  async function onSubmit(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const files = fd.getAll('photos').filter((f) => f && typeof f === 'object' && f.size > 0);

    setBusy(true);
    setError('');
    try {
      const uploaded = [];
      if (blobReady && files.length) {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          setProgress(`사진 업로드 중… (${i + 1}/${files.length})`);
          const blob = await upload(file.name, file, {
            access: 'public',
            handleUploadUrl: '/api/blob/upload',
          });
          uploaded.push({ url: blob.url, pathname: blob.pathname, name: file.name, type: file.type, size: file.size });
        }
      }
      setProgress('저장 중…');
      await action({
        title: fd.get('title'),
        body: fd.get('body'),
        category: fd.get('category'),
        occurred_at: fd.get('occurred_at'),
        files: uploaded,
      });
      // 서버 액션이 상세 페이지로 리다이렉트함
    } catch (err) {
      setError('저장 실패: ' + (err?.message || err));
      setBusy(false);
      setProgress('');
    }
  }

  return (
    <form onSubmit={onSubmit} className="form-card">
      {error && <div className="flash error">{error}</div>}
      <label>
        발생 시각
        <input type="datetime-local" name="occurred_at" defaultValue={occ} required />
      </label>
      <label>
        분류
        <select name="category" defaultValue={item?.category || '기타'}>
          {TIMELINE_CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </label>
      <label>
        제목
        <input type="text" name="title" defaultValue={item?.title || ''} placeholder="예: 확성기 소음 발생 / 정문 앞 인원 집결" required />
      </label>
      <label>
        내용
        <textarea name="body" rows={7} defaultValue={item?.body || ''} placeholder="누가, 무엇을, 어떻게. 대응 내용과 현장 상황을 상세히 남기세요." />
      </label>
      {blobReady ? (
        <label>
          사진 · 파일 첨부 (여러 개 가능)
          <input type="file" name="photos" multiple accept="image/*,video/*,.pdf,.doc,.docx,.hwp" />
        </label>
      ) : (
        <div className="flash warn" style={{ margin: 0 }}>
          📷 사진 첨부 기능이 아직 <b>꺼져 있습니다</b>. Vercel <b>Storage → Blob</b> 연결 후 사용할 수 있습니다.
        </div>
      )}
      <div className="form-actions">
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? (progress || '저장 중…') : '저장'}
        </button>
        <Link href={cancelHref} className="btn-ghost" style={{ color: 'var(--muted)', borderColor: 'var(--line)' }}>취소</Link>
      </div>
    </form>
  );
}
