export const TIMELINE_CATEGORIES = ['집회', '소음', '충돌', '접촉', '경찰', '기타'];
export const CONTACT_CATEGORIES = ['경찰', '구청', '변호사', '사내', '상대측', '기타'];
export const TASK_STATUSES = ['todo', 'doing', 'done'];
export const TASK_STATUS_LABEL = { todo: '할 일', doing: '진행 중', done: '완료' };
export const TASK_PRIORITIES = ['high', 'normal', 'low'];
export const PRIORITY_LABEL = { high: '높음', normal: '보통', low: '낮음' };

export const ORG_NAME = process.env.NEXT_PUBLIC_ORG_NAME || '대응상황실';

export function catClass(c) {
  return 'cat cat-' + ({ 집회: 'assembly', 소음: 'noise', 충돌: 'clash', 접촉: 'contact', 경찰: 'police' }[c] || 'etc');
}
export function contactCatClass(c) {
  return 'ct ct-' + ({ 경찰: 'police', 구청: 'gov', 변호사: 'law', 사내: 'internal', 상대측: 'opp' }[c] || 'etc');
}
