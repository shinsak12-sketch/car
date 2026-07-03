'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { upload, UPLOAD_DIR } = require('../services/upload');

const router = express.Router();

// 목록
router.get('/', (req, res) => {
  const items = db
    .prepare(
      `SELECT f.*, u.name AS uploader_name, t.title AS timeline_title
       FROM files f
       LEFT JOIN users u ON u.id = f.uploader_id
       LEFT JOIN timeline t ON t.id = f.timeline_id
       ORDER BY f.id DESC`
    )
    .all();
  res.render('files', { title: '증거 · 자료함', items });
});

// 업로드 (독립 파일)
router.post('/', upload.array('files', 20), (req, res) => {
  const memo = req.body.memo || '';
  for (const f of req.files || []) {
    db.prepare(
      'INSERT INTO files (filename, original, mimetype, size, memo, uploader_id) VALUES (?,?,?,?,?,?)'
    ).run(
      f.filename,
      Buffer.from(f.originalname, 'latin1').toString('utf8'),
      f.mimetype,
      f.size,
      memo,
      req.session.user.id
    );
  }
  res.redirect('/files');
});

// 다운로드 / 미리보기
router.get('/:id/raw', (req, res) => {
  const f = db.prepare('SELECT * FROM files WHERE id = ?').get(req.params.id);
  if (!f) return res.status(404).send('파일 없음');
  const full = path.join(UPLOAD_DIR, f.filename);
  if (!fs.existsSync(full)) return res.status(404).send('파일이 삭제되었습니다.');
  const inline = req.query.inline === '1';
  res.setHeader(
    'Content-Disposition',
    `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.original)}`
  );
  if (f.mimetype) res.setHeader('Content-Type', f.mimetype);
  fs.createReadStream(full).pipe(res);
});

// 삭제
router.post('/:id/delete', (req, res) => {
  const f = db.prepare('SELECT * FROM files WHERE id = ?').get(req.params.id);
  if (f) {
    const full = path.join(UPLOAD_DIR, f.filename);
    fs.existsSync(full) && fs.unlinkSync(full);
    db.prepare('DELETE FROM files WHERE id = ?').run(f.id);
  }
  const back = req.get('referer') || '/files';
  res.redirect(back);
});

module.exports = router;
