'use strict';

const express = require('express');
const db = require('../db');
const { requireLogin } = require('../auth');

const router = express.Router();

router.get('/', requireLogin, (req, res) => {
  const recentTimeline = db
    .prepare(
      `SELECT t.*, u.name AS author_name
       FROM timeline t LEFT JOIN users u ON u.id = t.author_id
       ORDER BY t.occurred_at DESC, t.id DESC LIMIT 6`
    )
    .all();

  const openTasks = db
    .prepare(
      `SELECT t.*, u.name AS assignee_name
       FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id
       WHERE t.status != 'done'
       ORDER BY CASE t.priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
                (t.due_date IS NULL), t.due_date ASC LIMIT 6`
    )
    .all();

  const stats = {
    timeline: db.prepare('SELECT COUNT(*) c FROM timeline').get().c,
    tasksOpen: db.prepare("SELECT COUNT(*) c FROM tasks WHERE status != 'done'").get().c,
    tasksDone: db.prepare("SELECT COUNT(*) c FROM tasks WHERE status = 'done'").get().c,
    contacts: db.prepare('SELECT COUNT(*) c FROM contacts').get().c,
    files: db.prepare('SELECT COUNT(*) c FROM files').get().c,
    notifyTargets: db.prepare('SELECT COUNT(*) c FROM contacts WHERE notify = 1').get().c,
  };

  const lastAlert = db
    .prepare(`SELECT a.*, u.name AS sender_name FROM alerts a LEFT JOIN users u ON u.id = a.sender_id
              ORDER BY a.id DESC LIMIT 1`)
    .get();

  res.render('dashboard', {
    title: '대응 상황판',
    recentTimeline,
    openTasks,
    stats,
    lastAlert,
  });
});

module.exports = router;
