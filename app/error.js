'use client';

export default function Error({ error, reset }) {
  return (
    <div className="error-page">
      <h1>문제가 발생했습니다</h1>
      <p>일시적인 오류일 수 있습니다. 다시 시도해 주세요.</p>
      {error?.message && (
        <p style={{ color: 'var(--muted)', fontSize: '.85rem', marginTop: 8 }}>{error.message}</p>
      )}
      <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'center' }}>
        <button className="btn-primary" onClick={() => reset()}>다시 시도</button>
        <a href="/" className="btn-sm">상황판으로</a>
      </div>
    </div>
  );
}
