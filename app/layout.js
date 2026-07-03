import './globals.css';
import { getSession } from '@/lib/auth';
import { ensureSchema } from '@/lib/ensureSchema';
import Nav from '@/components/Nav';
import BottomNav from '@/components/BottomNav';
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister';
import { ORG_NAME } from '@/lib/constants';

export const metadata = {
  title: ORG_NAME + ' · 분쟁 대응 관리',
  description: '집회·분쟁 상황 대응 협업 관리',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: ORG_NAME },
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/icons/apple-touch-icon.png',
  },
};

export const viewport = { width: 'device-width', initialScale: 1, themeColor: '#1f2937' };

export default async function RootLayout({ children }) {
  const user = await getSession();
  // 로그인 사용자가 있으면(=앱 내부 화면) 렌더 전에 스키마(새 컬럼) 자동 보정.
  // 부모 레이아웃의 await 가 자식 페이지 렌더보다 먼저 끝나므로 컬럼 누락 크래시 방지.
  if (user) {
    try { await ensureSchema(); } catch {}
  }
  return (
    <html lang="ko">
      <body className={user ? 'has-bottomnav' : ''}>
        <ServiceWorkerRegister />
        {user && <Nav user={user} orgName={ORG_NAME} />}
        <main className="container">{children}</main>
        {user && <BottomNav isAdmin={user.role === 'admin'} />}
      </body>
    </html>
  );
}
