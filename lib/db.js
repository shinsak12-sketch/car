import { neon } from '@neondatabase/serverless';

// Neon 서버리스 드라이버 (HTTP). 서버리스/엣지 환경에 최적.
// 이 드라이버는 태그드 템플릿(sql`...`)만 지원하며 .query() 메서드는 없습니다.

let _sql = null;

function getClient() {
  if (_sql) return _sql;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL 이 설정되지 않았습니다. Neon 연결 문자열을 환경변수에 넣으세요.');
  }
  _sql = neon(url);
  return _sql;
}

// sql`SELECT ... ${value}` 형태의 파라미터 바인딩 쿼리
export function sql(strings, ...values) {
  return getClient()(strings, ...values);
}

// 파라미터 없는 단일 문장 실행 (DDL 등).
// neon http는 태그드 템플릿만 받으므로, 값이 없는 템플릿 배열 형태로 호출합니다.
export function exec(text) {
  const strings = [text];
  strings.raw = [text];
  return getClient()(strings);
}
