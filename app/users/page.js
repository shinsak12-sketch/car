import { redirect } from 'next/navigation';
import { sql } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { createUser, resetPassword, toggleActive, setRole, approveUser, rejectUser } from '@/actions/users';
import { fmtDateTime } from '@/lib/format';
import AddUserForm from '@/components/AddUserForm';
import UsersTable from '@/components/UsersTable';
import ConfirmButton from '@/components/ConfirmButton';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'admin') {
    return (
      <div className="error-page">
        <h1>접근 불가</h1>
        <p>관리자만 사용자 관리를 할 수 있습니다.</p>
      </div>
    );
  }

  // status 컬럼이 없을 수도 있으므로 SELECT * 로 안전하게 가져와 JS 에서 분리
  const users = await sql`SELECT * FROM users ORDER BY id`;
  const pending = users.filter((u) => u.status === 'pending');
  const active = users.filter((u) => u.status !== 'pending');
  const rows = active.map((u) => ({
    u,
    toggle: toggleActive.bind(null, u.id),
    reset: resetPassword.bind(null, u.id),
    setRoleAction: setRole.bind(null, u.id),
  }));

  return (
    <>
      <div className="page-head"><h1>사용자 관리</h1></div>

      <section className="card" style={{ borderColor: pending.length ? '#fbbf24' : undefined }}>
        <div className="card-head">
          <h2>접속 권한 요청 {pending.length > 0 && <span className="req-badge">{pending.length}</span>}</h2>
        </div>
        {pending.length === 0 ? (
          <p className="empty">대기 중인 요청이 없습니다.</p>
        ) : (
          <div className="req-list">
            {pending.map((u) => (
              <div className="req-item" key={u.id}>
                <div className="req-info">
                  <strong>{u.name}</strong> <span className="req-id">@{u.username}</span>
                  {u.phone && <span className="req-phone"> · 📞 {u.phone}</span>}
                  <div className="req-time">신청 {fmtDateTime(u.created_at)}</div>
                </div>
                <div className="req-actions">
                  <form action={approveUser.bind(null, u.id)} className="inline">
                    <button className="btn-sm" style={{ background: '#16a34a', color: '#fff', border: 'none' }}>승인</button>
                  </form>
                  <form action={rejectUser.bind(null, u.id)} className="inline">
                    <ConfirmButton message={`${u.name}(@${u.username}) 신청을 거절(삭제)할까요?`} className="btn-sm btn-danger-ghost">거절</ConfirmButton>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <AddUserForm action={createUser} />
      <UsersTable rows={rows} currentUserId={session.id} />
    </>
  );
}
