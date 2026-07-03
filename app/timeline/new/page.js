import TimelineForm from '@/components/TimelineForm';
import { createTimeline } from '@/actions/timeline';

export const dynamic = 'force-dynamic';

export default function NewTimelinePage() {
  return (
    <>
      <div className="page-head"><h1>새 상황 기록</h1></div>
      <TimelineForm action={createTimeline} />
    </>
  );
}
