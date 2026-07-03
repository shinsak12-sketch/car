import Link from 'next/link';
import { sql } from '@/lib/db';
import { TIMELINE_CATEGORIES, catClass } from '@/lib/constants';
import { fmtDateTime, userLabel } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function TimelinePage({ searchParams }) {
  const category = TIMELINE_CATEGORIES.includes(searchParams?.category) ? searchParams.category : '';
  const q = (searchParams?.q || '').trim();
  const pat = `%${q}%`;

  let items;
  if (category && q) {
    items = await sql`
      SELECT t.*, u.name AS author_name, u.position AS author_position, u.affiliation AS author_affiliation,
        (SELECT COUNT(*) FROM files f WHERE f.timeline_id = t.id)::int AS file_count
      FROM timeline t LEFT JOIN users u ON u.id = t.author_id
      WHERE t.category = ${category} AND (t.title ILIKE ${pat} OR t.body ILIKE ${pat})
      ORDER BY t.occurred_at DESC, t.id DESC`;
  } else if (category) {
    items = await sql`
      SELECT t.*, u.name AS author_name, u.position AS author_position, u.affiliation AS author_affiliation,
        (SELECT COUNT(*) FROM files f WHERE f.timeline_id = t.id)::int AS file_count
      FROM timeline t LEFT JOIN users u ON u.id = t.author_id
      WHERE t.category = ${category}
      ORDER BY t.occurred_at DESC, t.id DESC`;
  } else if (q) {
    items = await sql`
      SELECT t.*, u.name AS author_name, u.position AS author_position, u.affiliation AS author_affiliation,
        (SELECT COUNT(*) FROM files f WHERE f.timeline_id = t.id)::int AS file_count
      FROM timeline t LEFT JOIN users u ON u.id = t.author_id
      WHERE (t.title ILIKE ${pat} OR t.body ILIKE ${pat})
      ORDER BY t.occurred_at DESC, t.id DESC`;
  } else {
    items = await sql`
      SELECT t.*, u.name AS author_name, u.position AS author_position, u.affiliation AS author_affiliation,
        (SELECT COUNT(*) FROM files f WHERE f.timeline_id = t.id)::int AS file_count
      FROM timeline t LEFT JOIN users u ON u.id = t.author_id
      ORDER BY t.occurred_at DESC, t.id DESC`;
  }

  return (
    <>
      <div className="page-head">
        <h1>상황 일지</h1>
        <Link href="/timeline/new" className="btn-primary">＋ 새 기록</Link>
      </div>

      <div className="chips-scroll">
        <Link href="/timeline" className={`chip-f ${!category ? 'on' : ''}`}>전체</Link>
        {TIMELINE_CATEGORIES.map((c) => (
          <Link key={c} href={`/timeline?category=${encodeURIComponent(c)}`} className={`chip-f ${category === c ? 'on' : ''}`}>{c}</Link>
        ))}
      </div>
      <form className="search-row" method="get" action="/timeline">
        {category && <input type="hidden" name="category" value={category} />}
        <input type="search" name="q" defaultValue={q} placeholder="제목·내용 검색" />
        <button className="btn-sm">검색</button>
      </form>

      <Link href="/timeline/new" className="fab" aria-label="새 기록">＋</Link>

      {items.length === 0 ? (
        <p className="empty big">기록이 없습니다. 상황이 발생하면 <Link href="/timeline/new">새 기록</Link>으로 바로 남겨두세요.</p>
      ) : (
        <div className="timeline">
          {items.map((t) => (
            <div className="tl-item" key={t.id}>
              <div className="tl-time">{fmtDateTime(t.occurred_at)}</div>
              <div className="tl-body">
                <Link href={`/timeline/${t.id}`} className="tl-card">
                  <div className="tl-card-head">
                    <span className={catClass(t.category)}>{t.category}</span>
                    <strong>{t.title}</strong>
                  </div>
                  {t.body && <p className="tl-excerpt">{t.body.length > 120 ? t.body.slice(0, 120) + '…' : t.body}</p>}
                  <div className="tl-meta">{userLabel(t.author_name, t.author_position, t.author_affiliation)}{t.file_count > 0 && ` · 📎 ${t.file_count}개`}</div>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
