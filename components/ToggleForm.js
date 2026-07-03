'use client';

import { useState } from 'react';

// 버튼을 누르면 자식(주로 form.form-card)을 펼치고 접습니다.
export default function ToggleForm({ label, children }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn-primary" onClick={() => setOpen((v) => !v)}>
        {label}
      </button>
      {open && children}
    </>
  );
}
