'use client';

import { useEffect, useState } from 'react';

export default function InstallButton() {
  const [deferred, setDeferred] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [hint, setHint] = useState('');

  useEffect(() => {
    const onPrompt = (e) => {
      e.preventDefault();
      setDeferred(e);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);

    const standalone =
      window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (standalone) setInstalled(true);

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed) return null;

  async function install() {
    if (deferred) {
      deferred.prompt();
      await deferred.userChoice;
      setDeferred(null);
      return;
    }
    // 프롬프트를 못 쓰는 경우(iOS 사파리 등) 수동 안내
    const ua = window.navigator.userAgent || '';
    if (/iphone|ipad|ipod/i.test(ua)) {
      setHint('아이폰: 사파리 아래 <b>공유</b> 버튼 → <b>“홈 화면에 추가”</b> 를 누르면 앱으로 설치됩니다.');
    } else {
      setHint('브라우저 메뉴(⋮) → <b>“앱 설치”</b> 또는 <b>“홈 화면에 추가”</b> 를 누르면 설치됩니다.');
    }
  }

  return (
    <div style={{ marginTop: 10 }}>
      <button type="button" className="btn-install btn-block" onClick={install}>
        📲 앱으로 설치하기
      </button>
      {hint && <div className="flash warn" style={{ marginTop: 8, textAlign: 'left' }} dangerouslySetInnerHTML={{ __html: hint }} />}
    </div>
  );
}
