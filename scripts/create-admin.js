'use strict';

// 사용법: node scripts/create-admin.js <아이디> <비밀번호> [이름]
// 예:    node scripts/create-admin.js admin 1234 관리자

require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../db');

const [, , username, password, name] = process.argv;

if (!username || !password) {
  console.error('사용법: node scripts/create-admin.js <아이디> <비밀번호> [이름]');
  process.exit(1);
}

const exists = db.prepare('SELECT 1 FROM users WHERE username = ?').get(username);
if (exists) {
  console.error(`이미 존재하는 아이디입니다: ${username}`);
  process.exit(1);
}

db.prepare('INSERT INTO users (username, password, name, role) VALUES (?,?,?,?)').run(
  username,
  bcrypt.hashSync(password, 10),
  name || '관리자',
  'admin'
);

console.log(`관리자 계정이 생성되었습니다.  아이디: ${username}`);
