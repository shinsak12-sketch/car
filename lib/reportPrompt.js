import { fmtDateTime, fmtDate, userLabel } from '@/lib/format';
import { TASK_STATUS_LABEL, PRIORITY_LABEL } from '@/lib/constants';

// 상황 일지(+대응업무·비상알림)를 클로드에 붙여넣어 보고서를 생성하기 위한
// 프롬프트 텍스트를 만든다. (순수 함수 · 서버/클라 어디서든 사용 가능)
export function buildReportPrompt({ orgName, from, to, timeline = [], tasks = [], alerts = [], includeTasks = true, includeAlerts = true } = {}) {
  const L = [];
  const period = from && to ? `${from} ~ ${to}` : from ? `${from} 이후` : to ? `${to} 까지` : '전체 기간';

  L.push(`당신은 기업의 대외협력·총무 업무를 지원하는 보고서 작성 전문가입니다.`);
  L.push(`아래는 "${orgName}"에서 발생한 집회·분쟁 상황에 대한 현장 대응 기록입니다.`);
  L.push(`이 기록을 근거로, 경영진에게 보고할 수 있는 공식 대응 보고서를 작성해 주세요.`);
  L.push('');
  L.push('[작성 지침]');
  L.push('- 문체: 공식 보고서체(개조식 위주), 과장 없이 사실 중심으로 서술');
  L.push('- 모든 시각은 한국 표준시(KST) 기준');
  L.push('- 아래 구성으로 작성:');
  L.push('  ① 개요(요약 3~5줄)  ② 대상 기간·장소  ③ 주요 경과(시간순 정리)');
  L.push('  ④ 대응 조치 및 업무 진행 현황  ⑤ 특이사항·쟁점  ⑥ 향후 계획 및 건의');
  L.push('- 기록에 없는 내용은 임의로 지어내지 말고, 추정이 필요하면 "추정"으로 명시');
  L.push('- 마지막에 "첨부: 상황 일지 원본" 형태로 근거가 된 항목 수를 표기');
  L.push('');
  L.push('[기본 정보]');
  L.push(`- 조직: ${orgName}`);
  L.push(`- 대상 기간: ${period}`);
  L.push(`- 상황 일지: ${timeline.length}건`);
  if (includeTasks) L.push(`- 대응 업무: ${tasks.length}건`);
  if (includeAlerts) L.push(`- 비상 알림 발송: ${alerts.length}건`);
  L.push('');

  L.push('======================================================================');
  L.push('[상황 일지 — 시간순]');
  L.push('======================================================================');
  if (timeline.length === 0) {
    L.push('(해당 기간의 일지 없음)');
  } else {
    timeline.forEach((t, i) => {
      L.push('');
      L.push(`${i + 1}) ${fmtDateTime(t.occurred_at)} · [${t.category || '기타'}] ${t.title || ''}`);
      const body = (t.body || '').trim();
      if (body) body.split(/\r?\n/).forEach((line) => L.push(`   ${line}`));
      const who = userLabel(t.author_name, t.author_position, t.author_affiliation);
      const meta = [`기록자: ${who}`];
      if (Number(t.file_count) > 0) meta.push(`첨부 ${t.file_count}건`);
      L.push(`   (${meta.join(' · ')})`);
    });
  }
  L.push('');

  if (includeTasks) {
    L.push('======================================================================');
    L.push('[대응 업무 현황]');
    L.push('======================================================================');
    if (tasks.length === 0) {
      L.push('(등록된 업무 없음)');
    } else {
      tasks.forEach((t, i) => {
        const parts = [`[${TASK_STATUS_LABEL[t.status] || t.status}]`, `[${PRIORITY_LABEL[t.priority] || t.priority}]`, t.title || ''];
        L.push(`${i + 1}) ${parts.join(' ')}`);
        const sub = [];
        if (t.assignee_name) sub.push(`담당: ${t.assignee_name}`);
        if (t.due_date) sub.push(`기한: ${fmtDate(t.due_date)}`);
        if (sub.length) L.push(`   (${sub.join(' · ')})`);
        const desc = (t.description || '').trim();
        if (desc) desc.split(/\r?\n/).forEach((line) => L.push(`   ${line}`));
      });
    }
    L.push('');
  }

  if (includeAlerts) {
    L.push('======================================================================');
    L.push('[비상 알림 발송 이력]');
    L.push('======================================================================');
    if (alerts.length === 0) {
      L.push('(발송 이력 없음)');
    } else {
      alerts.forEach((a, i) => {
        L.push(`${i + 1}) ${fmtDateTime(a.created_at)} · 발송 ${a.sender_name || '-'} · 수신 ${a.success_cnt}/${a.recipient_cnt}명`);
        const msg = (a.message || '').trim();
        if (msg) msg.split(/\r?\n/).forEach((line) => L.push(`   ${line}`));
      });
    }
    L.push('');
  }

  L.push('======================================================================');
  L.push('위 기록을 바탕으로 보고서를 작성해 주세요.');

  return L.join('\n');
}
