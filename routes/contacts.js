'use strict';

const express = require('express');
const db = require('../db');

const router = express.Router();

const CATEGORIES = ['경찰', '구청', '변호사', '사내', '상대측', '기타'];

router.get('/', (req, res) => {
  const { category, q } = req.query;
  let sql = 'SELECT * FROM contacts';
  const where = [];
  const params = [];
  if (category && CATEGORIES.includes(category)) {
    where.push('category = ?');
    params.push(category);
  }
  if (q) {
    where.push('(name LIKE ? OR org LIKE ? OR phone LIKE ? OR memo LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ` ORDER BY CASE category
             WHEN '경찰' THEN 0 WHEN '구청' THEN 1 WHEN '변호사' THEN 2
             WHEN '사내' THEN 3 WHEN '상대측' THEN 4 ELSE 5 END, name`;
  const items = db.prepare(sql).all(...params);
  res.render('contacts', { title: '연락처', items, categories: CATEGORIES, category: category || '', q: q || '' });
});

router.post('/', (req, res) => {
  const { name, org, role, phone, email, category, memo, notify } = req.body;
  if (!name || !name.trim()) return res.redirect('/contacts');
  db.prepare(
    `INSERT INTO contacts (name, org, role, phone, email, category, memo, notify)
     VALUES (?,?,?,?,?,?,?,?)`
  ).run(
    name.trim(),
    org || '',
    role || '',
    phone || '',
    email || '',
    CATEGORIES.includes(category) ? category : '기타',
    memo || '',
    notify ? 1 : 0
  );
  res.redirect('/contacts');
});

router.post('/:id', (req, res) => {
  const { name, org, role, phone, email, category, memo, notify } = req.body;
  const c = db.prepare('SELECT * FROM contacts WHERE id = ?').get(req.params.id);
  if (!c) return res.redirect('/contacts');
  db.prepare(
    `UPDATE contacts SET name=?, org=?, role=?, phone=?, email=?, category=?, memo=?, notify=? WHERE id=?`
  ).run(
    (name || c.name).trim(),
    org || '',
    role || '',
    phone || '',
    email || '',
    CATEGORIES.includes(category) ? category : c.category,
    memo || '',
    notify ? 1 : 0,
    c.id
  );
  res.redirect('/contacts');
});

router.post('/:id/delete', (req, res) => {
  db.prepare('DELETE FROM contacts WHERE id = ?').run(req.params.id);
  res.redirect('/contacts');
});

module.exports = router;
