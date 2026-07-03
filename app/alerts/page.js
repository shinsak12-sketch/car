import { sql } from '@/lib/db';
import { providerInfo } from '@/lib/notify';
import { countSubscriptions } from '@/lib/push';
import { fmtDateTime } from '@/lib/format';
import { sendAlert } from '@/actions/alerts';
import AlertForm from '@/components/AlertForm';
import EnableNotifications from '@/components/EnableNotifications';

export const dynamic = 'force-dynamic';

export default async function AlertsPage() {
  const [allContacts, history, pushCount] = await Promise.all([
    sql`SELECT id, name, org, phone, category, notify FROM contacts WHERE phone <> '' ORDER BY name`,
    sql`SELECT a.*, u.name AS sender_name FROM alerts a
        LEFT JOIN users u ON u.id = a.sender_id ORDER BY a.id DESC LIMIT 50`,
    countSubscriptions(),
  ]);
  const notifyIds = allContacts.filter((c) => c.notify).map((c) => c.id);
  const provider = providerInfo();
  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || '';

  return (
    <>
      <div className="page-head"><h1>🚨 비상 알림</h1></div>

      <EnableNotifications vapidPublicKey={vapidPublicKey} />

      <div className="flash ok" style={{ background: '#eff6ff', borderColor: '#bfdbfe', color: '#1e40af' }}>
        🔔 지금 <b>{pushCount}대</b>의 기기가 이 알림을 받습니다.
        {' '}팀원들은 각자 휴대폰에서 로그인 후 이 화면의 <b>“비상 알림 받기”</b>를 한 번 눌러두면 됩니다.
        {!provider.live && <> · 문자(SMS)는 아직 꺼져 있어요(원하면 나중에 연결).</>}
      </div>

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
