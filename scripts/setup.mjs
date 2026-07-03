// Neon DB 초기화 + 기본 관리자 생성
//
// 로컬에서 실행 (Node 20.6+):
//   node --env-file=.env scripts/setup.mjs [아이디] [비밀번호] [이름]
// 기본값: admin / 1234 / 관리자

import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';
import { schemaStatements } from '../db/schema.js';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL 이 없습니다.  node --env-file=.env scripts/setup.mjs 형태로 실행하세요.');
  process.exit(1);
}

const [, , argUser, argPass, argName] = process.argv;
const username = argUser || 'admin';
const password = argPass || '1234';
const name = argName || '관리자';

const sql = neon(url);
function exec(text) {
  const strings = [text];
  strings.raw = [text];
  return sql(strings);
}

async function run() {
  console.log('스키마 생성 중...');
  for (const stmt of schemaStatements()) await exec(stmt);
  console.log('스키마 준비 완료.');

  const existing = await sql`SELECT COUNT(*)::int AS c FROM users`;
  if (existing[0].c === 0) {
    await sql`INSERT INTO users (username, password, name, role)
              VALUES (${username}, ${bcrypt.hashSync(password, 10)}, ${name}, 'admin')`;
    console.log(`기본 관리자 생성됨 →  아이디: ${username}  비밀번호: ${password}`);
    console.log('※ 로그인 후 반드시 비밀번호를 변경하세요.');
  } else {
    console.log(`이미 사용자 ${existing[0].c}명이 있어 관리자 생성을 건너뜁니다.`);
  }
  console.log('완료.');
}

run().catch((e) => {
  console.error('오류:', e.message);
  process.exit(1);
});
