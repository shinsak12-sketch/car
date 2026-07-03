import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { changePassword } from '@/actions/account';
import ChangePasswordForm from '@/components/ChangePasswordForm';

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const user = await getSession();
  if (!user) redirect('/login');

  return (
    <>
      <div className="page-head"><h1>내 계정</h1></div>
      <div className="form-card">
        <div className="account-info">
          <div><span>아이디</span><b>{user.username}</b></div>
          <div><span>이름</span><b>{user.name}</b></div>
          <div><span>권한</span><b>{user.role === 'admin' ? '관리자' : '일반'}</b></div>
        </div>
      </div>
      <ChangePasswordForm action={changePassword} />
    </>
  );
}
