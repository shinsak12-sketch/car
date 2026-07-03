'use strict';

// DB 초기화 + 기본 관리자(admin/1234) 생성 + 예시 연락처 카테고리 안내
require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../db');

const cnt = db.prepare('SELECT COUNT(*) c FROM users').get().c;
if (cnt === 0) {
  db.prepare('INSERT INTO users (username, password, name, role) VALUES (?,?,?,?)').run(
    'admin',
    bcrypt.hashSync('1234', 10),
    '관리자',
    'admin'
  );
  console.log('기본 관리자 계정을 만들었습니다.  아이디: admin  비밀번호: 1234');
  console.log('※ 로그인 후 반드시 비밀번호를 변경하세요 (우측 상단 → 내 계정).');
} else {
  console.log(`이미 사용자 ${cnt}명이 있습니다. 기본 관리자 생성을 건너뜁니다.`);
}
console.log('DB 준비 완료.');
