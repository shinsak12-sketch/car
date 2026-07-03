'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAdmin } = require('../auth');

const router = express.Router();

router.use(requireAdmin);

router.get('/', (req, res) => {
  const users = db.prepare('SELECT id, username, name, phone, role, active, created_at FROM users ORDER BY id').all();
  res.render('users', { title: '사용자 관리', users, msg: req.query.msg || null });
});

router.post('/', (req, res) => {
  const { username, name, phone, password, role } = req.body;
  if (!username || !name || !password) return res.redirect('/users?msg=필수+항목을+입력하세요');
  const exists = db.prepare('SELECT 1 FROM users WHERE username = ?').get(username.trim());
  if (exists) return res.redirect('/users?msg=이미+있는+아이디입니다');
  db.prepare('INSERT INTO users (username, name, phone, password, role) VALUES (?,?,?,?,?)').run(
    username.trim(),
    name.trim(),
    phone || '',
    bcrypt.hashSync(password, 10),
    role === 'admin' ? 'admin' : 'member'
  );
  res.redirect('/users?msg=추가되었습니다');
});

// 비밀번호 초기화
router.post('/:id/reset', (req, res) => {
  const { password } = req.body;
  if (password && password.length >= 4) {
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(bcrypt.hashSync(password, 10), req.params.id);
  }
  res.redirect('/users?msg=비밀번호가+변경되었습니다');
});

// 활성/비활성 토글
router.post('/:id/toggle', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (u && u.id !== req.session.user.id) {
    db.prepare('UPDATE users SET active = ? WHERE id = ?').run(u.active ? 0 : 1, u.id);
  }
  res.redirect('/users');
});

// 역할 변경
router.post('/:id/role', (req, res) => {
  const { role } = req.body;
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (u && u.id !== req.session.user.id) {
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role === 'admin' ? 'admin' : 'member', u.id);
  }
  res.redirect('/users');
});

module.exports = router;
