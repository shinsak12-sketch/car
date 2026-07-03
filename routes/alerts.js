'use strict';

const express = require('express');
const db = require('../db');
const notify = require('../services/notify');

const router = express.Router();

// 알림 발송 화면 + 이력
router.get('/', (req, res) => {
  const targets = db
    .prepare("SELECT id, name, org, role, phone, category FROM contacts WHERE notify = 1 AND phone != '' ORDER BY name")
    .all();
  const allContacts = db
    .prepare("SELECT id, name, org, phone, category FROM contacts WHERE phone != '' ORDER BY name")
    .all();
  const history = db
    .prepare(`SELECT a.*, u.name AS sender_name FROM alerts a LEFT JOIN users u ON u.id = a.sender_id
              ORDER BY a.id DESC LIMIT 50`)
    .all()
    .map((a) => ({ ...a, recipientsParsed: safeParse(a.recipients) }));

  res.render('alerts', {
    title: '비상 알림',
    targets,
    allContacts,
    history,
    provider: notify.providerInfo(),
  });
});

// 발송
router.post('/send', async (req, res) => {
  const message = (req.body.message || '').trim();
  let ids = req.body.contact_ids;
  if (!Array.isArray(ids)) ids = ids ? [ids] : [];
  ids = ids.map(Number).filter(Boolean);

  if (!message) return res.redirect('/alerts');

  let recipients = [];
  if (ids.length) {
    const placeholders = ids.map(() => '?').join(',');
    recipients = db.prepare(`SELECT name, phone FROM contacts WHERE id IN (${placeholders})`).all(...ids);
  } else {
    recipients = db.prepare("SELECT name, phone FROM contacts WHERE notify = 1 AND phone != ''").all();
  }

  if (!recipients.length) {
    return res.render('alerts_result', {
      title: '발송 결과',
      result: null,
      error: '수신 대상이 없습니다. 연락처에서 "비상 알림 대상"을 지정하거나 대상을 선택하세요.',
    });
  }

  const result = await notify.send(message, recipients);
  const successCnt = result.results.filter((r) => r.ok).length;

  db.prepare(
    `INSERT INTO alerts (message, channel, provider, status, recipients, recipient_cnt, success_cnt, detail, sender_id)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).run(
    message,
    result.channel,
    result.provider,
    result.status,
    JSON.stringify(result.results),
    result.results.length,
    successCnt,
    result.note || '',
    req.session.user.id
  );

  res.render('alerts_result', { title: '발송 결과', result: { ...result, message, successCnt }, error: null });
});

function safeParse(s) {
  try {
    return JSON.parse(s || '[]');
  } catch {
    return [];
  }
}

module.exports = router;
