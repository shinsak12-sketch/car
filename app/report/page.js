import { redirect } from 'next/navigation';
import { sql } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { ORG_NAME } from '@/lib/constants';
import { buildReportPrompt } from '@/lib/reportPrompt';
import ReportPrompt from '@/components/ReportPrompt';

export const dynamic = 'force-dynamic';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function ReportPage({ searchParams }) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'admin') {
    return (
      <div className="error-page">
        <h1>접근 불가</h1>
        <p>관리자만 보고서 프롬프트를 생성할 수 있습니다.</p>
      </div>
    );
  }

  const from = DATE_RE.test(searchParams?.from) ? searchParams.from : '';
  const to = DATE_RE.test(searchParams?.to) ? searchParams.to : '';

  // 기간 조건(발생시각 KST 기준). 없으면 전체.
  let timeline;
  if (from && to) {
    timeline = await sql`SELECT t.*, u.name AS author_name, u.position AS author_position, u.affiliation AS author_affiliation,
        (SELECT COUNT(*) FROM files f WHERE f.timeline_id = t.id)::int AS file_count
      FROM timeline t LEFT JOIN users u ON u.id = t.author_id
      WHERE (t.occurred_at AT TIME ZONE 'Asia/Seoul')::date BETWEEN ${from}::date AND ${to}::date
      ORDER BY t.occurred_at ASC, t.id ASC`;
  } else if (from) {
    timeline = await sql`SELECT t.*, u.name AS author_name, u.position AS author_position, u.affiliation AS author_affiliation,
        (SELECT COUNT(*) FROM files f WHERE f.timeline_id = t.id)::int AS file_count
      FROM timeline t LEFT JOIN users u ON u.id = t.author_id
      WHERE (t.occurred_at AT TIME ZONE 'Asia/Seoul')::date >= ${from}::date
      ORDER BY t.occurred_at ASC, t.id ASC`;
  } else if (to) {
    timeline = await sql`SELECT t.*, u.name AS author_name, u.position AS author_position, u.affiliation AS author_affiliation,
        (SELECT COUNT(*) FROM files f WHERE f.timeline_id = t.id)::int AS file_count
      FROM timeline t LEFT JOIN users u ON u.id = t.author_id
      WHERE (t.occurred_at AT TIME ZONE 'Asia/Seoul')::date <= ${to}::date
      ORDER BY t.occurred_at ASC, t.id ASC`;
  } else {
    timeline = await sql`SELECT t.*, u.name AS author_name, u.position AS author_position, u.affiliation AS author_affiliation,
        (SELECT COUNT(*) FROM files f WHERE f.timeline_id = t.id)::int AS file_count
      FROM timeline t LEFT JOIN users u ON u.id = t.author_id
      ORDER BY t.occurred_at ASC, t.id ASC`;
  }

  const [tasks, alerts] = await Promise.all([
    sql`SELECT t.*, u.name AS assignee_name FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id
        ORDER BY CASE t.status WHEN 'doing' THEN 0 WHEN 'todo' THEN 1 ELSE 2 END,
                 CASE t.priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END, t.id ASC`,
    sql`SELECT a.*, u.name AS sender_name FROM alerts a LEFT JOIN users u ON u.id = a.sender_id
        ORDER BY a.id ASC`,
  ]);

  const text = buildReportPrompt({ orgName: ORG_NAME, from, to, timeline, tasks, alerts });

  return (
    <>
      <div className="page-head">
        <h1>보고서 프롬프트</h1>
      </div>

      <p className="report-lead">
        선택한 기간의 <b>상황 일지 · 대응 업무 · 비상 알림</b>을 하나의 프롬프트로 묶어 줍니다.
        복사해서 <b>클로드</b>에 붙여넣으면 대응 보고서 초안을 만들 수 있습니다.
      </p>

      <form className="search-row" method="get" action="/report" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <label style={{ fontSize: '.8rem', fontWeight: 600 }}>시작일<input type="date" name="from" defaultValue={from} /></label>
        <label style={{ fontSize: '.8rem', fontWeight: 600 }}>종료일<input type="date" name="to" defaultValue={to} /></label>
        <button className="btn-sm">기간 적용</button>
        {(from || to) && <a href="/report" className="btn-sm">전체</a>}
      </form>

      <ReportPrompt text={text} />
    </>
  );
}
