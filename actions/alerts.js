'use server';

import { sql } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { send } from '@/lib/notify';
import { revalidatePath } from 'next/cache';

// useFormState 시그니처: (prevState, formData) => newState
export async function sendAlert(prevState, formData) {
  const user = await requireUser();
  const message = formData.get('message')?.toString().trim();
  if (!message) return { error: '알림 내용을 입력하세요.' };

  const ids = formData.getAll('contact_ids').map(Number).filter(Boolean);
  let recipients;
  if (ids.length) {
    recipients = await sql`SELECT name, phone FROM contacts WHERE id = ANY(${ids})`;
  } else {
    recipients = await sql`SELECT name, phone FROM contacts WHERE notify = true AND phone <> ''`;
  }
  if (!recipients.length) {
    return { error: '수신 대상이 없습니다. 연락처에서 "비상 알림 대상"을 지정하거나 대상을 선택하세요.' };
  }

  const result = await send(message, recipients);
  const successCnt = result.results.filter((r) => r.ok).length;

  await sql`INSERT INTO alerts (message, channel, provider, status, recipients, recipient_cnt, success_cnt, detail, sender_id)
    VALUES (${message}, ${result.channel}, ${result.provider}, ${result.status},
            ${JSON.stringify(result.results)}::jsonb, ${result.results.length}, ${successCnt},
            ${result.note || ''}, ${user.id})`;

  revalidatePath('/alerts');
  revalidatePath('/');
  return { result: { ...result, message, successCnt } };
}
