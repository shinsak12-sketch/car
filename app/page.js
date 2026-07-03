import Link from 'next/link';
import { sql } from '@/lib/db';
import { catClass } from '@/lib/constants';
import { fmtDateTime, fmtDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const recentTimeline = await sql`
    SELECT t.*, u.name AS author_name,
      (SELECT COUNT(*) FROM files f WHERE f.timeline_id = t.id)::int AS file_count
    FROM timeline t LEFT JOIN users u ON u.id = t.author_id
    ORDER BY t.occurred_at DESC, t.id DESC LIMIT 6`;

  const openTasks = await sql`
    SELECT t.*, u.name AS assignee_name
    FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id
    WHERE t.status <> 'done'
    ORDER BY CASE t.priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
             (t.due_date IS NULL), t.due_date ASC LIMIT 6`;

  const s = (
    await sql`SELECT
      (SELECT COUNT(*) FROM timeline)::int AS timeline,
      (SELECT COUNT(*) FROM tasks WHERE status <> 'done')::int AS tasks_open,
      (SELECT COUNT(*) FROM tasks WHERE status = 'done')::int AS tasks_done,
      (SELECT COUNT(*) FROM contacts)::int AS contacts,
      (SELECT COUNT(*) FROM files)::int AS files,
      (SELECT COUNT(*) FROM contacts WHERE notify = true)::int AS notify_targets`
  )[0];

  const lastAlert = (
    await sql`SELECT a.*, u.name AS sender_name FROM alerts a LEFT JOIN users u ON u.id = a.sender_id
              ORDER BY a.id DESC LIMIT 1`
  )[0];

  return (
    <>
      <div className="page-head">
        <h1>대응 상황판</h1>
        <Link href="/alerts" className="btn-danger">🚨 비상 알림 보내기</Link>
      </div>

      <div className="stat-grid">
        <Link className="stat" href="/timeline"><span className="stat-num">{s.timeline}</span><span className="stat-label">상황 일지</span></Link>
        <Link className="stat" href="/tasks"><span className="stat-num">{s.tasks_open}</span><span className="stat-label">진행중 업무</span></Link>
        <Link className="stat" href="/tasks"><span className="stat-num">{s.tasks_done}</span><span className="stat-label">완료 업무</span></Link>
        <Link className="stat" href="/contacts"><span className="stat-num">{s.contacts}</span><span className="stat-label">연락처</span></Link>
        <Link className="stat" href="/files"><span className="stat-num">{s.files}</span><span className="stat-label">자료</span></Link>
        <Link className="stat" href="/alerts"><span className="stat-num">{s.notify_targets}</span><span className="stat-label">알림 대상</span></Link>
      </div>

      {lastAlert && (
        <div className="last-alert">
          <strong>최근 비상 알림</strong> · {fmtDateTime(lastAlert.created_at)} · {lastAlert.sender_name || '-'} ·
          {' '}수신 {lastAlert.success_cnt}/{lastAlert.recipient_cnt}명
          <div className="last-alert-msg">{lastAlert.message}</div>
        </div>
      )}

      <div className="dash-cols">
        <section className="card">
          <div className="card-head">
            <h2>최근 상황 일지</h2>
            <Link href="/timeline/new" className="btn-sm">＋ 기록</Link>
          </div>
          {recentTimeline.length === 0 ? (
            <p className="empty">아직 기록이 없습니다. 상황이 생기면 바로 남겨두세요.</p>
          ) : (
            <ul className="tl-list">
              {recentTimeline.map((t) => (
                <li key={t.id}>
                  <Link href={`/timeline/${t.id}`}>
                    <span className={catClass(t.category)}>{t.category}</span>
                    <span className="tl-title">{t.title}</span>
                  </Link>
                  <div className="tl-meta">
                    {fmtDateTime(t.occurred_at)} · {t.author_name || '-'}
                    {t.file_count > 0 && ` · 📎${t.file_count}`}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>처리할 업무</h2>
            <Link href="/tasks" className="btn-sm">전체 보기</Link>
          </div>
          {openTasks.length === 0 ? (
            <p className="empty">진행중인 업무가 없습니다.</p>
          ) : (
            <ul className="task-mini">
              {openTasks.map((t) => (
                <li key={t.id}>
                  <span className={`pri pri-${t.priority}`} />
                  <span className="task-mini-title">{t.title}</span>
                  <span className="task-mini-meta">
                    {t.assignee_name && t.assignee_name}
                    {t.due_date && ` · ~${fmtDate(t.due_date)}`}
                    <span className={`chip chip-${t.status}`}>{t.status === 'doing' ? '진행중' : '할일'}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
