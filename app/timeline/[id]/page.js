import Link from 'next/link';
import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { catClass } from '@/lib/constants';
import { fmtDateTime } from '@/lib/format';
import { deleteTimeline } from '@/actions/timeline';
import ConfirmButton from '@/components/ConfirmButton';

export const dynamic = 'force-dynamic';

function isImg(m) {
  return m && m.startsWith('image/');
}

export default async function TimelineDetail({ params }) {
  // 두 쿼리 모두 URL 의 id 로 조회하므로 병렬 실행 가능
  const [rows, files] = await Promise.all([
    sql`SELECT t.*, u.name AS author_name FROM timeline t
        LEFT JOIN users u ON u.id = t.author_id WHERE t.id = ${params.id}`,
    sql`SELECT * FROM files WHERE timeline_id = ${params.id} ORDER BY id`,
  ]);
  const item = rows[0];
  if (!item) notFound();

  return (
    <>
      <div className="page-head">
        <Link href="/timeline" className="back">← 목록</Link>
        <div className="head-actions">
          <Link href={`/timeline/${item.id}/edit`} className="btn-sm">수정</Link>
          <form action={deleteTimeline.bind(null, item.id)} className="inline">
            <ConfirmButton message="이 기록을 삭제할까요? 첨부 파일도 함께 삭제됩니다." className="btn-sm btn-danger-ghost">삭제</ConfirmButton>
          </form>
        </div>
      </div>

      <article className="detail">
        <div className="detail-top">
          <span className={catClass(item.category)}>{item.category}</span>
          <span className="detail-time">{fmtDateTime(item.occurred_at)}</span>
        </div>
        <h1 className="detail-title">{item.title}</h1>
        <div className="detail-author">작성: {item.author_name || '-'} · 등록 {fmtDateTime(item.created_at)}</div>
        {item.body && <div className="detail-body">{item.body}</div>}

        {files.length > 0 && (
          <>
            <h3 className="attach-head">첨부 자료 ({files.length})</h3>
            <div className="attach-grid">
              {files.map((f) => (
                <div className="attach" key={f.id}>
                  {isImg(f.mimetype) ? (
                    <a href={f.url} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={f.url} alt={f.original} loading="lazy" />
                    </a>
                  ) : (
                    <a href={f.url} target="_blank" rel="noreferrer" className="attach-file">📄 {f.original}</a>
                  )}
                  <div className="attach-name">{f.original}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </article>
    </>
  );
}
