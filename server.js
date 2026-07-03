'use strict';

require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const SqliteStore = require('better-sqlite3-session-store')(session);
const Database = require('better-sqlite3');

const db = require('./db');
const { requireLogin } = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;
const ORG_NAME = process.env.ORG_NAME || '대응상황실';

// 업로드 폴더 보장
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const DATA_DIR = path.join(__dirname, 'data');

// ─── 뷰 엔진 ──────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ─── 미들웨어 ─────────────────────────────────────────
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/static', express.static(path.join(__dirname, 'public')));

const sessionDb = new Database(path.join(DATA_DIR, 'sessions.db'));
app.use(
  session({
    store: new SqliteStore({
      client: sessionDb,
      expired: { clear: true, intervalMs: 1000 * 60 * 60 * 12 },
    }),
    secret: process.env.SESSION_SECRET || 'dev-secret-please-change',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 }, // 7일
  })
);

// 공통 로컬 변수
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.orgName = ORG_NAME;
  res.locals.path = req.path;
  next();
});

// ─── 라우트 ───────────────────────────────────────────
app.use('/', require('./routes/auth'));
app.use('/', require('./routes/dashboard'));
app.use('/timeline', requireLogin, require('./routes/timeline'));
app.use('/tasks', requireLogin, require('./routes/tasks'));
app.use('/contacts', requireLogin, require('./routes/contacts'));
app.use('/files', requireLogin, require('./routes/files'));
app.use('/alerts', requireLogin, require('./routes/alerts'));
app.use('/users', requireLogin, require('./routes/users'));

// 404
app.use((req, res) => {
  res.status(404).render('error', { title: '없는 페이지', message: '페이지를 찾을 수 없습니다.' });
});

// 에러 핸들러
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', { title: '오류', message: '문제가 발생했습니다: ' + err.message });
});

app.listen(PORT, () => {
  console.log(`\n  ▶ 분쟁 대응 관리 프로그램 실행 중`);
  console.log(`  ▶ http://localhost:${PORT}\n`);
});
