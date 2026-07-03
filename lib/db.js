import { neon } from '@neondatabase/serverless';

// Neon 서버리스 드라이버 (HTTP). 서버리스/엣지 환경에 최적.
// sql`...` 태그드 템플릿으로 파라미터 바인딩된 쿼리를 실행합니다.
//
// 빌드 시점에는 DATABASE_URL 이 없을 수 있으므로, 최초 쿼리 시점에
// 연결을 만들도록 지연 초기화합니다.

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

// sql`SELECT ...` 형태로 그대로 사용할 수 있는 태그드 템플릿 프록시
export function sql(strings, ...values) {
  return getClient()(strings, ...values);
}

// 동적 쿼리용: query('SELECT ... WHERE x = $1', [v])
export function query(text, params = []) {
  return getClient().query(text, params);
}
