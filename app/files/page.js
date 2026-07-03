import { sql } from '@/lib/db';
import { blobConfigured } from '@/lib/blob';
import { uploadFiles, updateFile, deleteFileRecord } from '@/actions/files';
import FilesUploader from '@/components/FilesUploader';
import FileCard from '@/components/FileCard';

export const dynamic = 'force-dynamic';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function FilesPage({ searchParams }) {
  const from = DATE_RE.test(searchParams?.from) ? searchParams.from : '';
  const to = DATE_RE.test(searchParams?.to) ? searchParams.to : '';

  // 발생일자(없으면 등록일)를 KST 날짜로 비교하여 기간 필터
  let items;
  if (from && to) {
    items = await sql`SELECT f.*, u.name AS uploader_name, u.position AS uploader_position, u.affiliation AS uploader_affiliation, t.title AS timeline_title
      FROM files f LEFT JOIN users u ON u.id=f.uploader_id LEFT JOIN timeline t ON t.id=f.timeline_id
      WHERE (COALESCE(f.occurred_at, f.created_at) AT TIME ZONE 'Asia/Seoul')::date BETWEEN ${from}::date AND ${to}::date
      ORDER BY COALESCE(f.occurred_at, f.created_at) DESC, f.id DESC`;
  } else if (from) {
    items = await sql`SELECT f.*, u.name AS uploader_name, u.position AS uploader_position, u.affiliation AS uploader_affiliation, t.title AS timeline_title
      FROM files f LEFT JOIN users u ON u.id=f.uploader_id LEFT JOIN timeline t ON t.id=f.timeline_id
      WHERE (COALESCE(f.occurred_at, f.created_at) AT TIME ZONE 'Asia/Seoul')::date >= ${from}::date
      ORDER BY COALESCE(f.occurred_at, f.created_at) DESC, f.id DESC`;
  } else if (to) {
    items = await sql`SELECT f.*, u.name AS uploader_name, u.position AS uploader_position, u.affiliation AS uploader_affiliation, t.title AS timeline_title
      FROM files f LEFT JOIN users u ON u.id=f.uploader_id LEFT JOIN timeline t ON t.id=f.timeline_id
      WHERE (COALESCE(f.occurred_at, f.created_at) AT TIME ZONE 'Asia/Seoul')::date <= ${to}::date
      ORDER BY COALESCE(f.occurred_at, f.created_at) DESC, f.id DESC`;
  } else {
    items = await sql`SELECT f.*, u.name AS uploader_name, u.position AS uploader_position, u.affiliation AS uploader_affiliation, t.title AS timeline_title
      FROM files f LEFT JOIN users u ON u.id=f.uploader_id LEFT JOIN timeline t ON t.id=f.timeline_id
      ORDER BY COALESCE(f.occurred_at, f.created_at) DESC, f.id DESC`;
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
            <FileCard
              key={f.id}
              f={f}
              updateAction={updateFile.bind(null, f.id)}
              deleteAction={deleteFileRecord.bind(null, f.id)}
            />
          ))}
        </div>
      )}
    </>
  );
}
