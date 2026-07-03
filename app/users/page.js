import { redirect } from 'next/navigation';
import { sql } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { createUser, resetPassword, toggleActive, setRole } from '@/actions/users';
import AddUserForm from '@/components/AddUserForm';
import UsersTable from '@/components/UsersTable';

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

  const users = await sql`SELECT id, username, name, phone, role, active, created_at FROM users ORDER BY id`;
  const rows = users.map((u) => ({
    u,
    toggle: toggleActive.bind(null, u.id),
    reset: resetPassword.bind(null, u.id),
    setRoleAction: setRole.bind(null, u.id),
  }));

  return (
    <>
      <div className="page-head"><h1>사용자 관리</h1></div>
      <AddUserForm action={createUser} />
      <UsersTable rows={rows} currentUserId={session.id} />
    </>
  );
}
