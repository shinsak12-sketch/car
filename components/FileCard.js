'use client';

import { useState } from 'react';
import { fmtSize, fmtDateTime, toLocalInput, userLabel } from '@/lib/format';
import ConfirmButton from '@/components/ConfirmButton';

function isImg(m) {
  return m && m.startsWith('image/');
}

export default function FileCard({ f, updateAction, deleteAction }) {
  const [edit, setEdit] = useState(false);
  const when = f.occurred_at || f.created_at;

  return (
    <div className="file-card">
      <a href={f.url} target="_blank" rel="noreferrer" className="file-thumb">
        {isImg(f.mimetype) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={f.url} alt={f.memo || '증거 사진'} loading="lazy" />
        ) : (
          <span className="file-icon">📄</span>
        )}
      </a>
      <div className="file-info">
        <div className="file-name">{f.memo || (isImg(f.mimetype) ? '📷 사진' : '📄 파일')}</div>
        <div className="file-meta">🕒 {fmtDateTime(when)}</div>
        <div className="file-meta">등록: {userLabel(f.uploader_name, f.uploader_position, f.uploader_affiliation)}</div>
        <div className="file-meta">{fmtSize(f.size)}</div>
        {f.timeline_title && <div className="file-link">🔗 {f.timeline_title}</div>}

        <div className="file-actions">
          <a href={f.url} target="_blank" rel="noreferrer" className="mini">열기</a>
          <button className="mini" onClick={() => setEdit((v) => !v)}>{edit ? '닫기' : '수정'}</button>
        </div>

        {edit && (
          <form action={updateAction} className="edit-form">
            <label style={{ fontSize: '.78rem', fontWeight: 600 }}>발생일자
              <input type="datetime-local" name="occurred_at" defaultValue={toLocalInput(when)} />
            </label>
            <input type="text" name="memo" defaultValue={f.memo || ''} placeholder="메모" />
            <div style={{ display: 'flex', gap: 6, justifyContent: 'space-between' }}>
              <button className="btn-sm btn-primary" style={{ color: '#fff' }}>저장</button>
              <span onClick={(e) => e.stopPropagation()}>
                <ConfirmButton message="이 자료를 삭제할까요?" className="mini del" formAction={deleteAction}>삭제</ConfirmButton>
              </span>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
