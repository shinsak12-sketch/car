'use client';

import { useState } from 'react';
import { contactCatClass, CONTACT_CATEGORIES } from '@/lib/constants';
import { fmtDateTime } from '@/lib/format';
import ConfirmButton from '@/components/ConfirmButton';

export default function ContactCard({ c, updateAction, deleteAction }) {
  const [edit, setEdit] = useState(false);

  return (
    <div className="contact-card">
      <div className="contact-top">
        <span className={contactCatClass(c.category)}>{c.category}</span>
        {c.notify && <span className="notify-dot" title="비상 알림 대상">🚨</span>}
      </div>
      <div className="contact-name">{c.name}{c.role && <small> {c.role}</small>}</div>
      {c.org && <div className="contact-org">{c.org}</div>}
      {c.phone && <a href={`tel:${c.phone}`} className="contact-phone">📞 {c.phone}</a>}
      {c.email && <div className="contact-email">✉ {c.email}</div>}
      {c.memo && <div className="contact-memo">{c.memo}</div>}
      {(c.author_name || c.created_at) && (
        <div className="contact-by">등록: {c.author_name || '-'}{c.created_at && ` · ${fmtDateTime(c.created_at)}`}</div>
      )}

      <div className="contact-actions">
        <button className="mini" onClick={() => setEdit((v) => !v)}>{edit ? '닫기' : '수정'}</button>
        <form action={deleteAction} className="inline">
          <ConfirmButton message="삭제할까요?">삭제</ConfirmButton>
        </form>
      </div>

      {edit && (
        <form action={updateAction} className="edit-form">
          <input type="text" name="name" defaultValue={c.name} placeholder="이름" required />
          <select name="category" defaultValue={c.category}>
            {CONTACT_CATEGORIES.map((cc) => <option key={cc} value={cc}>{cc}</option>)}
          </select>
          <input type="text" name="org" defaultValue={c.org || ''} placeholder="소속" />
          <input type="text" name="role" defaultValue={c.role || ''} placeholder="직책" />
          <input type="tel" name="phone" defaultValue={c.phone || ''} placeholder="전화" />
          <input type="email" name="email" defaultValue={c.email || ''} placeholder="이메일" />
          <textarea name="memo" rows={2} defaultValue={c.memo || ''} placeholder="메모" />
          <label className="check"><input type="checkbox" name="notify" value="1" defaultChecked={c.notify} /> 비상 알림 대상</label>
          <button className="btn-sm">저장</button>
        </form>
      )}
    </div>
  );
}
