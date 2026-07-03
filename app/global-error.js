'use client';

// 루트 레이아웃에서 발생한 오류까지 잡는 최종 경계 (html/body 포함 필수)
export default function GlobalError({ error, reset }) {
  return (
    <html lang="ko">
      <body style={{ fontFamily: 'sans-serif', padding: 40, textAlign: 'center', color: '#1f2937' }}>
        <h1 style={{ fontSize: '1.3rem' }}>문제가 발생했습니다</h1>
        <p style={{ color: '#6b7280' }}>잠시 후 다시 시도해 주세요.</p>
        {error?.message && <p style={{ color: '#9ca3af', fontSize: '.85rem' }}>{error.message}</p>}
        <div style={{ marginTop: 16 }}>
          <button
            onClick={() => reset()}
            style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontSize: '1rem' }}
          >
            다시 시도
          </button>
        </div>
      </body>
    </html>
  );
}
