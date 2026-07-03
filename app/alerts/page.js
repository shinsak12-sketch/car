import { sql } from '@/lib/db';
import { providerInfo } from '@/lib/notify';
import { countSubscriptions, listSubscribers } from '@/lib/push';
import { fmtDateTime } from '@/lib/format';
import { sendAlert, deleteAlert } from '@/actions/alerts';
import AlertForm from '@/components/AlertForm';
import EnableNotifications from '@/components/EnableNotifications';
import ConfirmButton from '@/components/ConfirmButton';

export const dynamic = 'force-dynamic';

export default async function AlertsPage() {
  const [allContacts, history, subscribers] = await Promise.all([
    sql`SELECT id, name, org, phone, category, notify FROM contacts WHERE phone <> '' ORDER BY name`,
    sql`SELECT a.*, u.name AS sender_name FROM alerts a
        LEFT JOIN users u ON u.id = a.sender_id ORDER BY a.id DESC LIMIT 50`,
    listSubscribers(),
  ]);
  const notifyIds = allContacts.filter((c) => c.notify).map((c) => c.id);
  const provider = providerInfo();
  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || '';

  return (
    <>
      <div className="page-head"><h1>🚨 비상 알림</h1></div>

      <EnableNotifications vapidPublicKey={vapidPublicKey} />

      <AlertForm
        allContacts={allContacts}
        notifyIds={notifyIds}
        subscribers={subscribers}
        smsLive={provider.live}
        action={sendAlert}
      />

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
                  <form action={deleteAlert.bind(null, a.id)} className="inline">
                    <ConfirmButton message="이 발송 이력을 삭제할까요?" className="mini del">삭제</ConfirmButton>
                  </form>
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
