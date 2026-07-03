import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import TimelineForm from '@/components/TimelineForm';
import { updateTimeline } from '@/actions/timeline';
import { blobConfigured } from '@/lib/blob';

export const dynamic = 'force-dynamic';

export default async function EditTimelinePage({ params }) {
  const rows = await sql`SELECT * FROM timeline WHERE id = ${params.id}`;
  const item = rows[0];
  if (!item) notFound();

  return (
    <>
      <div className="page-head"><h1>일지 수정</h1></div>
      <TimelineForm item={item} action={updateTimeline.bind(null, item.id)} blobReady={blobConfigured()} />
    </>
  );
}
