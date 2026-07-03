'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

// 모바일 전용 하단 탭바 (앱처럼). 데스크톱에서는 CSS로 숨김.
export default function BottomNav({ isAdmin }) {
  const path = usePathname() || '/';
  const [sheet, setSheet] = useState(false);
  const is = (p) => (p === '/' ? path === '/' : path.startsWith(p));
  const close = () => setSheet(false);

  return (
    <>
      <nav className="bottomnav">
        <Link href="/" className={`bn-item ${is('/') ? 'on' : ''}`}>
          <span className="bn-ico">🏠</span>상황판
        </Link>
        <Link href="/timeline" className={`bn-item ${is('/timeline') ? 'on' : ''}`}>
          <span className="bn-ico">📝</span>일지
        </Link>
        <Link href="/alerts" className="bn-alert" aria-label="비상 알림">
          <span className="bn-alert-ico">🚨</span>
        </Link>
        <Link href="/tasks" className={`bn-item ${is('/tasks') ? 'on' : ''}`}>
          <span className="bn-ico">✅</span>업무
        </Link>
        <button type="button" className={`bn-item ${sheet ? 'on' : ''}`} onClick={() => setSheet(true)}>
          <span className="bn-ico">☰</span>더보기
        </button>
      </nav>

      {sheet && (
        <div className="sheet-backdrop" onClick={close}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <Link href="/contacts" className="sheet-item" onClick={close}><span>📇</span> 연락처 · 관계자</Link>
            <Link href="/files" className="sheet-item" onClick={close}><span>🗂️</span> 증거 · 자료함</Link>
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
