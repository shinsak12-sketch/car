'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };

const Icons = {
  tasks: (
    <svg viewBox="0 0 24 24" {...stroke}><path d="M9 6h11M9 12h11M9 18h11" /><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" /></svg>
  ),
  log: (
    <svg viewBox="0 0 24 24" {...stroke}><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></svg>
  ),
  home: (
    <svg viewBox="0 0 24 24" {...stroke}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" /></svg>
  ),
  files: (
    <svg viewBox="0 0 24 24" {...stroke}><path d="M3 7a2 2 0 0 1 2-2h3.5l2 2H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
  ),
  more: (
    <svg viewBox="0 0 24 24" {...stroke}><path d="M4 7h16M4 12h16M4 17h16" /></svg>
  ),
};

export default function BottomNav({ isAdmin }) {
  const path = usePathname() || '/';
  const [sheet, setSheet] = useState(false);
  const is = (p) => (p === '/' ? path === '/' : path.startsWith(p));
  const close = () => setSheet(false);

  return (
    <>
      <nav className="bottomnav">
        <Link href="/tasks" className={`bn-item ${is('/tasks') ? 'on' : ''}`}>{Icons.tasks}<span>업무</span></Link>
        <Link href="/timeline" className={`bn-item ${is('/timeline') ? 'on' : ''}`}>{Icons.log}<span>일지</span></Link>
        <Link href="/" className={`bn-home ${is('/') ? 'on' : ''}`} aria-label="상황판">{Icons.home}</Link>
        <Link href="/files" className={`bn-item ${is('/files') ? 'on' : ''}`}>{Icons.files}<span>자료</span></Link>
        <button type="button" className={`bn-item ${sheet ? 'on' : ''}`} onClick={() => setSheet(true)}>{Icons.more}<span>더보기</span></button>
      </nav>

      {sheet && (
        <div className="sheet-backdrop" onClick={close}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <Link href="/alerts" className="sheet-item alert" onClick={close}><span>🚨</span> 비상 알림</Link>
            <Link href="/contacts" className="sheet-item" onClick={close}><span>📇</span> 연락처 · 관계자</Link>
            {isAdmin && <Link href="/report" className="sheet-item" onClick={close}><span>📝</span> 보고서 프롬프트</Link>}
            {isAdmin && <Link href="/users" className="sheet-item" onClick={close}><span>👤</span> 사용자 관리</Link>}
            <Link href="/account" className="sheet-item" onClick={close}><span>⚙️</span> 내 계정</Link>
            <form action="/api/logout" method="post">
              <button className="sheet-item logout"><span>↩️</span> 로그아웃</button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
