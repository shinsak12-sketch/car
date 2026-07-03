'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'app.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── 스키마 ──────────────────────────────────────────────
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  username   TEXT UNIQUE NOT NULL,
  password   TEXT NOT NULL,
  name       TEXT NOT NULL,
  phone      TEXT,
  role       TEXT NOT NULL DEFAULT 'member',   -- admin | member
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 상황 일지 / 타임라인
CREATE TABLE IF NOT EXISTS timeline (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  body        TEXT,
  category    TEXT NOT NULL DEFAULT '기타',     -- 집회 | 소음 | 충돌 | 접촉 | 경찰 | 기타
  occurred_at TEXT NOT NULL,
  author_id   INTEGER REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 대응 업무 / 할일
CREATE TABLE IF NOT EXISTS tasks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'todo',     -- todo | doing | done
  priority    TEXT NOT NULL DEFAULT 'normal',   -- high | normal | low
  assignee_id INTEGER REFERENCES users(id),
  due_date    TEXT,
  author_id   INTEGER REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 연락처 / 관계자
CREATE TABLE IF NOT EXISTS contacts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  org         TEXT,
  role        TEXT,
  phone       TEXT,
  email       TEXT,
  category    TEXT NOT NULL DEFAULT '기타',     -- 경찰 | 구청 | 변호사 | 사내 | 상대측 | 기타
  memo        TEXT,
  notify      INTEGER NOT NULL DEFAULT 0,       -- 비상 알림 대상 여부
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 파일 / 증거 (타임라인에 연결 가능)
CREATE TABLE IF NOT EXISTS files (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  filename     TEXT NOT NULL,        -- 디스크에 저장된 이름
  original     TEXT NOT NULL,        -- 원본 파일명
  mimetype     TEXT,
  size         INTEGER,
  memo         TEXT,
  timeline_id  INTEGER REFERENCES timeline(id) ON DELETE SET NULL,
  uploader_id  INTEGER REFERENCES users(id),
  created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 비상 알림 발송 이력
CREATE TABLE IF NOT EXISTS alerts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  message       TEXT NOT NULL,
  channel       TEXT NOT NULL DEFAULT 'sms',    -- sms | kakao | record
  provider      TEXT,
  status        TEXT NOT NULL DEFAULT 'sent',   -- sent | recorded | failed
  recipients    TEXT,                            -- JSON: [{name,phone,ok}]
  recipient_cnt INTEGER NOT NULL DEFAULT 0,
  success_cnt   INTEGER NOT NULL DEFAULT 0,
  detail        TEXT,
  sender_id     INTEGER REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
`);

module.exports = db;
