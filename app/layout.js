import './globals.css';
import { getSession } from '@/lib/auth';
import Nav from '@/components/Nav';
import { ORG_NAME } from '@/lib/constants';

export const metadata = {
  title: ORG_NAME + ' · 분쟁 대응 관리',
  description: '집회·분쟁 상황 대응 협업 관리',
};

export const viewport = { width: 'device-width', initialScale: 1, themeColor: '#1f2937' };

export default async function RootLayout({ children }) {
  const user = await getSession();
  return (
    <html lang="ko">
      <body>
        {user && <Nav user={user} orgName={ORG_NAME} />}
        <main className="container">{children}</main>
        <footer className="site-foot">{ORG_NAME} · 분쟁 대응 관리 · 기록은 자동 저장됩니다</footer>
      </body>
    </html>
  );
}
