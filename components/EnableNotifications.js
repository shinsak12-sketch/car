'use client';

import { useState, useEffect } from 'react';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export default function EnableNotifications({ vapidPublicKey }) {
  const [state, setState] = useState('loading'); // loading|idle|on|working|denied|unsupported
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setState('unsupported');
      return;
    }
    navigator.serviceWorker
      .getRegistration()
      .then((reg) => (reg ? reg.pushManager.getSubscription() : null))
      .then((sub) => setState(sub ? 'on' : Notification.permission === 'denied' ? 'denied' : 'idle'))
      .catch(() => setState('idle'));
  }, []);

  async function enable() {
    setMsg('');
    if (!vapidPublicKey) {
      setMsg('서버에 알림 키(VAPID)가 아직 설정되지 않았습니다.');
      return;
    }
    setState('working');
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setState('denied');
        return;
      }
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub),
      });
      if (res.ok) setState('on');
      else {
        setMsg('구독 저장에 실패했습니다.');
        setState('idle');
      }
    } catch (e) {
      setMsg(String(e?.message || e));
      setState('idle');
    }
  }

  if (state === 'loading') return null;
  if (state === 'unsupported')
    return (
      <div className="flash warn">
        이 브라우저는 앱 알림을 지원하지 않습니다. <b>아이폰</b>은 사파리에서 <b>공유 → 홈 화면에 추가</b> 후 그 아이콘으로 열면 알림을 받을 수 있어요.
      </div>
    );
  if (state === 'on') return <div className="flash ok">🔔 이 기기에서 비상 알림을 받습니다.</div>;
  if (state === 'denied')
    return (
      <div className="flash error">
        알림이 <b>차단</b>되어 있습니다. 브라우저/휴대폰 설정에서 이 사이트의 알림을 허용한 뒤 다시 시도해주세요.
      </div>
    );

  return (
    <div style={{ marginBottom: 16 }}>
      <button className="btn-primary" onClick={enable} disabled={state === 'working'}>
        {state === 'working' ? '설정 중…' : '🔔 이 기기에서 비상 알림 받기'}
      </button>
      {msg && <div className="flash error" style={{ marginTop: 8 }}>{msg}</div>}
    </div>
  );
}
