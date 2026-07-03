import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';

const COOKIE = 'session';
const MAX_AGE = 60 * 60 * 24 * 7; // 7일

function secretKey() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error('SESSION_SECRET 이 설정되지 않았습니다.');
  return new TextEncoder().encode(s);
}

export async function signSession(user) {
  return await new SignJWT({ id: user.id, username: user.username, name: user.name, role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secretKey());
}

export async function verifySession(token) {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return payload;
  } catch {
    return null;
  }
}

// 서버 컴포넌트/액션에서 현재 로그인 사용자 조회 (없으면 null)
export async function getSession() {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  return await verifySession(token);
}

// 로그인 필수. 미로그인 시 예외 (레이아웃/미들웨어가 리다이렉트 처리)
export async function requireUser() {
  const user = await getSession();
  if (!user) throw new Error('UNAUTHORIZED');
  return user;
}

export async function setSessionCookie(token) {
  cookies().set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE,
  });
}

export function clearSessionCookie() {
  cookies().set(COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
}

export { COOKIE };
