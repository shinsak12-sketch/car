'use client';

import { useEffect } from 'react';

// 앱 전체에서 서비스워커를 등록 (PWA 설치 가능 + 푸시 수신 유지)
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);
  return null;
}
