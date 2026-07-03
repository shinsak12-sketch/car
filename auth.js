'use strict';

// 로그인 필요 미들웨어
function requireLogin(req, res, next) {
  if (req.session && req.session.user) return next();
  if (req.accepts('html')) return res.redirect('/login');
  return res.status(401).json({ error: '로그인이 필요합니다.' });
}

// 관리자 전용 미들웨어
function requireAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'admin') return next();
  return res.status(403).send('관리자 권한이 필요합니다.');
}

module.exports = { requireLogin, requireAdmin };
