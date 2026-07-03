import { sql } from '@/lib/db';
import { providerInfo } from '@/lib/notify';
import { fmtDateTime } from '@/lib/format';
import { sendAlert } from '@/actions/alerts';
import AlertForm from '@/components/AlertForm';

export const dynamic = 'force-dynamic';

export default async function AlertsPage() {
  const allContacts = await sql`SELECT id, name, org, phone, category, notify FROM contacts WHERE phone <> '' ORDER BY name`;
  const notifyIds = allContacts.filter((c) => c.notify).map((c) => c.id);
  const history = await sql`SELECT a.*, u.name AS sender_name FROM alerts a
    LEFT JOIN users u ON u.id = a.sender_id ORDER BY a.id DESC LIMIT 50`;
  const provider = providerInfo();

  return (
    <>
      <div className="page-head"><h1>🚨 비상 알림</h1></div>

      {provider.live ? (
        <div className="flash ok">실제 발송 켜짐 · 제공자: {provider.provider} · 발신번호: {provider.sender}</div>
      ) : (
        <div className="flash warn">
          현재 <strong>기록 모드</strong>입니다 — 실제 문자는 발송되지 않고, <b>누구에게 무엇을 보냈는지 기록만</b> 남습니다.
          실제 문자 발송을 켜려면 환경변수 <code>NOTIFY_PROVIDER</code> 와 발신번호를 설정하세요.
        </div>
      )}

      <AlertForm allContacts={allContacts} notifyIds={notifyIds} action={sendAlert} />

      <h2 className="section-title">발송 이력</h2>
      {history.length === 0 ? (
        <p className="empty">발송 이력이 없습니다.</p>
      ) : (
        <div className="alert-history">
          {history.map((a) => {
            const rcpts = Array.isArray(a.recipients) ? a.recipients : [];
            return (
              <div className="ah-item" key={a.id}>
                <div className="ah-top">
                  <span className={`ah-status ah-${a.status}`}>{a.status === 'sent' ? '발송' : a.status === 'recorded' ? '기록' : '실패'}</span>
                  <span className="ah-time">{fmtDateTime(a.created_at)}</span>
                  <span className="ah-by">{a.sender_name || '-'}</span>
                  <span className="ah-count">{a.success_cnt}/{a.recipient_cnt}명</span>
                </div>
                <div className="ah-msg">{a.message}</div>
                {rcpts.length > 0 && (
                  <details className="ah-detail">
                    <summary>수신자 {rcpts.length}명</summary>
                    <div className="ah-rcpts">
                      {rcpts.map((r, i) => (
                        <span className={`ah-rcpt ${r.ok ? 'ok' : 'ng'}`} key={i}>{r.name} {r.ok ? '✓' : '✕'}</span>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
