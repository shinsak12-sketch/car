import { sql } from '@/lib/db';
import { blobConfigured } from '@/lib/blob';
import { fmtSize, fmtDateTime, userLabel } from '@/lib/format';
import { uploadFiles, deleteFileRecord } from '@/actions/files';
import FilesUploader from '@/components/FilesUploader';
import ConfirmButton from '@/components/ConfirmButton';

export const dynamic = 'force-dynamic';

function isImg(m) {
  return m && m.startsWith('image/');
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function FilesPage({ searchParams }) {
  const from = DATE_RE.test(searchParams?.from) ? searchParams.from : '';
  const to = DATE_RE.test(searchParams?.to) ? searchParams.to : '';

  // created_at 을 KST 날짜로 비교하여 기간 필터
  let items;
  if (from && to) {
    items = await sql`SELECT f.*, u.name AS uploader_name, u.position AS uploader_position, u.affiliation AS uploader_affiliation, t.title AS timeline_title
      FROM files f LEFT JOIN users u ON u.id=f.uploader_id LEFT JOIN timeline t ON t.id=f.timeline_id
      WHERE (f.created_at AT TIME ZONE 'Asia/Seoul')::date BETWEEN ${from}::date AND ${to}::date
      ORDER BY f.id DESC`;
  } else if (from) {
    items = await sql`SELECT f.*, u.name AS uploader_name, u.position AS uploader_position, u.affiliation AS uploader_affiliation, t.title AS timeline_title
      FROM files f LEFT JOIN users u ON u.id=f.uploader_id LEFT JOIN timeline t ON t.id=f.timeline_id
      WHERE (f.created_at AT TIME ZONE 'Asia/Seoul')::date >= ${from}::date
      ORDER BY f.id DESC`;
  } else if (to) {
    items = await sql`SELECT f.*, u.name AS uploader_name, u.position AS uploader_position, u.affiliation AS uploader_affiliation, t.title AS timeline_title
      FROM files f LEFT JOIN users u ON u.id=f.uploader_id LEFT JOIN timeline t ON t.id=f.timeline_id
      WHERE (f.created_at AT TIME ZONE 'Asia/Seoul')::date <= ${to}::date
      ORDER BY f.id DESC`;
  } else {
    items = await sql`SELECT f.*, u.name AS uploader_name, u.position AS uploader_position, u.affiliation AS uploader_affiliation, t.title AS timeline_title
      FROM files f LEFT JOIN users u ON u.id=f.uploader_id LEFT JOIN timeline t ON t.id=f.timeline_id
      ORDER BY f.id DESC`;
  }
  const configured = blobConfigured();

  return (
    <>
      <div className="page-head">
        <h1>증거 · 자료함</h1>
        {configured && <FilesUploader action={uploadFiles} />}
      </div>

      <form className="search-row" method="get" action="/files" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <label style={{ fontSize: '.8rem', fontWeight: 600 }}>시작일<input type="date" name="from" defaultValue={from} /></label>
        <label style={{ fontSize: '.8rem', fontWeight: 600 }}>종료일<input type="date" name="to" defaultValue={to} /></label>
        <button className="btn-sm">기간 검색</button>
        {(from || to) && <a href="/files" className="btn-sm">전체</a>}
      </form>

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
                  <img src={f.url} alt={f.memo || '증거 사진'} loading="lazy" />
                ) : (
                  <span className="file-icon">📄</span>
                )}
              </a>
              <div className="file-info">
                {f.memo ? (
                  <div className="file-name">{f.memo}</div>
                ) : (
                  <div className="file-name">{isImg(f.mimetype) ? '📷 사진' : '📄 파일'}</div>
                )}
                <div className="file-meta">등록: {userLabel(f.uploader_name, f.uploader_position, f.uploader_affiliation)}</div>
                <div className="file-meta">{fmtSize(f.size)} · {fmtDateTime(f.created_at).slice(5)}</div>
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
