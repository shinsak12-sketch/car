'use client';

import { useState } from 'react';
import Link from 'next/link';
import ShieldLogo from '@/components/ShieldLogo';
import { ORG_NAME } from '@/lib/constants';

export default function RequestPage() {
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const f = new FormData(e.currentTarget);
    try {
      const res = await fetch('/api/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: f.get('name'),
          username: f.get('username'),
          phone: f.get('phone'),
          affiliation: f.get('affiliation'),
          password: f.get('password'),
        }),
      });
      const data = await res.json();
      if (data.ok) setDone(true);
      else {
        setError(data.error || '신청에 실패했습니다.');
        setLoading(false);
      }
    } catch {
      setError('서버에 연결할 수 없습니다.');
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-logo"><ShieldLogo size={54} /></div>
        <h1>{ORG_NAME}</h1>
        <p className="login-sub">접속 권한 요청</p>

        {done ? (
          <>
            <div className="flash ok" style={{ textAlign: 'left' }}>
              신청이 접수되었습니다. <b>관리자 승인 후</b> 입력하신 아이디·비밀번호로 로그인할 수 있습니다.
            </div>
            <Link href="/login" className="btn-primary btn-block">로그인 화면으로</Link>
          </>
        ) : (
          <>
            {error && <div className="flash error">{error}</div>}
            <form onSubmit={onSubmit} className="login-form">
              <label>이름
                <input type="text" name="name" autoFocus required placeholder="실명 또는 팀 내 호칭" />
              </label>
              <label>소속
                <input type="text" name="affiliation" placeholder="예: 총무팀 / 관리사무소" />
              </label>
              <label>아이디
                <input type="text" name="username" required placeholder="영문/숫자 3~20자" autoComplete="username" />
              </label>
              <label>비밀번호
                <input type="password" name="password" required placeholder="4자 이상" autoComplete="new-password" />
              </label>
              <label>연락처 <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(선택)</span>
                <input type="tel" name="phone" placeholder="010-0000-0000" />
              </label>
              <button type="submit" className="btn-primary btn-block" disabled={loading}>
                {loading ? '신청 중…' : '접속 권한 신청'}
              </button>
            </form>
            <p style={{ marginTop: 14, fontSize: '.85rem' }}>
              <Link href="/login" style={{ color: 'var(--muted)' }}>← 로그인 화면으로</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
