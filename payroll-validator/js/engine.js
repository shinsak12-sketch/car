/* ============================================================
   engine.js — 급여 계산 엔진 (세전)
   - 항목별 ÷12 절상 / 일할 30일 모델(앞구간 실제·마지막=30−앞, 유급 최소1)
   - 당월 = 지급일(as-paid) 시점, 지급일 이후 변동은 다음달 누적소급(carryIn)
   - 임금피크·육아기단축 연봉누락 차단 / 성과가급 분기(1·4·7·10)
   - 직책수당(고정역량가급) / 14명 특례 / 징계 / 무급휴가 감액(절하)
   ============================================================ */
window.PV = window.PV || {};
(function (PV) {
  'use strict';
  const { num, txt } = PV;

  const ITEMMAP = {
    기본급: '기본급', 실적급: '능력급', 성과급: '성과급', 성과가급: '성과가급',
    변동역량1: '변동역량가급1', 변동역량2: '변동역량가급2',
  };
  const LEDGER_ITEMS = ['기본급', '능력급', '성과급', '성과가급', '변동역량가급1', '변동역량가급2', '고정역량가급', '감액'];
  // 소급(전월 대장 대비 재계산 차액) 대상 = 발령·연봉 변동에 영향받는 정규 급여항목. 일회성(연차수당 등)·감액 제외.
  const SOGEUP_ITEMS = ['기본급', '능력급', '성과급', '성과가급', '변동역량가급1', '변동역량가급2', '고정역량가급'];
  // 귀속년월 문자열 → 'YYYY-MM' (다양한 표기 정규화: '2026-01','202601','2026년 1월' 등)
  function normYM(s) { const t = String(s == null ? '' : s).match(/(\d{4})\D*(\d{1,2})/); return t ? t[1] + '-' + String(+t[2]).padStart(2, '0') : ''; }
  PV.normYM = normYM;
  const SICK_EXCL = new Set(['성과가급', '변동역량가급1', '변동역량가급2', '고정역량가급']);
  const SUSPEND_EXCL = new Set(['변동역량가급1', '변동역량가급2', '고정역량가급']);

  // ---------- 유틸 ----------
  const ceilU = x => (Math.ceil((x - 1e-6) / 10) * 10) || 0;  // 십원 절상(급여)
  const floorU = x => (Math.floor((x + 1e-6) / 10) * 10) || 0; // 십원 절하(감액)

  // 최저임금: 연도별 최저시급 → 최저연봉 = 시급×12×(209+10*365/12/7*1.5), 천원 절상.
  // (최저임금은 1.1자 인상, 연봉계약은 4월이라 1~3월 등에서 최저 미달 가능 → 부족분을 성과급에 강제보전)
  const MIN_HOURLY = { 2023: 9620, 2024: 9860, 2025: 10030, 2026: 10320 };
  const MIN_ANNUAL_FACTOR = 209 + 10 * 365 / 12 / 7 * 1.5; // = 274.17857...
  function minAnnual(year) { const h = MIN_HOURLY[year]; return h ? Math.ceil(h * 12 * MIN_ANNUAL_FACTOR / 1000) * 1000 : 0; }
  PV.minAnnual = minAnnual;

  // 성과가급 = 분기 지급(1·4·7·10월). 월 성과가급(연액÷12 십원절상)의 3개월분(×3)을 지급.
  // (연액÷4를 한 번에 절상하는 게 아니라 월단위 절상 후 3배 → 대장 방식)
  const QUARTER_MONTHS = new Set([1, 4, 7, 10]);
  const monthlyBase = (srcK, annual, m) => srcK === '성과가급' ? (QUARTER_MONTHS.has(m) ? 3 * ceilU(annual / 12) : 0) : annual / 12;
  const P = s => { if (!s) return null; const [y, m, d] = s.split('-').map(Number); return { y, m, d }; };
  const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const dim = (y, m) => new Date(y, m, 0).getDate();
  const dow = (y, m, d) => new Date(y, m - 1, d).getDay();
  const cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0;
  function prevMonth(y, m) { return m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 }; }
  function addMonth(y, m, n) { let t = y * 12 + (m - 1) + n; return { y: Math.floor(t / 12), m: (t % 12) + 1 }; }
  function dateRange(a, b) { // ISO a~b 포함
    const out = []; if (!a || !b || a > b) return out;
    let [y, m, d] = a.split('-').map(Number); let cur = new Date(y, m - 1, d);
    for (let i = 0; i < 400; i++) {
      const s = iso(cur.getFullYear(), cur.getMonth() + 1, cur.getDate());
      if (s > b) break; out.push(s); cur.setDate(cur.getDate() + 1);
    }
    return out;
  }
  function addDay(isoStr) { const [y, m, d] = isoStr.split('-').map(Number); const dt = new Date(y, m - 1, d + 1); return iso(dt.getFullYear(), dt.getMonth() + 1, dt.getDate()); }
  function addDays(isoStr, n) { const [y, m, d] = isoStr.split('-').map(Number); const dt = new Date(y, m - 1, d + n); return iso(dt.getFullYear(), dt.getMonth() + 1, dt.getDate()); }
  function daysBetween(a, b) { const [ay, am, ad] = a.split('-').map(Number), [by, bm, bd] = b.split('-').map(Number); return Math.round((new Date(by, bm - 1, bd) - new Date(ay, am - 1, ad)) / 86400000); }
  PV.dim = dim;

  function payday(y, m, holidays) {
    let d = 20;
    while (d >= 1) { const wd = dow(y, m, d), s = iso(y, m, d); if (wd !== 0 && wd !== 6 && !holidays.has(s)) return s; d--; }
    return iso(y, m, 20);
  }
  PV.payday = payday;

  PV.buildContext = function (store) {
    const byId = (arr, key) => { const m = new Map(); (arr || []).forEach(r => { const k = r[key]; if (!m.has(k)) m.set(k, []); m.get(k).push(r); }); return m; };
    const salaryBy = byId(store.salary, '사번');
    salaryBy.forEach(list => list.sort((a, b) => cmp(a.연봉일자 || '', b.연봉일자 || '')));
    const ordersBy = byId(store.order, '사번');
    ordersBy.forEach(list => list.sort((a, b) => cmp(a.발령시작일 || '', b.발령시작일 || '')));
    const vacBy = byId((store.vacation || []).filter(v => v.결재 === '결재완료'), '사번');
    const rosterBy = new Map(); (store.roster || []).forEach(r => rosterBy.set(r.사번, r));
    const ov = store.overrides || {};
    return {
      salaryBy, ordersBy, vacBy, rosterBy, holidays: new Set(store.holiday || []),
      uploads: store.uploads || { annual: new Map(), prod: new Map(), etc: new Map() },
      discipline: store.discipline || [],
      carry: store.carry || new Map(),
      overrides: { unpaidVac: ov.unpaidVac || new Map(), maternity: ov.maternity || new Map() },
      dutyExtra: new Set(store.dutyExtra || []),
    };
  };

  function effContract(ctx, sabun, dateISO) {
    const list = ctx.salaryBy.get(sabun); if (!list || !list.length) return null;
    let pick = null;
    for (const c of list) { if (!c.연봉일자 || cmp(c.연봉일자, dateISO) <= 0) pick = c; }
    return pick || list[0];
  }
  function contractExactOn(ctx, sabun, dateISO) {
    const list = ctx.salaryBy.get(sabun); if (!list) return null;
    return list.find(c => c.연봉일자 === dateISO) || null;
  }

  function payTypeOf(gubun) {
    const g = gubun || '';
    if (g.includes('퇴직')) return 'retire';
    if (g.includes('의병')) return 'sick';
    if (g.includes('복직')) return 'normal';
    if (g.includes('단축') && g.includes('종료')) return 'normal';
    if (g.includes('단축')) return 'short';
    if (g.includes('휴직')) return 'unpaid';
    return 'normal';
  }

  function dutyAllowance(roster) {
    if (!roster) return 0;
    const 직책 = roster.직책 || '', 직급 = roster.직급 || '';
    if (직책.includes('센터장')) return 100000;
    if (직책.includes('본부장')) { if (직급 === 'L') return 2000000; return 0; }
    if (직책.includes('보상부장') || 직책.includes('부서장') || 직책.includes('파트장') || 직책.includes('TFT장')) return 1500000;
    return 0;
  }
  const isUnpaidVac = t => /무급휴가|가족돌봄|보건|생리/.test(t || '');
  // 출산휴가(모성) 판별 — 배우자출산휴가(남성 5일)는 모성휴가 아님(무급구간 없음) → 제외.
  const isMatVac = t => /출산|유사산/.test(t || '') && !/배우자/.test(t || '');

  function is14(ctx, sabun, monthEnd) {
    const orders = (ctx.ordersBy.get(sabun) || []).filter(o => o.발령시작일 && cmp(o.발령시작일, monthEnd) <= 0);
    const jobChanges = orders.filter(o => (o.발령구분 || '').includes('직무변경'));
    if (!jobChanges.length) return false;
    const last = jobChanges[jobChanges.length - 1];
    const jaOK = (last.후직급 || last.현재직급 || '').toUpperCase().startsWith('JA');
    const target = last.발령시작일 === '2026-07-01' && last.전직무.includes('소액전담') && last.후직무.includes('대물보상');
    if (!(target && jaOK)) return false;
    return last.후직무.includes('대물보상');
  }

  const PT_LABEL = { normal: '정상근무', unpaid: '무급휴직', sick: '의병휴직(80%)', short: '육아기단축' };

  // 모든 출산/유사산 휴가 날짜(유급+무급) Set — 일자별·기간형·override 모두 지원
  function maternityDates(ctx, sabun) {
    const rows = (ctx.vacBy.get(sabun) || []).filter(v => isMatVac(v.휴가종류));
    const mo = ctx.overrides.maternity.get(sabun);
    const set = new Set();
    if (mo) [...dateRange(mo.전시작, mo.전종료), ...dateRange(mo.후시작, mo.후종료)].forEach(d => set.add(d));
    else rows.forEach(v => {
      if (v.시작일 && v.종료일 && v.종료일 > v.시작일) dateRange(v.시작일, v.종료일).forEach(d => set.add(d));
      else if (v.시작일) set.add(v.시작일);
    });
    return set;
  }

  // 출산휴가 무급기간 {start,end} (유급 60/75일 이후). 분리 입력·기간형 자동 병합.
  //  - 사건(event) 단위로 분리: 출산전후휴가(birth)와 유사산휴가(mis)는 별개 사건, 각자 유급 60/75일.
  //    같은 종류라도 200일 넘게 떨어지면 다른 사건(다른 임신).
  //  - 사건 내 단일 블록: 유급이 앞·무급이 뒤. 분리 블록(출산전+출산후): 앞 블록서 유급 소진 시
  //    뒤 블록은 무급이 앞·유급이 뒤.
  function maternityUnpaid(ctx, sabun) {
    const rows = (ctx.vacBy.get(sabun) || []).filter(v => isMatVac(v.휴가종류));
    if (!rows.length) return null;
    const mo = ctx.overrides.maternity.get(sabun);
    // 날짜별 {d, grp, 다태아, full} 수집. full = '출산전후휴가'(통합 유형) — 법정연장 대상 판별용.
    let entries = [];
    if (mo) [...dateRange(mo.전시작, mo.전종료), ...dateRange(mo.후시작, mo.후종료)].forEach(d => entries.push({ d, grp: 'birth', da: mo.유형 === '다태아', full: false }));
    else rows.forEach(v => {
      const grp = /유사산/.test(v.휴가종류) ? 'mis' : 'birth', da = /다태아/.test(v.휴가종류), full = /출산전후/.test(v.휴가종류);
      const ds = (v.시작일 && v.종료일 && v.종료일 > v.시작일) ? dateRange(v.시작일, v.종료일) : (v.시작일 ? [v.시작일] : []);
      ds.forEach(d => entries.push({ d, grp, da, full }));
    });
    if (!entries.length) return null;
    const seen = new Set();
    entries = entries.filter(e => { if (seen.has(e.d)) return false; seen.add(e.d); return true; }).sort((a, b) => cmp(a.d, b.d));
    // 사건 분리(그룹 다름 or 200일 초과 간격)
    const events = []; let ev = [entries[0]];
    for (let i = 1; i < entries.length; i++) {
      if (entries[i].grp !== entries[i - 1].grp || daysBetween(entries[i - 1].d, entries[i].d) > 200) { events.push(ev); ev = [entries[i]]; }
      else ev.push(entries[i]);
    }
    events.push(ev);
    // 유급이 앞(최초 60/75일), 무급이 마지막(시간순). 출산전+출산후로 나뉘어도 시간순으로 이어서 계산.
    const unpaidDates = []; let matEnd = null;
    for (const evt of events) {
      const da = evt.some(x => x.da);
      const limit = da ? 75 : 60;
      let dts = evt.map(x => x.d);                  // 정렬됨
      // 출산전후휴가(birth)는 법정기간(단태아 90 / 다태아 120일) 연속. 휴가 기록이 짧게 끊겨도
      //  법정일수까지 연장해 유급(60/75) 초과분을 무급으로 반영(예: 오다혜 — 12월까지만 기록, 1월분 무급 누락).
      //  단, ①담당자 수기입력(override) 있으면 그대로 ②블록 사이 공백이 있으면(출산전+출산후 분리 특수케이스) 연장 안 함.
      // 법정연장은 '출산전후휴가'(통합 유형)에만 — '출산전휴가'·'출산후휴가'(분리 부분)나 배우자출산은 제외.
      if (evt[0].grp === 'birth' && !mo && evt.every(x => x.full)) {
        let contiguous = true;
        for (let i = 1; i < dts.length; i++) { if (daysBetween(dts[i - 1], dts[i]) > 1) { contiguous = false; break; } }
        if (contiguous) {
          let legalEnd = addDays(dts[0], (da ? 120 : 90) - 1);
          // 출산휴가 종료 후 다른 휴직/복직/단축 발령이 있으면 = 휴가가 실제 거기서 끝난 것(예: 석세라 32일 후 육아휴직)
          //  → 그 발령 전날까지만 연장. (연장 대상은 오다혜처럼 이후 상태발령 없이 휴가가 이어지는 경우)
          const recEnd = dts[dts.length - 1];
          const nextOrd = (ctx.ordersBy.get(sabun) || []).filter(o => /휴직|복직|단축|퇴직/.test(o.발령구분 || '') && o.발령시작일 && cmp(o.발령시작일, recEnd) > 0).sort((a, b) => cmp(a.발령시작일 || '', b.발령시작일 || ''))[0];
          if (nextOrd) { const cap = addDays(nextOrd.발령시작일, -1); if (cmp(cap, legalEnd) < 0) legalEnd = cap; }
          if (cmp(legalEnd, recEnd) > 0) dts = dateRange(dts[0], legalEnd);
        }
      }
      if (dts.length <= limit) continue;           // 사건 전체가 유급
      unpaidDates.push(...dts.slice(limit));       // 유급 앞 limit일, 무급은 나머지(마지막)
      const e = dts[dts.length - 1]; if (!matEnd || e > matEnd) matEnd = e;
    }
    if (!unpaidDates.length) return null;
    unpaidDates.sort();
    return { start: unpaidDates[0], end: unpaidDates[unpaidDates.length - 1], matEnd };
  }

  // ---------- 월 세그먼트(일할) ----------
  // absorb: 나머지(월 30일 압축분)를 어느 구간이 흡수하나.
  //  'front'(기본) = 마지막 구간이 흡수(30−앞단, 뒷구간 일수↓) / 'rear' = 첫 구간이 흡수(30−뒷단, 앞구간 일수↓)
  //  → 담당자가 상세팝업에서 '후단처리'로 뒷구간(복직·유급 등) 실제일수를 보장(근로자 유리)할 수 있음.
  function buildSegments(ctx, sabun, y, m, cutoffISO, block, calMode, absorb) {
    const monthStart = iso(y, m, 1);
    const monthEndDay = dim(y, m);
    // 퇴직은 '발령시작일'(발령 시점)이 아니라 '퇴직일'(마지막 근무일) 기준. 퇴직일 다음날부터 퇴직상태.
    // → 발령이 급여일 전에 찍혔어도 퇴직일이 급여일 이후면 그 달은 재직 → 급여 지급.
    let orders = (ctx.ordersBy.get(sabun) || []).map(o =>
      ((o.발령구분 || '').includes('퇴직') && o.퇴직일) ? Object.assign({}, o, { 발령시작일: addDay(o.퇴직일) }) : o
    );
    // 출산휴가 무급기간을 '무급 세그먼트'로 편입 (휴직 발령과 동일 취급 → 지급일 커트라인/소급 정확)
    const mu = maternityUnpaid(ctx, sabun);
    if (mu) {
      const backDate = addDay(mu.end); // 출산휴가 복귀 예정일
      // 복귀 직후(3일 내)에 다른 휴직/퇴직 발령이 이어지면 = 실제 복귀 아님(연속 휴가: 출산→육아휴직 등).
      //  → '복귀'(정상근무) 가짜구간을 생략해 유령 유급일이 안 생기게. (실제 복귀해 며칠이라도 근무하면 유지)
      const contLeave = orders.some(o => /휴직|퇴직/.test(o.발령구분 || '') && o.발령시작일 && cmp(o.발령시작일, backDate) >= 0 && daysBetween(backDate, o.발령시작일) <= 3);
      const pseudo = [{ 발령구분: '출산휴가(무급)', 발령시작일: mu.start, _pt: 'unpaid', _pseudo: true }];
      if (!contLeave) pseudo.push({ 발령구분: '출산휴가 복귀', 발령시작일: backDate, _pt: 'normal', _pseudo: true });
      orders = orders.concat(pseudo);
    }
    const PT = o => o._pt || payTypeOf(o.발령구분);
    // 같은 날 충돌 시 '더 제한적인(낮은 지급) 상태'가 이기도록 정렬(날짜 asc, 지급순위 desc → 무급이 뒤).
    // 무급휴직 = 정상복귀·복직보다 우선(출산무급/육아휴직이 같은 날 복직/복귀를 이긴다).
    const payRank = { unpaid: 0, retire: 0, sick: 1, short: 2, normal: 3 };
    orders = orders.slice().sort((a, b) => cmp(a.발령시작일 || '', b.발령시작일 || '') || ((payRank[PT(b)] ?? 3) - (payRank[PT(a)] ?? 3)) || ((a._pseudo ? 0 : 1) - (b._pseudo ? 0 : 1)));
    // 상태변경 발령만 세그먼트에 반영: 복직·휴직·단축·퇴직(+출산 가짜). 정기승진·직무변경 등
    // 행정발령은 근무상태를 바꾸지 않으므로 제외(연봉 변경은 연봉내역 일자로 자동 반영).
    orders = orders.filter(o => o._pseudo || /복직|휴직|단축|퇴직/.test(o.발령구분 || ''));
    const prior = orders.filter(o => o.발령시작일 && cmp(o.발령시작일, monthStart) < 0);
    let baseType = 'normal', baseGubun = '';
    if (prior.length) { baseGubun = prior[prior.length - 1].발령구분; baseType = PT(prior[prior.length - 1]); }
    else {
      // 월초 이전 발령이 없음. 명부 '(휴직)' 스냅샷은, 올해 '휴직 시작' 발령이 하나도 없을 때만
      // 이월휴직으로 인정. (의병/육아/무급 등 휴직시작 발령이 있으면 그 발령일부터가 휴직이므로
      //  월초부터 휴직으로 깔면 안 됨 → 지급일 상태 우선 원칙)
      const roster = ctx.rosterBy.get(sabun);
      const hasLeaveStart = orders.some(o => ['unpaid', 'sick', 'short'].includes(PT(o)));
      if (roster && (roster.직무 || '').includes('(휴직)') && !hasLeaveStart) {
        const c = ctx.carry.get(sabun);
        baseType = (c && c.종류) ? (c.종류.includes('의병') ? 'sick' : 'unpaid') : 'unpaid';
      }
    }
    // 퇴직: goneDate(=퇴직일 다음날)부터 퇴직상태. 이번달 시작 전(goneDate<=월초)이면 이미 퇴직 → 제외.
    // 이번달에 퇴직하면 제외하지 않고 세그먼트로 처리:
    //  · 퇴직일 >= 급여일 → 퇴직발령이 급여일 커트라인 밖 → 당월 전체 지급
    //  · 퇴직일 <  급여일 → 퇴직발령이 커트라인 안 → 근무일까지 일할계산
    const retOrder = orders.find(o => PT(o) === 'retire');
    if (retOrder && cmp(retOrder.발령시작일 || '', monthStart) <= 0) return { retired: true };
    if (baseType === 'retire') return { retired: true };
    const baseContract = effContract(ctx, sabun, monthStart);

    // 지급일 커트라인. 단, 출산휴가 종료 직후 이어지는 휴직(육아 등)은 지급일 이후라도 이번달에 반영
    // (출산휴가 유급은 휴가 종료일까지만 → 이후 휴직이 유급구간을 여기서 잘라줌).
    const matEnd = mu ? mu.matEnd : null;
    const monthEndISO = iso(y, m, monthEndDay);
    const matNext = (matEnd && cmp(addDay(matEnd), monthStart) >= 0 && cmp(addDay(matEnd), monthEndISO) <= 0) ? addDay(matEnd) : null;
    const inMonth = orders.filter(o => o.발령시작일 && cmp(o.발령시작일, monthStart) >= 0 &&
      (cmp(o.발령시작일, cutoffISO) <= 0 || (matNext && o.발령시작일 === matNext && ['unpaid', 'sick'].includes(PT(o)))));
    const segs = [{ startDay: 1, payType: baseType, contract: baseContract, gubun: baseGubun, _base: true }];
    for (const o of inMonth) {
      const pt = PT(o);
      // 휴직은 시작일 제외(발령일부터 무급) / 복직은 복직일부터 근무 / 단축근로종료=발령일 다음날부터 정상
      const endNextDay = /단축/.test(o.발령구분 || '') && /종료/.test(o.발령구분 || '');
      const startDay = P(o.발령시작일).d + (endNextDay ? 1 : 0);
      if (startDay > monthEndDay) continue;
      const segStartISO = iso(y, m, startDay);
      let contract;
      if (pt === 'short') {
        contract = contractExactOn(ctx, sabun, o.발령시작일);
        if (!contract && block) block.push({ 사번: sabun, 성명: (ctx.rosterBy.get(sabun) || {}).성명 || '', reason: '육아기단축 연봉 미입력', 일자: o.발령시작일 });
        contract = contract || effContract(ctx, sabun, o.발령시작일);
      } else {
        // 구간 시작일 기준 유효계약 (발령기간=연봉기간 일치, 단축종료 후 복원연봉 사용)
        contract = effContract(ctx, sabun, segStartISO);
      }
      segs.push({ startDay, payType: pt, contract, gubun: o.발령구분, pseudo: !!o._pseudo });
    }
    const merged = [];
    // 같은 날 충돌: (1) 실제 발령은 baseline(이월 상태)을 덮는다 — 복직/단축이 이월 육아휴직을 종료.
    // (2) 실제 발령끼리는 더 제한적인(낮은 지급) 상태가 우선 — 출산무급이 복직/복귀를,
    //     육아기단축이 복직을 이긴다.
    segs.forEach(s => {
      const last = merged[merged.length - 1];
      if (last && last.startDay === s.startDay) {
        if (last._base) merged[merged.length - 1] = s;                                   // baseline은 실제 발령에 밀림
        else if (!s._base && (payRank[s.payType] ?? 3) <= (payRank[last.payType] ?? 3)) merged[merged.length - 1] = s;
      } else merged.push(s);
    });
    merged.sort((a, b) => a.startDay - b.startDay);

    // 만근(구간1)=30일(연봉/12). 일할은 기본 30일 모델(당월), calMode(익월 소급)일 땐 실제 그 달 일수.
    //  → 당월 처리 시 마지막구간=30−앞, 익월 처리(소급) 시 실제일수로 1일 더 인정(근로자 유리 협의).
    const n = merged.length, total = (n === 1 || !calMode) ? 30 : monthEndDay;
    const isPaid = pt => ['normal', 'sick', 'short'].includes(pt);
    if (absorb === 'rear' && n > 1) {
      // 뒷단(2번째~마지막 구간)은 실제일수 보장, 첫 구간이 나머지(30−뒷단)를 흡수.
      let acc = 0;
      for (let i = n - 1; i >= 1; i--) {
        const span = (i < n - 1) ? (merged[i + 1].startDay - merged[i].startDay) : (monthEndDay + 1 - merged[i].startDay);
        merged[i].days = span; acc += span;
      }
      let first = total - acc;
      if (first <= 0) { const want = isPaid(merged[0].payType) ? 1 : 0; if (want > 0) merged[1].days = Math.max((merged[1].days || 0) - (want - first), 0); first = want; }
      merged[0].days = first;
    } else {
      let acc = 0;
      for (let i = 0; i < n; i++) {
        if (i < n - 1) { const span = merged[i + 1].startDay - merged[i].startDay; merged[i].days = span; acc += span; }
        else {
          let last = total - acc;
          // 30일모델 초과 시(마지막 구간이 말일 1일 등) 유급 최소 1일 보장하되, 초과분은 앞 구간에서 회수해
          //  총합=total 유지 → '하루 추가지급'이 아니라 '해당 1일 상향(차액)'이 되도록(예: 이유영 단축종료 말일).
          if (last <= 0) { const want = isPaid(merged[i].payType) ? 1 : 0; if (want > 0 && i > 0) merged[i - 1].days = Math.max((merged[i - 1].days || 0) - (want - last), 0); last = want; }
          merged[i].days = last;
        }
      }
    }
    return { segments: merged, retired: false };
  }

  // 무급휴가류(보건·생리·가족돌봄·무급휴가) = 전월분 이번달 공제(감액). 출산휴가는 세그먼트로 처리.
  function unpaidVacInMonth(ctx, sabun, y, m, exc) {
    const rows = ctx.vacBy.get(sabun) || [];
    const pm = prevMonth(y, m);
    const pym = `${pm.y}-${String(pm.m).padStart(2, '0')}`;
    let days = 0;
    rows.forEach(v => { if (isUnpaidVac(v.휴가종류) && (v.시작일 || '').startsWith(pym)) days += (v.휴가일수 || 1); });
    return days;
  }

  // ---------- 한 사람·한 달 base 계산 (cutoff: 'actual'|'pay') ----------
  function computeBase(ctx, sabun, y, m, cutoff, block, exc, trace, calMode, absorb) {
    const monthEnd = iso(y, m, dim(y, m));
    const cutoffISO = cutoff === 'pay' ? payday(y, m, ctx.holidays) : monthEnd;
    const roster = ctx.rosterBy.get(sabun);

    if (roster && (roster.피크적용 || '').includes('적용') && roster.피크예상일) {
      const pk = P(roster.피크예상일);
      if (pk && pk.m === m && y >= pk.y) {
        const need = iso(y, m, 1);
        if (!contractExactOn(ctx, sabun, need) && block) block.push({ 사번: sabun, 성명: (roster && roster.성명) || '', reason: '임금피크 연봉 미입력', 일자: need });
      }
    }

    const seg = buildSegments(ctx, sabun, y, m, cutoffISO, block, calMode, absorb);
    if (seg.retired) return { retired: true };

    const pay = {}; LEDGER_ITEMS.forEach(k => pay[k] = 0);
    let paidUnits = 0;
    const real = {}; LEDGER_ITEMS.forEach(k => real[k] = 0);
    seg.segments.forEach(s => {
      const c = s.contract; if (!c) return;
      const days = s.days || 0;
      for (const [srcK, colK] of Object.entries(ITEMMAP)) {
        const mbase = monthlyBase(srcK, c.items[srcK] || 0, m);
        let rate = 0;
        if (s.payType === 'normal' || s.payType === 'short') rate = 1;
        else if (s.payType === 'sick') rate = SICK_EXCL.has(colK) ? 0 : 0.8;
        real[colK] += (mbase / 30) * days * rate;
      }
      if (s.payType === 'normal' || s.payType === 'short') paidUnits += days;
    });
    if (paidUnits < 0) paidUnits = 0;

    const dutyBase = dutyAllowance(roster), dutyExt = ctx.dutyExtra.has(sabun) ? 100000 : 0;
    const flat = dutyBase + dutyExt;
    if (flat > 0) real['고정역량가급'] += flat / 30 * paidUnits;

    const applied14 = is14(ctx, sabun, monthEnd);
    if (applied14) real['변동역량가급1'] += 500000 / 30 * paidUnits;

    // 최저임금 보전: 연봉(고정역량가급 제외)이 최저연봉 미만이면 부족분/12를 성과급에 강제 추가.
    //  육아기단축근무자는 연봉 자체가 시간비례로 낮으므로, 최저기준도 최저연봉 × (주간근로시간/40)로 비례 하향해야 함.
    //  (예: 단축35=35/40, 단축15=15/40). 단축시간(NN)은 ①현재 short 세그먼트 gubun, ②이력상 활성 육아기단축근로NN 발령에서 추출.
    //  단축근무자인데 NN을 확정 못하면(발령 데이터에 시간 누락) 풀타임 최저와 비교하면 과다보전이 되므로 보전을 생략(확인필요).
    const ymStr = `${y}-${String(m).padStart(2, '0')}`;
    const allOrders = ctx.ordersBy.get(sabun) || [];
    let minShortHrs = 0, isShortWorker = false;
    const grabNN = g => { const mt = (g || '').match(/(\d{2})\s*$/); return mt ? +mt[1] : 0; };
    seg.segments.forEach(s => { if (s.payType === 'short') { isShortWorker = true; const nn = grabNN(s.gubun); if (nn) minShortHrs = nn; } });
    // 이력: 최신 육아기단축근로NN 시작 / 그 이후의 완전복귀(복직·단축근로종료)
    let shortStart = null, shortEnd = null;
    allOrders.forEach(o => {
      const g = o.발령구분 || '', dt = o.발령시작일 || '';
      if (!dt || cmp(dt, monthEnd) > 0) return;
      if (/단축/.test(g) && !/종료/.test(g)) { if (!shortStart || dt > shortStart.발령시작일) shortStart = o; }
      if (/복직/.test(g) || (/단축/.test(g) && /종료/.test(g))) { if (!shortEnd || dt > shortEnd.발령시작일) shortEnd = o; }
    });
    if (shortStart && (!shortEnd || cmp(shortEnd.발령시작일, shortStart.발령시작일) <= 0)) { isShortWorker = true; if (!minShortHrs) minShortHrs = grabNN(shortStart.발령구분); }
    if (shortEnd && /단축/.test(shortEnd.발령구분 || '') && (shortEnd.발령시작일 || '').slice(0, 7) === ymStr) isShortWorker = true; // 이번달 단축종료 → 이번달은 단축근무자
    // 발령에 육아기단축근로 시작이 없어도 휴가 종류에 '육아기 등 단축근무자' 흔적이 있으면 단축근무자로 인식.
    //  (발령 데이터에 단축시간 NN이 없어 스케일은 못 하므로 → 과다보전 방지 위해 보전 생략)
    if (!isShortWorker) { const vs = ctx.vacBy.get(sabun) || []; if (vs.some(v => /단축근무자|단축근로|육아기\s*단축/.test(v.휴가종류 || ''))) isShortWorker = true; }
    const minShortUnknown = isShortWorker && !minShortHrs;
    const minStd = minShortUnknown ? 0 : minAnnual(y) * (minShortHrs ? minShortHrs / 40 : 1);
    let minTopup = 0, minAnnualCmp = 0;
    {
      const ec = effContract(ctx, sabun, monthEnd);
      if (ec) for (const srcK of Object.keys(ITEMMAP)) minAnnualCmp += (ec.items[srcK] || 0); // 고정역량가급 제외(연봉내역엔 없음)
      if (minStd > 0 && minAnnualCmp > 0 && minAnnualCmp < minStd) { minTopup = (minStd - minAnnualCmp) / 12; real['성과급'] += minTopup / 30 * paidUnits; }
    }

    LEDGER_ITEMS.forEach(k => pay[k] = ceilU(real[k]));

    // 무급휴가 공제: 감액 항목에 총액 마이너스(절하)
    // 1일 급여 = 연봉항목 ÷ 12 ÷ 30 (고정 일당). 성과가급도 분기지급과 무관하게 항상 연액/12 기준.
    const uvac = unpaidVacInMonth(ctx, sabun, y, m, exc);
    let uvacDeduct = 0;
    if (uvac > 0) {
      // 감액/추가지급 지급은 이번달이지만 금액계산은 '발생한 달(전월)'의 연봉으로. (4.1자 연봉인상 반영)
      const pm = prevMonth(y, m);
      const ec = effContract(ctx, sabun, iso(pm.y, pm.m, dim(pm.y, pm.m)));
      let fullGross = flat + (applied14 ? 500000 : 0);
      if (ec) for (const srcK of Object.keys(ITEMMAP)) fullGross += (ec.items[srcK] || 0) / 12;
      // 1일 급여를 십원 절하한 뒤 일수를 곱한다(대장 방식). (일당절하 × 일수)
      uvacDeduct = floorU(fullGross / 30) * uvac;
      pay['감액'] = (pay['감액'] || 0) - uvacDeduct;
    }
    real['감액'] = pay['감액'] || 0; // 감액(정수·십원)도 raw에 반영 → 소급 원단위 누적용

    const peakApplied = roster && (roster.피크적용 || '').includes('적용') && roster.피크예상일 && P(roster.피크예상일).m === m && y >= P(roster.피크예상일).y;
    if (trace) {
      const ec = effContract(ctx, sabun, monthEnd) || { items: {} };
      trace.연봉일자 = ec.연봉일자; trace.연봉 = Object.assign({}, ec.items);
      trace.month = m; trace.year = y; trace.quarterMonth = QUARTER_MONTHS.has(m);
      trace.segments = seg.segments.map(s => ({ label: s.gubun || PT_LABEL[s.payType], days: s.days, payType: s.payType }));
      trace.ilhal = seg.segments.length > 1 || (seg.segments[0] && seg.segments[0].payType !== 'normal');
      trace.dutyLabel = dutyBase ? (roster && roster.직책 || '') : (dutyExt ? '본점 예외' : '');
      trace.dutyFlat = flat; trace.is14 = applied14; trace.uvac = uvac; trace.uvacDeduct = uvacDeduct; trace.peakApplied = peakApplied;
      trace.minTopup = minTopup; trace.minStd = minStd; trace.minAnnualCmp = minAnnualCmp; trace.minShortHrs = minShortHrs;
      trace.minShortWorker = isShortWorker; trace.minShortUnknown = minShortUnknown;
      trace.발령 = (ctx.ordersBy.get(sabun) || []).map(o => ({ 구분: o.발령구분, 시작일: o.발령시작일, 퇴직일: o.퇴직일 || '' }));
      trace.휴가 = (ctx.vacBy.get(sabun) || []).map(v => ({ 종류: v.휴가종류, 시작일: v.시작일, 종료일: v.종료일, 일수: v.휴가일수 }));
      const _mu = maternityUnpaid(ctx, sabun);
      trace.matUnpaid = _mu ? { start: _mu.start, end: _mu.end } : null; // 출산/유사산 무급 구간
    }
    return { retired: false, pay, real, paidUnits, is14: applied14, segments: seg.segments, uvac, peakApplied, minTopup, minStd, minAnnualCmp, minShortHrs, minShortWorker: isShortWorker, minShortUnknown };
  }

  // 누적 소급: 전월 이전의 (실제−기지급) 차액을 급여 나오는 달에 정산.
  // 무급기간엔 이월되어 복직/급여발생 달에 반영(음수 급여 방지).
  function carryIn(ctx, sabun, y, m) {
    const acc = {}; LEDGER_ITEMS.forEach(k => acc[k] = 0);
    for (let back = 12; back >= 1; back--) {
      const mm = addMonth(y, m, -back);
      const ap = computeBase(ctx, sabun, mm.y, mm.m, 'pay', [], null);
      const ac = computeBase(ctx, sabun, mm.y, mm.m, 'actual', [], null, null, true); // 소급=익월처리=실제일수
      if (ap.retired || ac.retired) continue;
      const paid = LEDGER_ITEMS.reduce((a, k) => a + (ap.pay[k] || 0), 0) > 0;
      // 지급이 있었던 달은 그 시점까지 정산 완료로 간주(리셋, 자기 diff도 누적 안 함).
      // 미지급(무급·복직 이연 등)된 달의 실제근무분만 누적 → 다음 지급달에 소급.
      //  (지급월의 '지급일 이후 변동'은 그 달 재계산/후단으로 처리하므로 소급 누적 대상 아님)
      //  원(raw) 단위로 누적 — 최종 base+소급 합산 후 한 번만 절상(이중 반올림 방지)
      if (paid) { LEDGER_ITEMS.forEach(k => acc[k] = 0); }
      else { LEDGER_ITEMS.forEach(k => acc[k] += (ac.real[k] || 0) - (ap.real[k] || 0)); }
    }
    return acc;
  }

  // 전월 대장 기반 소급: (전월을 지금 전체데이터로 재계산한 정답) − (전월 대장 실지급). 정규항목만, 정수 차액.
  //  전월 처리내역(resolution)이 정상처리/오류확인이면 소급 0(그 달을 담당자가 인정/오류처리). 후단이면 후단으로 재계산.
  //  반환: { carry:{item:diff}, correct:{item}, paid:{item}, sum } (UI 표기용 근거 포함)
  function prevLedgerCarry(ctx, sabun) {
    const res = ctx.resolutions && ctx.resolutions.get(sabun);
    if (res && (res.review === 'normal' || res.review === 'error')) return { carry: {}, sum: 0, skipped: res.review };
    const paid = ctx.prevLedgerBase.get(sabun) || {};
    // ★ 전월에 '지급일 이후 이연'이 실제로 있었는지 확인(전월 as-paid ≠ actual). 없으면 소급 0.
    //   (전월 대장에 전전월 소급이 섞여 있어도, 전월 자체 이연이 없으면 비교하지 않음 → 유령 소급 방지. 예: 채경운 2월)
    const paidCut = computeBase(ctx, sabun, ctx.prevY, ctx.prevM, 'pay', [], null);
    const paidSum = SOGEUP_ITEMS.reduce((a, k) => a + (Math.round(paid[k] || 0)), 0);
    // 전월이 지급된 달(양수)이면 30일모델(상향 차액), 미지급(0)이면 실일수(전액·근로자 유리) 기준.
    const calMode = paidSum > 0 ? false : true;
    // 전월 처리 방식(앞단/후단): resolution(전월 검증처리) 우선 → 없으면 전월 대장과 일치하는 방식 자동 감지.
    //  (전월에 후단처리했으면 후단으로 재계산해야 유령 소급이 안 생김. 예: 한지혜 전월 30−후단)
    const ledMatch = a => SOGEUP_ITEMS.every(k => Math.round(a.pay[k] || 0) === Math.round(paid[k] || 0));
    let absorb = (res && res.processedMode === 'rear') ? 'rear' : (res && res.processedMode) ? 'front' : null;
    let correct;
    if (absorb) {
      correct = computeBase(ctx, sabun, ctx.prevY, ctx.prevM, 'actual', [], null, null, calMode, absorb);
    } else {
      const cf = computeBase(ctx, sabun, ctx.prevY, ctx.prevM, 'actual', [], null, null, calMode, 'front');
      if (paidSum > 0) {
        const cr = computeBase(ctx, sabun, ctx.prevY, ctx.prevM, 'actual', [], null, null, calMode, 'rear');
        if (ledMatch(cr) && !ledMatch(cf)) { correct = cr; absorb = 'rear'; } else { correct = cf; absorb = 'front'; }
      } else { correct = cf; absorb = 'front'; }
    }
    if (correct.retired || paidCut.retired) return { carry: {}, sum: 0 };
    const deferred = SOGEUP_ITEMS.some(k => Math.round(correct.pay[k] || 0) !== Math.round((paidCut.pay && paidCut.pay[k]) || 0));
    if (!deferred) return { carry: {}, sum: 0 }; // 전월 자체 이연 없음 → 소급 없음
    const carry = {}, cor = {}, pd = {}; let sum = 0;
    SOGEUP_ITEMS.forEach(k => {
      const cr = correct.real[k] || 0, pr = (paidCut.real && paidCut.real[k]) || 0, led = Math.round(paid[k] || 0);
      // 전월 대장이 as-paid(단축만근 등)와 일치하면 raw 차액(정답−as-paid)을 한 번만 절상 → 이중 반올림 오차(10원) 제거.
      //  대장이 as-paid와 다르면(담당자가 이미 다르게 처리/오류) 대장 기준으로 차액 산출.
      const d = (ceilU(pr) === led) ? ceilU(cr - pr) : (ceilU(cr) - led);
      cor[k] = ceilU(cr); pd[k] = led; if (d) { carry[k] = d; sum += d; }
    });
    return { carry, correct: cor, paid: pd, sum, absorb };
  }

  // ---------- 한 사람 종합 ----------
  // baseCutoff: 'pay'=지급일 기준(기본), 'actual'=월말 기준(지급일 이후분까지 당월 적용, 예외 재계산)
  // skipCarry: 예외 재계산(당월적용)·전월이월무시는 이번달 실제 근무분만 — 전월 소급은 제외.
  function computePerson(ctx, sabun, y, m, baseCutoff, skipCarry, absorb) {
    const exc = [];
    const trace = { extras: [] };
    // 당월 지급액 = 지급일(as-paid) 기준. 지급일 이후 변동은 다음달 소급.
    const base = computeBase(ctx, sabun, y, m, baseCutoff || 'pay', [], exc, trace, false, absorb);
    if (base.retired) return { retired: true };
    const pay = Object.assign({}, base.pay);
    const notes = [];
    if (base.is14) notes.push('14명특례 +50만(변동역량가급1)');

    const roster = ctx.rosterBy.get(sabun);
    const orders = ctx.ordersBy.get(sabun) || [];
    if (roster && (roster.직무 || '').includes('(휴직)') && !orders.some(o => ['unpaid', 'sick'].includes(payTypeOf(o.발령구분)))) {
      if (!ctx.carry.get(sabun) || !ctx.carry.get(sabun).종류) exc.push({ 사번: sabun, 성명: (roster && roster.성명) || '', type: 'warn', kind: 'carry', title: '휴직 종류 확인 필요', desc: '명부상 (휴직) 상태이나 종류 미입력 → 무급으로 계산했습니다.' });
    }

    // 업로드 변동항목
    if (m === 1 && ctx.uploads.annual.has(sabun)) { const v = num(ctx.uploads.annual.get(sabun)); pay['연차수당'] = (pay['연차수당'] || 0) + v; trace.extras.push({ label: '연차수당(업로드·1월)', amount: v }); }
    if (ctx.uploads.prod.has(sabun)) { const v = num(ctx.uploads.prod.get(sabun)); pay['생산성향상격려금'] = (pay['생산성향상격려금'] || 0) + v; trace.extras.push({ label: '생산성향상격려금(업로드)', amount: v }); }
    if (ctx.uploads.etc.has(sabun)) ctx.uploads.etc.get(sabun).forEach(e => { if (e.구분) { pay[e.구분] = (pay[e.구분] || 0) + num(e.금액); trace.extras.push({ label: `${e.구분}(기타 업로드)`, amount: num(e.금액) }); } });

    // 징계/근태 (감봉·결근·지각 = 수기 감액, 정직 = 50%)
    ctx.discipline.filter(d => d.사번 === sabun).forEach(d => {
      const kind = d.종류 || '';
      if (/감봉|결근|지각/.test(kind)) {
        const amt = Math.abs(num(d.금액));
        pay['감액'] = (pay['감액'] || 0) - amt;
        notes.push(kind + ' 감액 ' + amt.toLocaleString());
        trace.extras.push({ label: kind + '(감액)', amount: -amt });
      } else if (kind.includes('정직')) {
        LEDGER_ITEMS.forEach(k => { if (k === '감액') return; if (SUSPEND_EXCL.has(k)) pay[k] = 0; else pay[k] = ceilU(pay[k] * 0.5); });
        notes.push('정직 50% (역량가급 제외)');
        trace.extras.push({ label: '정직 50% (역량가급·고정역량가급 제외)', amount: null });
      }
    });

    // 소급정산: 급여 나오는 달에 반영.
    const paidThisMonth = LEDGER_ITEMS.reduce((a, k) => a + (base.pay[k] || 0), 0) > 0;
    if (paidThisMonth && !skipCarry) {
      if (ctx.prevLedgerBase) {
        // ★ 전월 대장 기반: (전월 재계산 정답) − (전월 대장 실지급) 정수 차액을 그대로 가산.
        const pl = prevLedgerCarry(ctx, sabun);
        let s = 0;
        SOGEUP_ITEMS.forEach(k => { const c = pl.carry[k] || 0; if (c) { pay[k] = (pay[k] || 0) + c; s += c; } });
        if (s !== 0) { notes.push(`소급정산 ${s >= 0 ? '+' : ''}${s.toLocaleString()}`); trace.extras.push({ label: '소급정산 (전월 대장 대비 재계산 차액)', amount: s }); }
        trace.sogeup = pl;
      } else {
        // 폴백(전월 대장 미제공): 다개월 as-paid 추정 모델. base(raw)+소급(raw) 합산 후 한 번만 절상.
        const carry = carryIn(ctx, sabun, y, m);
        let s = 0;
        LEDGER_ITEMS.forEach(k => {
          const adj = (pay[k] || 0) - (base.pay[k] || 0);
          const combined = (base.real[k] || 0) + (carry[k] || 0);
          const rounded = k === '감액' ? Math.round(combined) : ceilU(combined);
          const before = pay[k] || 0;
          pay[k] = rounded + adj;
          s += pay[k] - before;
        });
        if (s !== 0) { notes.push(`소급정산 ${s >= 0 ? '+' : ''}${s.toLocaleString()}`); trace.extras.push({ label: '소급정산 (전월 이전 지급일 이후 변동 정산)', amount: s }); }
      }
    }

    const segNote = base.segments && (base.segments.length > 1 || (base.segments[0] && base.segments[0].payType !== 'normal'));
    if (segNote) notes.unshift('일할 · ' + base.segments.map(s => `${s.gubun || PT_LABEL[s.payType]} ${s.days}일`).join(' → '));
    if (base.uvac > 0) notes.push(`전월 무급휴가 ${base.uvac}일 공제`);
    if (base.peakApplied) notes.push('임금피크 해당월');
    if (base.minTopup > 0) { notes.push(`⚠최저임금 보전 (연봉 ${base.minAnnualCmp.toLocaleString()} < 최저 ${Math.round(base.minStd).toLocaleString()}${base.minShortHrs ? ' ·단축' + base.minShortHrs : ''}, 성과급+월 ${Math.round(base.minTopup).toLocaleString()})`); }
    else if (base.minShortUnknown && base.minAnnualCmp > 0 && base.minAnnualCmp < minAnnual(y)) { notes.push('육아기단축근무자 — 최저보전 생략 (단축시간 미확인, 발령에 육아기단축근로NN 없음)'); }
    trace.finalPay = Object.assign({}, pay);

    return { retired: false, pay, notes, exc, paidUnits: base.paidUnits, segments: base.segments, trace };
  }

  // ---------- 급여계산 (급여대장 불필요) ----------
  PV.computePayroll = function (store, target) {
    const ctx = PV.buildContext(store);
    const { y, m } = target;
    // ★ 전월 대장 기반 소급 준비: 누적 급여대장에서 전월(귀속년월) 정규항목 실지급액 추출.
    //   전월 대장이 있으면 소급을 '추정' 대신 '실지급 대조'로 계산(정확). 없으면 carryIn 폴백.
    const pm = prevMonth(y, m);
    const prevYM = `${pm.y}-${String(pm.m).padStart(2, '0')}`;
    const prevRows = (store.ledger || []).filter(r => (r.지급유형 || '').trim() === '급여' && normYM(r.귀속년월) === prevYM);
    if (prevRows.length) {
      const pmap = new Map();
      prevRows.forEach(r => { const o = {}; SOGEUP_ITEMS.forEach(k => o[k] = Math.round((r.pay && r.pay[k]) || 0)); pmap.set(r.사번, o); });
      ctx.prevLedgerBase = pmap; ctx.prevY = pm.y; ctx.prevM = pm.m;
      ctx.resolutions = store.resolutions instanceof Map ? store.resolutions : new Map(Object.entries(store.resolutions || {}));
    }
    const prevPayday = ctx.prevLedgerBase ? payday(pm.y, pm.m, ctx.holidays) : null;
    const block = [];
    const ids = new Set([...ctx.salaryBy.keys()]);
    ids.forEach(id => computeBase(ctx, id, y, m, 'actual', block, null));
    const blocked = block.length > 0;

    const rows = [], alerts = [], allExc = [];
    if (!blocked) {
      ids.forEach(id => {
        const r = computePerson(ctx, id, y, m);
        if (r.retired) return;
        const roster = ctx.rosterBy.get(id);
        const sal = (ctx.salaryBy.get(id) || []).slice(-1)[0] || {};
        (r.exc || []).forEach(e => allExc.push(e));
        const total = Math.round(Object.values(r.pay).reduce((a, b) => a + b, 0));
        // 예외 재계산값(월말 기준=지급일 이후분 당월 적용, 소급 제외). 항상 제공.
        //  · rAlt  = 당월적용(30−앞단, 기본) / rAlt2 = 후단처리(30−뒷단, 뒷구간 실제일수 보장)
        const rAlt = computePerson(ctx, id, y, m, 'actual', true, 'front');
        const altTotal = rAlt.retired ? total : Math.round(Object.values(rAlt.pay).reduce((a, b) => a + b, 0));
        const hasAlt = !rAlt.retired && altTotal !== total;
        const rAlt2 = computePerson(ctx, id, y, m, 'actual', true, 'rear');
        const altTotal2 = rAlt2.retired ? total : Math.round(Object.values(rAlt2.pay).reduce((a, b) => a + b, 0));
        const hasAlt2 = !rAlt2.retired && altTotal2 !== altTotal;
        // 당월(30−앞단) vs 익월(실제일수) 처리 시 유급일수가 달라지는지 → 담당자에게 익월 처리 권장 경고.
        //  지급일 이후 변동(소급 대상)이 있고, 30일모델 유급일수 ≠ 실제일수 유급일수일 때만.
        const notes = (r.notes || []).slice();
        const bReal = computeBase(ctx, id, y, m, 'actual', [], null, null, true);
        const paid30 = rAlt.retired ? 0 : rAlt.paidUnits, paidReal = bReal.retired ? 0 : bReal.paidUnits;
        const hasPostPayChange = !rAlt.retired && r.paidUnits !== rAlt.paidUnits;
        const dayShift = hasPostPayChange && paid30 !== paidReal;
        if (dayShift) notes.push(`⚠당월/익월 처리 일수 차이 ${Math.abs(paidReal - paid30)}일 — 익월 처리 권장 (근로자 유리)`);
        // 전월 대장 대비 소급 + '전월 이월 무시'(소급 제외) 값
        const sog = r.trace && r.trace.sogeup;
        const hasSogeup = !!(sog && sog.sum);
        let ignorePay = null, ignoreTotal = total, ignoreNotes = null, prevChangeOrders = null;
        if (ctx.prevLedgerBase) {
          const rIg = computePerson(ctx, id, y, m, 'pay', true); // 소급 제외(전월 이월 무시)
          if (!rIg.retired) { ignorePay = rIg.pay; ignoreTotal = Math.round(Object.values(rIg.pay).reduce((a, b) => a + b, 0)); ignoreNotes = rIg.notes || []; }
          // 전월 지급일 이후 발생한 변동 발령(급여영향) — 좌측 강조용
          prevChangeOrders = (ctx.ordersBy.get(id) || []).filter(o => o.발령시작일 && normYM(o.발령시작일) === prevYM && cmp(o.발령시작일, prevPayday) > 0 && /복직|휴직|단축|퇴직/.test(o.발령구분 || '')).map(o => ({ 구분: o.발령구분, 시작일: o.발령시작일 }));
          if (hasSogeup) notes.push(`전월(${prevYM}) 지급일 이후 변동 → 소급 ${sog.sum >= 0 ? '+' : ''}${sog.sum.toLocaleString()} (누락 확인)`);
        }
        rows.push({
          사번: id, 성명: (roster && roster.성명) || sal.성명 || '', 소속: (roster && roster.소속) || sal.소속 || '',
          pay: r.pay, notes, warn: (r.exc || []).length > 0, trace: r.trace, total, dayShift,
          altPay: rAlt.retired ? null : rAlt.pay, altNotes: rAlt.retired ? null : (rAlt.notes || []), altTotal, hasAlt,
          altPay2: rAlt2.retired ? null : rAlt2.pay, altNotes2: rAlt2.retired ? null : (rAlt2.notes || []), altTotal2, hasAlt2,
          sogeup: sog || null, hasSogeup, ignorePay, ignoreTotal, ignoreNotes, prevChangeOrders,
        });
      });
      rows.sort((a, b) => (a.소속 || '').localeCompare(b.소속 || '') || a.사번.localeCompare(b.사번));
    }

    if (blocked) alerts.push({ level: 'block', title: `연봉 미입력 — 전체 계산 차단 (${block.length}건)`, desc: block.map(b => `${b.사번} ${b.성명 || ''}(${b.reason} ${b.일자})`).join(', ') + ' · 인사시스템에 연봉 입력 후 재실행하세요.' });
    const cnt14 = rows.filter(r => (r.notes || []).some(n => n.includes('14명특례'))).length;
    if (cnt14) alerts.push({ level: 'info', title: `직무변경 특례 ${cnt14}명`, desc: 'JA·소액전담→대물보상(26-07-01) 변동역량가급1 +월 50만원' });
    const retroP = rows.filter(r => (r.notes || []).some(n => n.includes('소급')));
    if (retroP.length) alerts.push({ level: 'info', title: `소급정산 반영 ${retroP.length}명`, desc: retroP.map(r => r.성명 || r.사번).join(', ') });
    const ilhal = rows.filter(r => (r.notes || []).some(n => n.startsWith('일할'))).length;
    if (ilhal) alerts.push({ level: 'info', title: `일할계산 ${ilhal}명`, desc: '휴직·복직·단축 등으로 일할 적용된 인원' });
    const shiftRows = rows.filter(r => r.dayShift);
    if (shiftRows.length) alerts.push({ level: 'warn', title: `당월/익월 일수 차이 ${shiftRows.length}명`, desc: '당월(30−앞단)과 익월(실제일수) 처리 시 유급일수가 달라짐 → 익월 처리 권장(1일 근로자 유리): ' + shiftRows.map(r => r.성명 || r.사번).join(', ') });
    const sogRows = rows.filter(r => r.hasSogeup);
    if (sogRows.length) alerts.push({ level: 'warn', title: `전월 지급일 이후 변동(소급) ${sogRows.length}명`, desc: `전월 대장 대비 재계산 차액 발생 → 당월 추가처리 필요. 담당자 누락 여부 확인: ` + sogRows.map(r => `${r.성명 || r.사번}(${r.sogeup.sum >= 0 ? '+' : ''}${r.sogeup.sum.toLocaleString()})`).join(', ') });
    const seen = new Set();
    allExc.forEach(e => { const k = e.사번 + e.title; if (seen.has(k)) return; seen.add(k); alerts.push({ level: e.type || 'warn', title: `${e.title} — ${e.사번} ${e.성명 || ''}`, desc: e.desc, 사번: e.사번, 성명: e.성명, kind: e.kind }); });

    return {
      target, blocked, block, payday: payday(y, m, ctx.holidays),
      prevLedger: !!ctx.prevLedgerBase, prevYM: ctx.prevLedgerBase ? prevYM : null, prevPayday,
      rows, alerts,
      summary: { total: rows.length, block: block.length, warn: rows.filter(r => r.warn).length, ilhal, special: cnt14 + retroP.length, sogeup: rows.filter(r => r.hasSogeup).length },
    };
  };

  // ---------- 검증 (계산 vs 급여대장) ----------
  PV.compareLedger = function (payroll, store) {
    // 누적 급여대장 → 당월(귀속년월)만 대조 대상.
    const curYM = `${payroll.target.y}-${String(payroll.target.m).padStart(2, '0')}`;
    const allG = (store.ledger || []).filter(r => (r.지급유형 || '').trim() === '급여');
    const hasYM = allG.some(r => normYM(r.귀속년월));
    const ledger = hasYM ? allG.filter(r => normYM(r.귀속년월) === curYM) : allG;
    const byId = new Map(); payroll.rows.forEach(r => byId.set(r.사번, r));
    const rows = [], alerts = [];
    let okCnt = 0, badCnt = 0;

    ledger.forEach(L => {
      const r = byId.get(L.사번);
      if (!r) {
        rows.push({ 사번: L.사번, 성명: L.성명, 소속: L.소속, status: 'bad', diffs: [{ col: '—', ours: 0, led: Math.round(L.총지급액 || 0), diff: -Math.round(L.총지급액 || 0) }], ours: {}, led: L.pay || {}, notes: ['급여대장엔 있으나 계산 대상 아님 (연봉내역에 사번 없음 또는 퇴직/제외)'], warn: true, ourTotal: 0, ledTotal: Math.round(L.총지급액 || 0) });
        badCnt++; return;
      }
      const ourCols = new Set(PV.LEDGER_ITEMS);
      Object.keys(r.pay).forEach(k => { if (r.pay[k] !== 0) ourCols.add(k); });
      const diffs = [];
      ourCols.forEach(col => { const ours = Math.round(r.pay[col] || 0), led = Math.round((L.pay && L.pay[col]) || 0); if (ours !== led) diffs.push({ col, ours, led, diff: ours - led }); });
      const status = diffs.length ? 'bad' : 'ok';
      status === 'ok' ? okCnt++ : badCnt++;
      const notes = (r.notes || []).slice();
      if (diffs.length) notes.unshift('불일치: ' + diffs.map(d => d.col).join(', '));
      // 예외 재계산 값 vs 대장 — 재계산 버튼용 (항상 제공)
      //  alt = 당월적용(30−앞단) / alt2 = 후단처리(30−뒷단)
      const altOf = (payK, totK) => {
        if (!r[payK]) return null;
        const aCols = new Set(PV.LEDGER_ITEMS); Object.keys(r[payK]).forEach(k => { if (r[payK][k] !== 0) aCols.add(k); });
        const aDiffs = []; aCols.forEach(col => { const ours = Math.round(r[payK][col] || 0), led = Math.round((L.pay && L.pay[col]) || 0); if (ours !== led) aDiffs.push({ col, ours, led, diff: ours - led }); });
        return { pay: r[payK], total: r[totK], diffs: aDiffs, status: aDiffs.length ? 'bad' : 'ok' };
      };
      let alt = altOf('altPay', 'altTotal'); if (alt) { alt.notes = r.altNotes || []; }
      let alt2 = altOf('altPay2', 'altTotal2'); if (alt2) { alt2.notes = r.altNotes2 || []; }
      // 전월 이월 무시(소급 제외) 값 vs 대장
      let ignore = null;
      if (r.ignorePay) {
        const iCols = new Set(PV.LEDGER_ITEMS); Object.keys(r.ignorePay).forEach(k => { if (r.ignorePay[k] !== 0) iCols.add(k); });
        const iDiffs = []; iCols.forEach(col => { const ours = Math.round(r.ignorePay[col] || 0), led = Math.round((L.pay && L.pay[col]) || 0); if (ours !== led) iDiffs.push({ col, ours, led, diff: ours - led }); });
        ignore = { pay: r.ignorePay, total: r.ignoreTotal, diffs: iDiffs, notes: r.ignoreNotes || [], status: iDiffs.length ? 'bad' : 'ok' };
      }
      rows.push({ 사번: L.사번, 성명: L.성명 || r.성명, 소속: L.소속 || r.소속, status, diffs, ours: r.pay, led: L.pay || {}, notes, warn: r.warn, trace: r.trace, ourTotal: r.total, ledTotal: Math.round(L.총지급액 || 0), alt, alt2, ignore, dayShift: !!r.dayShift, hasSogeup: !!r.hasSogeup, sogeup: r.sogeup || null, prevChangeOrders: r.prevChangeOrders || null });
    });

    rows.sort((a, b) => (a.status === b.status ? 0 : a.status === 'bad' ? -1 : 1));
    if (badCnt) alerts.push({ level: 'bad', title: `불일치 ${badCnt}명`, desc: '계산값과 급여대장이 다른 인원입니다.' });
    if (!badCnt && rows.length) alerts.push({ level: 'ok', title: '전원 완전일치', desc: `${rows.length}명 전원 일치` });

    return { target: payroll.target, rows, alerts, summary: { total: rows.length, ok: okCnt, bad: badCnt } };
  };

  PV.LEDGER_ITEMS = LEDGER_ITEMS;
})(window.PV);
