import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { COOKIE } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(request) {
  cookies().set(COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return NextResponse.redirect(new URL('/login', request.url));
}
