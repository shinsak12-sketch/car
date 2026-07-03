import Link from 'next/link';
import { TIMELINE_CATEGORIES } from '@/lib/constants';
import { toLocalInput } from '@/lib/format';

// item 이 있으면 수정, 없으면 새 작성. action 은 서버 액션.
export default function TimelineForm({ item, action, blobReady = true }) {
  const occ = toLocalInput(item?.occurred_at);
  const cancelHref = item ? `/timeline/${item.id}` : '/timeline';

  return (
    <form action={action} encType="multipart/form-data" className="form-card">
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
          📷 사진 첨부 기능이 아직 <b>꺼져 있습니다</b>. Vercel 프로젝트 → <b>Storage → Blob</b> 저장소를
          만들면(자동으로 <code>BLOB_READ_WRITE_TOKEN</code> 연결) 사진·파일을 올릴 수 있습니다.
        </div>
      )}
      <div className="form-actions">
        <button type="submit" className="btn-primary">저장</button>
        <Link href={cancelHref} className="btn-ghost" style={{ color: 'var(--muted)', borderColor: 'var(--line)' }}>취소</Link>
      </div>
    </form>
  );
}
