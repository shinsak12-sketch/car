'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Nav({ user, orgName }) {
  const path = usePathname() || '/';
  const is = (p) => (p === '/' ? path === '/' : path.startsWith(p));

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link href="/" className="brand">🛡️ <span>{orgName}</span></Link>
        <nav className="mainnav">
          <Link href="/" className={is('/') ? 'active' : ''}>상황판</Link>
          <Link href="/timeline" className={is('/timeline') ? 'active' : ''}>상황 일지</Link>
          <Link href="/tasks" className={is('/tasks') ? 'active' : ''}>대응 업무</Link>
          <Link href="/contacts" className={is('/contacts') ? 'active' : ''}>연락처</Link>
          <Link href="/files" className={is('/files') ? 'active' : ''}>자료함</Link>
          <Link href="/alerts" className={`alert-link ${is('/alerts') ? 'active' : ''}`}>🚨 비상 알림</Link>
          {user.role === 'admin' && (
            <Link href="/users" className={is('/users') ? 'active' : ''}>사용자</Link>
          )}
        </nav>
        <div className="topbar-right">
          <Link href="/account" className="whoami">
            {user.name}
            {user.role === 'admin' && <span className="badge-admin">관리자</span>}
          </Link>
          <form action="/api/logout" method="post" className="inline">
            <button className="btn-ghost">로그아웃</button>
          </form>
        </div>
      </div>
    </header>
  );
}
