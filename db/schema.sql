-- 분쟁 대응 관리 프로그램 · Neon Postgres 스키마

CREATE TABLE IF NOT EXISTS users (
  id         SERIAL PRIMARY KEY,
  username   TEXT UNIQUE NOT NULL,
  password   TEXT NOT NULL,
  name       TEXT NOT NULL,
  phone      TEXT DEFAULT '',
  role       TEXT NOT NULL DEFAULT 'member',   -- admin | member
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 상황 일지 / 타임라인
CREATE TABLE IF NOT EXISTS timeline (
  id          SERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  body        TEXT DEFAULT '',
  category    TEXT NOT NULL DEFAULT '기타',     -- 집회 | 소음 | 충돌 | 접촉 | 경찰 | 기타
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  author_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 대응 업무 / 할일
CREATE TABLE IF NOT EXISTS tasks (
  id          SERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'todo',     -- todo | doing | done
  priority    TEXT NOT NULL DEFAULT 'normal',   -- high | normal | low
  assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  due_date    DATE,
  author_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 연락처 / 관계자
CREATE TABLE IF NOT EXISTS contacts (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  org         TEXT DEFAULT '',
  role        TEXT DEFAULT '',
  phone       TEXT DEFAULT '',
  email       TEXT DEFAULT '',
  category    TEXT NOT NULL DEFAULT '기타',     -- 경찰 | 구청 | 변호사 | 사내 | 상대측 | 기타
  memo        TEXT DEFAULT '',
  notify      BOOLEAN NOT NULL DEFAULT FALSE,   -- 비상 알림 대상 여부
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 파일 / 증거 (Vercel Blob 에 저장, URL 보관)
CREATE TABLE IF NOT EXISTS files (
  id           SERIAL PRIMARY KEY,
  url          TEXT NOT NULL,        -- Blob 공개 URL
  pathname     TEXT NOT NULL,        -- Blob pathname (삭제용)
  original     TEXT NOT NULL,        -- 원본 파일명
  mimetype     TEXT DEFAULT '',
  size         BIGINT DEFAULT 0,
  memo         TEXT DEFAULT '',
  timeline_id  INTEGER REFERENCES timeline(id) ON DELETE SET NULL,
  uploader_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 비상 알림 발송 이력
CREATE TABLE IF NOT EXISTS alerts (
  id            SERIAL PRIMARY KEY,
  message       TEXT NOT NULL,
  channel       TEXT NOT NULL DEFAULT 'sms',    -- sms | kakao | record
  provider      TEXT DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'sent',   -- sent | recorded | failed
  recipients    JSONB DEFAULT '[]',             -- [{name,phone,ok,info}]
  recipient_cnt INTEGER NOT NULL DEFAULT 0,
  success_cnt   INTEGER NOT NULL DEFAULT 0,
  detail        TEXT DEFAULT '',
  sender_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_timeline_occurred ON timeline (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_files_timeline ON files (timeline_id);
