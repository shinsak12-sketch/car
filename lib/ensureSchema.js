import { exec } from '@/lib/db';
import { schemaStatements } from '@/db/schema';

// 스키마(테이블/컬럼)를 서버 인스턴스당 1회 자동 보정 (idempotent).
// 새 컬럼/테이블 추가 시 /api/setup 을 다시 안 돌려도 첫 관련 동작에서 스스로 맞춰집니다.
let done = null;

export function ensureSchema() {
  if (!done) {
    done = (async () => {
      for (const stmt of schemaStatements()) {
        try {
          await exec(stmt);
        } catch {
          /* 이미 있으면 무시 */
        }
      }
    })().catch(() => {});
  }
  return done;
}
