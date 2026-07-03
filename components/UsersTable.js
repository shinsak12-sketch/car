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

function UserRow({ u, toggle, reset, setRoleAction, profile, currentUserId }) {
  const [mode, setMode] = useState(''); // '' | 'edit' | 'reset'

  if (mode === 'edit') {
    return (
      <tr>
        <td colSpan={6}>
          <form action={profile} className="edit-form" style={{ padding: '4px 0' }}>
            <div className="grid2">
              <label>이름<input type="text" name="name" defaultValue={u.name} required /></label>
              <label>직책<input type="text" name="position" defaultValue={u.position || ''} placeholder="예: 팀장" /></label>
              <label>전화<input type="tel" name="phone" defaultValue={u.phone || ''} /></label>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn-sm btn-primary" style={{ color: '#fff' }}>저장</button>
              <button type="button" className="mini" onClick={() => setMode('')}>취소</button>
            </div>
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr className={u.active ? '' : 'row-off'}>
      <td>{u.username}</td>
      <td>{u.name}</td>
      <td>{u.position || '-'}</td>
      <td><RoleCell user={u} currentUserId={currentUserId} setRoleAction={setRoleAction} /></td>
      <td>{u.active ? '활성' : '비활성'}</td>
      <td className="row-actions">
        <button className="mini" onClick={() => setMode('edit')}>정보수정</button>
        <button className="mini" onClick={() => setMode(mode === 'reset' ? '' : 'reset')}>비번변경</button>
        {u.id !== currentUserId && (
          <form action={toggle} className="inline">
            <button className="mini">{u.active ? '비활성화' : '활성화'}</button>
          </form>
        )}
        {mode === 'reset' && (
          <form action={reset} className="inline" style={{ display: 'flex', gap: 6, marginTop: 6, width: '100%' }}>
            <input type="text" name="password" placeholder="새 비밀번호" required />
            <button className="mini">변경</button>
          </form>
        )}
      </td>
    </tr>
  );
}

export default function UsersTable({ rows, currentUserId }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr><th>아이디</th><th>이름</th><th>직책</th><th>권한</th><th>상태</th><th>관리</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <UserRow key={r.u.id} {...r} currentUserId={currentUserId} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
