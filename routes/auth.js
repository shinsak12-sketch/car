'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');

const router = express.Router();

router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('login', { title: '로그인', error: null });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = db
    .prepare('SELECT * FROM users WHERE username = ? AND active = 1')
    .get((username || '').trim());

  if (!user || !bcrypt.compareSync(password || '', user.password)) {
    return res.status(401).render('login', {
      title: '로그인',
      error: '아이디 또는 비밀번호가 올바르지 않습니다.',
    });
  }

  req.session.user = {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
  };
  res.redirect('/');
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// 자기 비밀번호 변경
router.get('/account', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  res.render('account', { title: '내 계정', msg: null, error: null });
});

router.post('/account/password', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  const { current, next1, next2 } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);

  if (!bcrypt.compareSync(current || '', user.password)) {
    return res.render('account', { title: '내 계정', msg: null, error: '현재 비밀번호가 틀립니다.' });
  }
  if (!next1 || next1.length < 4) {
    return res.render('account', { title: '내 계정', msg: null, error: '새 비밀번호는 4자 이상이어야 합니다.' });
  }
  if (next1 !== next2) {
    return res.render('account', { title: '내 계정', msg: null, error: '새 비밀번호가 서로 다릅니다.' });
  }
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(bcrypt.hashSync(next1, 10), user.id);
  res.render('account', { title: '내 계정', msg: '비밀번호가 변경되었습니다.', error: null });
});

module.exports = router;
