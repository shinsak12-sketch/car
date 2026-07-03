// Postgres TIMESTAMPTZ/DATE 값을 KST 기준 문자열로 표시

function toDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  let s = String(v);
  if (s.includes(' ') && !s.includes('T')) s = s.replace(' ', 'T');
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function kst(d) {
  return new Date(d.getTime() + 9 * 3600 * 1000);
}

export function fmtDateTime(v) {
  const d = toDate(v);
  if (!d) return '';
  return kst(d).toISOString().slice(0, 16).replace('T', ' ');
}

export function fmtDate(v) {
  const d = toDate(v);
  if (!d) return '';
  return kst(d).toISOString().slice(0, 10);
}

// datetime-local 입력용 현재 KST 시각 'YYYY-MM-DDTHH:mm'
export function nowLocalInput() {
  return kst(new Date()).toISOString().slice(0, 16);
}

// 기존 값(TIMESTAMPTZ)을 datetime-local 입력용 KST 문자열로
export function toLocalInput(v) {
  const d = toDate(v);
  if (!d) return nowLocalInput();
  return kst(d).toISOString().slice(0, 16);
}

export function fmtSize(n) {
  n = Number(n) || 0;
  if (n < 1024) return n + 'B';
  if (n < 1048576) return (n / 1024).toFixed(0) + 'KB';
  return (n / 1048576).toFixed(1) + 'MB';
}
