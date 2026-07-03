'use client';

import { useFormState } from 'react-dom';
import ToggleForm from '@/components/ToggleForm';

export default function AddUserForm({ action }) {
  const [state, formAction] = useFormState(action, {});
  return (
    <>
      {state?.error && <div className="flash error">{state.error}</div>}
      {state?.ok && <div className="flash ok">{state.ok}</div>}
      <ToggleForm label="＋ 사용자 추가">
        <form action={formAction} className="form-card">
          <div className="grid2">
            <label>아이디<input type="text" name="username" required /></label>
            <label>이름<input type="text" name="name" required /></label>
            <label>직책<input type="text" name="position" placeholder="예: 팀장 / 대응조장" /></label>
            <label>전화번호<input type="tel" name="phone" placeholder="010-0000-0000" /></label>
            <label>임시 비밀번호<input type="text" name="password" required /></label>
            <label>권한
              <select name="role" defaultValue="member">
                <option value="member">일반</option>
                <option value="admin">관리자</option>
              </select>
            </label>
          </div>
          <div className="form-actions"><button className="btn-primary">추가</button></div>
        </form>
      </ToggleForm>
    </>
  );
}
