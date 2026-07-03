'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { TIMELINE_CATEGORIES } from '@/lib/constants';
import { toLocalInput } from '@/lib/format';

const MAX_MB = 4; // Vercel 서버 업로드 한도(약 4.5MB) 고려

export default function TimelineForm({ item, action, blobReady = true }) {
  const occ = toLocalInput(item?.occurred_at);
  const cancelHref = item ? `/timeline/${item.id}` : '/timeline';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    const form = e.currentTarget;
    const fd = new FormData(form);

    // 큰 파일 사전 안내 (서버 업로드 한도)
    const big = fd.getAll('photos').filter((f) => f && f.size > MAX_MB * 1024 * 1024);
    if (big.length) {
      setError(`사진이 너무 큽니다 (${MAX_MB}MB 이하만 가능). 카메라 화질을 낮추거나 캡처본으로 올려주세요. — ${big[0].name}`);
      return;
    }

    setBusy(true);
    try {
      const res = await action(fd);
      if (res?.ok) {
        if (res.warn) {
          setError(res.warn);
          setBusy(false);
          return;
        }
        router.push('/timeline/' + res.id);
      } else {
        setError(res?.error || '저장에 실패했습니다.');
        setBusy(false);
      }
    } catch (err) {
      setError('저장 실패: ' + (err?.message || err));
      setBusy(false);
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
          사진 · 파일 첨부 (여러 개 가능 · 장당 {MAX_MB}MB 이하)
          <input type="file" name="photos" multiple accept="image/*,.pdf,.doc,.docx,.hwp" />
        </label>
      ) : (
        <div className="flash warn" style={{ margin: 0 }}>
          📷 사진 첨부 기능이 아직 <b>꺼져 있습니다</b>. Vercel <b>Storage → Blob</b> 연결 후 사용할 수 있습니다.
        </div>
      )}
      <div className="form-actions">
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? '저장 중…' : '저장'}
        </button>
        <Link href={cancelHref} className="btn-ghost" style={{ color: 'var(--muted)', borderColor: 'var(--line)' }}>취소</Link>
      </div>
    </form>
  );
}
