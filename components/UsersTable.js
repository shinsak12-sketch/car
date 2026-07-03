'use client';

import { useState } from 'react';

function RoleCell({ user, currentUserId, setRoleAction }) {
  if (user.id === currentUserId) return <span>{user.role === 'admin' ? '관리자' : '일반'}</span>;
  return (
    <form action={setRoleAction}>
      <select name="role" defaultValue={user.role} onChange={(e) => e.target.form.requestSubmit()}>
        <option value="member">일반</option>
        <option value="admin">관리자</option>
      </select>
    </form>
  );
}

function ResetCell({ resetAction }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="mini" onClick={() => setOpen((v) => !v)}>비번변경</button>
      {open && (
        <form action={resetAction} className="inline" style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <input type="text" name="password" placeholder="새 비밀번호" required />
          <button className="mini">변경</button>
        </form>
      )}
    </>
  );
}

export default function UsersTable({ rows, currentUserId }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr><th>아이디</th><th>이름</th><th>전화</th><th>권한</th><th>상태</th><th>관리</th></tr>
        </thead>
        <tbody>
          {rows.map(({ u, toggle, reset, setRoleAction }) => (
            <tr key={u.id} className={u.active ? '' : 'row-off'}>
              <td>{u.username}</td>
              <td>{u.name}</td>
              <td>{u.phone || '-'}</td>
              <td><RoleCell user={u} currentUserId={currentUserId} setRoleAction={setRoleAction} /></td>
              <td>{u.active ? '활성' : '비활성'}</td>
              <td className="row-actions">
                <ResetCell resetAction={reset} />
                {u.id !== currentUserId && (
                  <form action={toggle} className="inline">
                    <button className="mini">{u.active ? '비활성화' : '활성화'}</button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
