'use client';

import { useRef, useState, useEffect } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';

function SubmitBtn() {
  const { pending } = useFormStatus();
  return (
    <button className="btn-danger btn-lg" disabled={pending}>
      {pending ? '발송 중…' : '🚨 지금 발송'}
    </button>
  );
}

export default function AlertForm({ allContacts, notifyIds, subscribers = [], smsLive = false, action }) {
  const [state, formAction] = useFormState(action, {});
  const listRef = useRef(null);
  const notifySet = new Set(notifyIds);
  const [showSms, setShowSms] = useState(false);
  const [justSent, setJustSent] = useState(false);
  const deviceTotal = subscribers.reduce((n, s) => n + (s.devices || 0), 0);
  const router = useRouter();
  const refreshedFor = useRef(null);

  // 발송 성공 → 발송 이력 새로고침. router.refresh 가 폼을 리마운트하며 결과 상태를 지우므로,
  // 확인 메시지는 sessionStorage 로 넘겨 새로고침 후에도 표시.
  useEffect(() => {
    if (state?.result && refreshedFor.current !== state) {
      refreshedFor.current = state;
      try { sessionStorage.setItem('car_alert_sent', '1'); } catch {}
      router.refresh();
    }
  }, [state, router]);

  // 리마운트 후: 방금 보냈으면 확인 배너 표시
  useEffect(() => {
    let stored = null;
    try { stored = sessionStorage.getItem('car_alert_sent'); } catch {}
    if (stored) {
      try { sessionStorage.removeItem('car_alert_sent'); } catch {}
      setJustSent(true);
      const t = setTimeout(() => setJustSent(false), 6000);
      return () => clearTimeout(t);
    }
  }, []);

  function setAll(pred) {
    const boxes = listRef.current?.querySelectorAll('.rcpt') || [];
    boxes.forEach((b) => {
      b.checked = pred(b);
    });
  }

  return (
    <>
      {state?.error && <div className="flash error">{state.error}</div>}
      {justSent && (
        <div className="flash ok">✅ 비상 알림을 보냈습니다. 아래 <b>발송 이력</b> 맨 위에서 확인하세요.</div>
      )}

      {/* 실제로 이 알림을 받을 사람 = 앱 알림을 켠 기기 */}
      <div className="sub-box">
        <div className="sub-head">🔔 이 알림을 받을 사람 ({subscribers.length}명 · {deviceTotal}대)</div>
        {subscribers.length === 0 ? (
          <div className="sub-empty">
            아직 알림을 켠 사람이 없습니다. 팀원들이 각자 로그인 후 위의 <b>“이 기기에서 비상 알림 받기”</b>를 눌러야 이 목록에 표시됩니다.
          </div>
        ) : (
          <div className="sub-names">
            {subscribers.map((s, i) => (
              <span className="sub-name" key={i}>{s.name}{s.devices > 1 ? ` ×${s.devices}` : ''}</span>
            ))}
          </div>
        )}
      </div>

      <form action={formAction} className="form-card">
        <label>
          알림 내용
          <textarea name="message" rows={4} required placeholder="예: [긴급] 정문 앞 집회 인원 급증. 대응조 즉시 1층 로비로 집결 바랍니다." />
        </label>

        {/* 문자(SMS) 발송은 선택 (연락처가 있을 때만) */}
        {allContacts.length > 0 && (
          <div className="recipients">
            <button type="button" className="sms-toggle" onClick={() => setShowSms((v) => !v)}>
              {showSms ? '▼' : '▶'} 문자(SMS)로도 보내기 {smsLive ? '' : '(문자 미설정 — 기록만)'}
            </button>
            {showSms && (
              <>
                <div className="check-actions" style={{ marginTop: 10 }}>
                  <button type="button" className="mini" onClick={() => setAll(() => true)}>전체 선택</button>
                  <button type="button" className="mini" onClick={() => setAll(() => false)}>전체 해제</button>
                  <button type="button" className="mini" onClick={() => setAll((b) => b.dataset.notify === '1')}>알림대상만</button>
                </div>
                <div className="recipient-list" ref={listRef}>
                  {allContacts.map((c) => (
                    <label className="rcpt-item" key={c.id}>
                      <input
                        type="checkbox"
                        className="rcpt"
                        name="contact_ids"
                        value={c.id}
                        data-notify={notifySet.has(c.id) ? '1' : '0'}
                      />
                      <span>{c.name}{c.org && <small> {c.org}</small>} · {c.phone}</span>
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <div className="form-actions"><SubmitBtn /></div>
      </form>
    </>
  );
}
