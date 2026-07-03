'use server';

import { sql } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { send } from '@/lib/notify';
import { sendPushToAll } from '@/lib/push';
import { revalidatePath } from 'next/cache';

export async function deleteAlert(id) {
  await requireUser();
  await sql`DELETE FROM alerts WHERE id = ${id}`;
  revalidatePath('/alerts');
}

// useFormState 시그니처: (prevState, formData) => newState
export async function sendAlert(prevState, formData) {
  const user = await requireUser();
  const message = formData.get('message')?.toString().trim();
  if (!message) return { error: '알림 내용을 입력하세요.' };

  // 1) 웹 푸시: 알림 켠 모든 팀원에게 (무료)
  const push = await sendPushToAll({ title: '🚨 비상 알림', body: message, url: '/alerts' });

  // 2) 문자(SMS): 사용자가 명시적으로 선택한 연락처에만 (선택 기능)
  const ids = formData.getAll('contact_ids').map(Number).filter(Boolean);
  let recipients = [];
  if (ids.length) {
    recipients = await sql`SELECT name, phone FROM contacts WHERE id = ANY(${ids})`;
  }

  // 푸시 수신자도 없고 문자 대상도 없으면 안내
  if (push.total === 0 && recipients.length === 0) {
    return {
      error:
        '받을 사람이 없습니다. 팀원들이 각자 휴대폰에서 "이 기기에서 비상 알림 받기"를 켜야 합니다. (또는 아래 "문자로도 보내기"에서 대상을 선택하세요.)',
    };
  }

  const result = recipients.length
    ? await send(message, recipients)
    : { channel: 'push', provider: 'webpush', status: 'sent', results: [], note: '' };
  const successCnt = result.results.filter((r) => r.ok).length;

  const detail = `push ${push.sent}/${push.total}${result.note ? ' · ' + result.note : ''}`;
  await sql`INSERT INTO alerts (message, channel, provider, status, recipients, recipient_cnt, success_cnt, detail, sender_id)
    VALUES (${message}, ${result.channel}, ${result.provider}, ${result.status},
            ${JSON.stringify(result.results)}::jsonb, ${result.results.length}, ${successCnt},
            ${detail}, ${user.id})`;

  // 주의: '/alerts' 는 revalidate 하지 않음 — 하면 폼이 리마운트되어 결과 카드가 사라짐.
  // 발송 확인은 결과 카드로 하고, 이력은 다음 방문 시 갱신됨.
  return { result: { ...result, message, successCnt, push } };
}
