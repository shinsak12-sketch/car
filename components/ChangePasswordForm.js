'use client';

import { useFormState } from 'react-dom';

export default function ChangePasswordForm({ action }) {
  const [state, formAction] = useFormState(action, {});
  return (
    <>
      {state?.error && <div className="flash error">{state.error}</div>}
      {state?.ok && <div className="flash ok">{state.ok}</div>}
      <h2 className="section-title">비밀번호 변경</h2>
      <form action={formAction} className="form-card">
        <label>현재 비밀번호<input type="password" name="current" required /></label>
        <label>새 비밀번호<input type="password" name="next1" required /></label>
        <label>새 비밀번호 확인<input type="password" name="next2" required /></label>
        <div className="form-actions"><button className="btn-primary">변경</button></div>
      </form>
    </>
  );
}
