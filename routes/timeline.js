'use strict';

const express = require('express');
const db = require('../db');
const { upload } = require('../services/upload');

const router = express.Router();

const CATEGORIES = ['집회', '소음', '충돌', '접촉', '경찰', '기타'];

// 목록
router.get('/', (req, res) => {
  const { category, q } = req.query;
  let sql = `SELECT t.*, u.name AS author_name,
                    (SELECT COUNT(*) FROM files f WHERE f.timeline_id = t.id) AS file_count
             FROM timeline t LEFT JOIN users u ON u.id = t.author_id`;
  const where = [];
  const params = [];
  if (category && CATEGORIES.includes(category)) {
    where.push('t.category = ?');
    params.push(category);
  }
  if (q) {
    where.push('(t.title LIKE ? OR t.body LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY t.occurred_at DESC, t.id DESC';

  const items = db.prepare(sql).all(...params);
  res.render('timeline', { title: '상황 일지', items, categories: CATEGORIES, category: category || '', q: q || '' });
});

// 새 항목 폼
router.get('/new', (req, res) => {
  res.render('timeline_form', { title: '일지 작성', item: null, categories: CATEGORIES });
});

// 상세
router.get('/:id', (req, res) => {
  const item = db
    .prepare(`SELECT t.*, u.name AS author_name FROM timeline t LEFT JOIN users u ON u.id = t.author_id WHERE t.id = ?`)
    .get(req.params.id);
  if (!item) return res.status(404).render('error', { title: '없음', message: '일지를 찾을 수 없습니다.' });
  const files = db.prepare('SELECT * FROM files WHERE timeline_id = ? ORDER BY id').all(item.id);
  res.render('timeline_detail', { title: item.title, item, files });
});

// 수정 폼
router.get('/:id/edit', (req, res) => {
  const item = db.prepare('SELECT * FROM timeline WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).render('error', { title: '없음', message: '일지를 찾을 수 없습니다.' });
  res.render('timeline_form', { title: '일지 수정', item, categories: CATEGORIES });
});

// 생성 (사진 여러 장 첨부 가능)
router.post('/', upload.array('photos', 10), (req, res) => {
  const { title, body, category, occurred_at } = req.body;
  const info = db
    .prepare('INSERT INTO timeline (title, body, category, occurred_at, author_id) VALUES (?,?,?,?,?)')
    .run(
      (title || '(제목 없음)').trim(),
      body || '',
      CATEGORIES.includes(category) ? category : '기타',
      occurred_at || new Date().toISOString().slice(0, 16),
      req.session.user.id
    );
  const timelineId = info.lastInsertRowid;

  for (const f of req.files || []) {
    db.prepare(
      'INSERT INTO files (filename, original, mimetype, size, timeline_id, uploader_id) VALUES (?,?,?,?,?,?)'
    ).run(f.filename, Buffer.from(f.originalname, 'latin1').toString('utf8'), f.mimetype, f.size, timelineId, req.session.user.id);
  }
  res.redirect('/timeline/' + timelineId);
});

// 수정
router.post('/:id', upload.array('photos', 10), (req, res) => {
  const { title, body, category, occurred_at } = req.body;
  const item = db.prepare('SELECT * FROM timeline WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).render('error', { title: '없음', message: '일지를 찾을 수 없습니다.' });

  db.prepare('UPDATE timeline SET title=?, body=?, category=?, occurred_at=? WHERE id=?').run(
    (title || '(제목 없음)').trim(),
    body || '',
    CATEGORIES.includes(category) ? category : '기타',
    occurred_at || item.occurred_at,
    item.id
  );
  for (const f of req.files || []) {
    db.prepare(
      'INSERT INTO files (filename, original, mimetype, size, timeline_id, uploader_id) VALUES (?,?,?,?,?,?)'
    ).run(f.filename, Buffer.from(f.originalname, 'latin1').toString('utf8'), f.mimetype, f.size, item.id, req.session.user.id);
  }
  res.redirect('/timeline/' + item.id);
});

// 삭제
router.post('/:id/delete', (req, res) => {
  db.prepare('DELETE FROM timeline WHERE id = ?').run(req.params.id);
  res.redirect('/timeline');
});

module.exports = router;
