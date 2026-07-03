import { sql } from '@/lib/db';
import { blobConfigured } from '@/lib/blob';
import { fmtSize, fmtDateTime } from '@/lib/format';
import { saveUploadedFiles, deleteFileRecord } from '@/actions/files';
import FilesUploader from '@/components/FilesUploader';
import ConfirmButton from '@/components/ConfirmButton';

export const dynamic = 'force-dynamic';

function isImg(m) {
  return m && m.startsWith('image/');
}

export default async function FilesPage() {
  const items = await sql`
    SELECT f.*, u.name AS uploader_name, t.title AS timeline_title
    FROM files f
    LEFT JOIN users u ON u.id = f.uploader_id
    LEFT JOIN timeline t ON t.id = f.timeline_id
    ORDER BY f.id DESC`;
  const configured = blobConfigured();

  return (
    <>
      <div className="page-head">
        <h1>증거 · 자료함</h1>
        {configured && <FilesUploader action={saveUploadedFiles} />}
      </div>

      {!configured && (
        <div className="flash warn">
          파일 저장소(Vercel Blob)가 아직 연결되지 않았습니다. Vercel 프로젝트 → <strong>Storage → Blob</strong> 을 만들면
          <code>BLOB_READ_WRITE_TOKEN</code> 이 자동 연결되어 업로드가 활성화됩니다.
        </div>
      )}

      {items.length === 0 ? (
        <p className="empty big">보관된 자료가 없습니다. 사진·동영상·공문 등 증거 자료를 올려두세요.</p>
      ) : (
        <div className="file-grid">
          {items.map((f) => (
            <div className="file-card" key={f.id}>
              <a href={f.url} target="_blank" rel="noreferrer" className="file-thumb">
                {isImg(f.mimetype) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.url} alt={f.original} loading="lazy" />
                ) : (
                  <span className="file-icon">📄</span>
                )}
              </a>
              <div className="file-info">
                <div className="file-name" title={f.original}>{f.original}</div>
                <div className="file-meta">{fmtSize(f.size)} · {f.uploader_name || '-'} · {fmtDateTime(f.created_at).slice(5)}</div>
                {f.memo && <div className="file-memo">{f.memo}</div>}
                {f.timeline_title && <div className="file-link">🔗 {f.timeline_title}</div>}
                <div className="file-actions">
                  <a href={f.url} target="_blank" rel="noreferrer" className="mini">열기</a>
                  <form action={deleteFileRecord.bind(null, f.id)} className="inline">
                    <ConfirmButton message="삭제할까요?">삭제</ConfirmButton>
                  </form>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
