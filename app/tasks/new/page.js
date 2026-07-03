import Link from 'next/link';
import { sql } from '@/lib/db';
import { createTask } from '@/actions/tasks';

export const dynamic = 'force-dynamic';

export default async function NewTaskPage() {
  const members = await sql`SELECT id, name FROM users WHERE active = true AND status = 'active' ORDER BY name`;

  return (
    <>
      <div className="page-head"><h1>새 대응 업무</h1></div>
      <form action={createTask} className="form-card">
        <label>업무 제목
          <input type="text" name="title" placeholder="예: 경찰서에 집회 신고 확인 요청" required autoFocus />
        </label>
        <div className="grid2">
          <label>담당자
            <select name="assignee_id" defaultValue="">
              <option value="">미지정</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
          <label>우선순위
            <select name="priority" defaultValue="normal">
              <option value="high">높음</option>
              <option value="normal">보통</option>
              <option value="low">낮음</option>
            </select>
          </label>
          <label>기한<input type="date" name="due_date" /></label>
        </div>
        <label>세부 내용<textarea name="description" rows={4} placeholder="필요한 세부 사항" /></label>
        <div className="form-actions">
          <button className="btn-primary">등록</button>
          <Link href="/tasks" className="btn-ghost" style={{ color: 'var(--muted)', borderColor: 'var(--line)' }}>취소</Link>
        </div>
      </form>
    </>
  );
}
