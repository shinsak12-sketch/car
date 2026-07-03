'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ORG_NAME } from '@/lib/constants';

export default function LoginPage() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: form.get('username'), password: form.get('password') }),
      });
      const data = await res.json();
      if (data.ok) {
        router.push('/');
        router.refresh();
      } else {
        setError(data.error || '로그인에 실패했습니다.');
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
        <div className="login-logo">🛡️</div>
        <h1>{ORG_NAME}</h1>
        <p className="login-sub">분쟁 대응 관리 · 로그인</p>
        {error && <div className="flash error">{error}</div>}
        <form onSubmit={onSubmit} className="login-form">
          <label>
            아이디
            <input type="text" name="username" autoComplete="username" autoFocus required />
          </label>
          <label>
            비밀번호
            <input type="password" name="password" autoComplete="current-password" required />
          </label>
          <button type="submit" className="btn-primary btn-block" disabled={loading}>
            {loading ? '확인 중…' : '로그인'}
          </button>
        </form>
      </div>
    </div>
  );
}
