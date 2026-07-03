import Link from 'next/link';
import { sql } from '@/lib/db';
import { fmtDate, fmtDateTime, userLabel } from '@/lib/format';
import { TASK_STATUS_LABEL, PRIORITY_LABEL } from '@/lib/constants';
import { setTaskStatus, deleteTask } from '@/actions/tasks';
import ConfirmButton from '@/components/ConfirmButton';

export const dynamic = 'force-dynamic';

export default async function TasksPage() {
  const rows = await sql`
    SELECT t.*, u.name AS assignee_name,
      a.name AS author_name, a.position AS author_position, a.affiliation AS author_affiliation
    FROM tasks t
    LEFT JOIN users u ON u.id = t.assignee_id
    LEFT JOIN users a ON a.id = t.author_id
    ORDER BY CASE t.priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
             (t.due_date IS NULL), t.due_date ASC, t.id DESC`;

  const columns = { todo: [], doing: [], done: [] };
  for (const r of rows) (columns[r.status] || columns.todo).push(r);

  return (
    <>
      <div className="page-head">
        <h1>대응 업무</h1>
        <Link href="/tasks/new" className="btn-primary">＋ 업무 추가</Link>
      </div>

      <div className="kanban">
        {['todo', 'doing', 'done'].map((st) => (
          <div className={`kb-col kb-${st}`} key={st}>
            <div className="kb-head">{TASK_STATUS_LABEL[st]} <span className="kb-count">{columns[st].length}</span></div>
            {columns[st].length === 0 && <p className="empty small">없음</p>}
            {columns[st].map((t) => (
              <div className={`kb-card pri-border-${t.priority}`} key={t.id}>
                <div className="kb-card-title">{t.title}</div>
                {t.description && <div className="kb-card-desc">{t.description}</div>}
                <div className="kb-card-meta">
                  {t.assignee_name && <span>👤 {t.assignee_name}</span>}
                  {t.due_date && <span>📅 {fmtDate(t.due_date)}</span>}
                  <span className={`pri-tag pri-${t.priority}`}>{PRIORITY_LABEL[t.priority]}</span>
                </div>
                <div className="kb-card-by">작성 {userLabel(t.author_name, t.author_position, t.author_affiliation)} · {fmtDateTime(t.created_at)}</div>
                <div className="kb-card-actions">
                  <div className="inline" style={{ display: 'flex', gap: 6 }}>
                    {st !== 'todo' && <form action={setTaskStatus.bind(null, t.id, 'todo')} className="inline"><button className="mini">← 할일</button></form>}
                    {st !== 'doing' && <form action={setTaskStatus.bind(null, t.id, 'doing')} className="inline"><button className="mini">진행</button></form>}
                    {st !== 'done' && <form action={setTaskStatus.bind(null, t.id, 'done')} className="inline"><button className="mini done">완료 ✓</button></form>}
                  </div>
                  <form action={deleteTask.bind(null, t.id)} className="inline">
                    <ConfirmButton message="삭제할까요?">✕</ConfirmButton>
                  </form>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
