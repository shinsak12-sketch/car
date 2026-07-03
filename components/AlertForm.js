'use client';

import { useRef, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';

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
  const deviceTotal = subscribers.reduce((n, s) => n + (s.devices || 0), 0);

  function setAll(pred) {
    const boxes = listRef.current?.querySelectorAll('.rcpt') || [];
    boxes.forEach((b) => {
      b.checked = pred(b);
    });
  }

  return (
    <>
      {state?.error && <div className="flash error">{state.error}</div>}
      {state?.result && <ResultCard result={state.result} />}

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

function ResultCard({ result }) {
  const push = result.push;
  const hasSms = result.results.length > 0;
  const label =
    result.status === 'sent' ? '✅ 발송 완료' : result.status === 'recorded' ? '📝 문자 기록 모드' : '⚠️ 발송 실패';
  return (
    <div className="result-card">
      <div className="result-summary">
        {push && push.total > 0 ? '✅ 발송 완료' : label}
        {push && push.total > 0 && <span className="result-cnt">🔔 휴대폰 알림 {push.sent}/{push.total}명</span>}
        {hasSms && <span className="result-cnt">✉️ 문자 {result.successCnt}/{result.results.length}명</span>}
      </div>
      <div className="result-msg">{result.message}</div>
      {push && push.total === 0 && !hasSms && (
        <div className="result-note">알림을 켠 기기가 아직 없습니다. 팀원들이 각자 휴대폰에서 “비상 알림 받기”를 켜야 합니다.</div>
      )}
      {result.note && <div className="result-note">{result.note}</div>}
      {hasSms && (
        <table className="result-table">
          <thead><tr><th>이름</th><th>번호</th><th>결과</th></tr></thead>
          <tbody>
            {result.results.map((r, i) => (
              <tr key={i}>
                <td>{r.name}</td>
                <td>{r.phone}</td>
                <td className={r.ok ? 'ok' : 'ng'}>{r.ok ? '성공' : '실패'}{r.info && <small> ({r.info})</small>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
