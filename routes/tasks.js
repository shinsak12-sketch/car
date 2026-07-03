'use strict';

const express = require('express');
const db = require('../db');

const router = express.Router();

const STATUSES = ['todo', 'doing', 'done'];
const STATUS_LABEL = { todo: '할 일', doing: '진행 중', done: '완료' };
const PRIORITIES = ['high', 'normal', 'low'];

function members() {
  return db.prepare("SELECT id, name FROM users WHERE active = 1 ORDER BY name").all();
}

// 목록 (칸반 형태)
router.get('/', (req, res) => {
  const rows = db
    .prepare(
      `SELECT t.*, u.name AS assignee_name
       FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id
       ORDER BY CASE t.priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
                (t.due_date IS NULL), t.due_date ASC, t.id DESC`
    )
    .all();

  const columns = { todo: [], doing: [], done: [] };
  for (const r of rows) (columns[r.status] || columns.todo).push(r);

  res.render('tasks', {
    title: '대응 업무',
    columns,
    statusLabel: STATUS_LABEL,
    members: members(),
    priorities: PRIORITIES,
  });
});

// 생성
router.post('/', (req, res) => {
  const { title, description, priority, assignee_id, due_date } = req.body;
  if (!title || !title.trim()) return res.redirect('/tasks');
  db.prepare(
    `INSERT INTO tasks (title, description, priority, assignee_id, due_date, author_id)
     VALUES (?,?,?,?,?,?)`
  ).run(
    title.trim(),
    description || '',
    PRIORITIES.includes(priority) ? priority : 'normal',
    assignee_id ? Number(assignee_id) : null,
    due_date || null,
    req.session.user.id
  );
  res.redirect('/tasks');
});

// 상태 변경 (버튼/드롭다운)
router.post('/:id/status', (req, res) => {
  const { status } = req.body;
  if (STATUSES.includes(status)) {
    db.prepare("UPDATE tasks SET status=?, updated_at=datetime('now','localtime') WHERE id=?").run(status, req.params.id);
  }
  if (req.xhr || req.headers.accept?.includes('json')) return res.json({ ok: true });
  res.redirect('/tasks');
});

// 수정
router.post('/:id', (req, res) => {
  const { title, description, priority, assignee_id, due_date, status } = req.body;
  const t = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!t) return res.redirect('/tasks');
  db.prepare(
    `UPDATE tasks SET title=?, description=?, priority=?, assignee_id=?, due_date=?, status=?,
       updated_at=datetime('now','localtime') WHERE id=?`
  ).run(
    (title || t.title).trim(),
    description || '',
    PRIORITIES.includes(priority) ? priority : t.priority,
    assignee_id ? Number(assignee_id) : null,
    due_date || null,
    STATUSES.includes(status) ? status : t.status,
    t.id
  );
  res.redirect('/tasks');
});

// 삭제
router.post('/:id/delete', (req, res) => {
  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  res.redirect('/tasks');
});

module.exports = router;
