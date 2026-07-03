// Postgres 스키마 (단일 소스). 서버리스에서 파일 읽기 없이 import 하여 사용.
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id         SERIAL PRIMARY KEY,
  username   TEXT UNIQUE NOT NULL,
  password   TEXT NOT NULL,
  name       TEXT NOT NULL,
  phone      TEXT DEFAULT '',
  role       TEXT NOT NULL DEFAULT 'member',
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS timeline (
  id          SERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  body        TEXT DEFAULT '',
  category    TEXT NOT NULL DEFAULT '기타',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  author_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS tasks (
  id          SERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'todo',
  priority    TEXT NOT NULL DEFAULT 'normal',
  assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  due_date    DATE,
  author_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS contacts (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  org         TEXT DEFAULT '',
  role        TEXT DEFAULT '',
  phone       TEXT DEFAULT '',
  email       TEXT DEFAULT '',
  category    TEXT NOT NULL DEFAULT '기타',
  memo        TEXT DEFAULT '',
  notify      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS files (
  id           SERIAL PRIMARY KEY,
  url          TEXT NOT NULL,
  pathname     TEXT NOT NULL,
  original     TEXT NOT NULL,
  mimetype     TEXT DEFAULT '',
  size         BIGINT DEFAULT 0,
  memo         TEXT DEFAULT '',
  timeline_id  INTEGER REFERENCES timeline(id) ON DELETE SET NULL,
  uploader_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS alerts (
  id            SERIAL PRIMARY KEY,
  message       TEXT NOT NULL,
  channel       TEXT NOT NULL DEFAULT 'sms',
  provider      TEXT DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'sent',
  recipients    JSONB DEFAULT '[]',
  recipient_cnt INTEGER NOT NULL DEFAULT 0,
  success_cnt   INTEGER NOT NULL DEFAULT 0,
  detail        TEXT DEFAULT '',
  sender_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         SERIAL PRIMARY KEY,
  endpoint   TEXT UNIQUE NOT NULL,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
  user_name  TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_timeline_occurred ON timeline (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_files_timeline ON files (timeline_id);
`;

// 세미콜론 기준으로 개별 실행 문장 배열 반환 (neon http는 문장을 하나씩 실행)
export function schemaStatements() {
  return SCHEMA.split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}
