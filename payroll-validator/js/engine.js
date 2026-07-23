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
  const SICK_EXCL = new Set(['성과가급', '변동역량가급1', '변동역량가급2', '고정역량가급']);
  const SUSPEND_EXCL = new Set(['변동역량가급1', '변동역량가급2', '고정역량가급']);

  // 성과가급 = 분기 지급(1·4·7·10월에 연액 ¼)
  const QUARTER_MONTHS = new Set([1, 4, 7, 10]);
  const monthlyBase = (srcK, annual, m) => srcK === '성과가급' ? (QUARTER_MONTHS.has(m) ? annual / 4 : 0) : annual / 12;

  // ---------- 유틸 ----------
  const ceilU = x => (Math.ceil((x - 1e-6) / 10) * 10) || 0;  // 십원 절상(급여)
  const floorU = x => (Math.floor((x + 1e-6) / 10) * 10) || 0; // 십원 절하(감액)
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

  // 출산휴가 무급기간 {start,end} (유급 60/75일 이후).
  // 출산전휴가/출산후휴가로 분리 입력돼 있어도 모든 날짜를 병합해 자동 계산.
  // (담당자 수동입력 override가 있으면 그걸 우선 사용)
  function maternityUnpaid(ctx, sabun) {
    const rows = (ctx.vacBy.get(sabun) || []).filter(v => /출산|유사산/.test(v.휴가종류));
    if (!rows.length) return null;
    const mo = ctx.overrides.maternity.get(sabun);
    let dates, limit;
    if (mo) {
      limit = mo.유형 === '다태아' ? 75 : 60;
      dates = [...dateRange(mo.전시작, mo.전종료), ...dateRange(mo.후시작, mo.후종료)].sort();
    } else {
      limit = rows.some(v => /다태아/.test(v.휴가종류)) ? 75 : 60;
      // 일자별 누적형·기간형 모두 지원: 각 행의 시작~종료를 펼쳐 중복 제거 후 병합
      const set = new Set();
      rows.forEach(v => {
        if (v.시작일 && v.종료일 && v.종료일 > v.시작일) dateRange(v.시작일, v.종료일).forEach(d => set.add(d));
        else if (v.시작일) set.add(v.시작일);
      });
      dates = [...set].sort();
    }
    const unpaid = dates.slice(limit);
    if (!unpaid.length) return null;
    return { start: unpaid[0], end: unpaid[unpaid.length - 1] };
  }

  // ---------- 월 세그먼트(일할) ----------
  function buildSegments(ctx, sabun, y, m, cutoffISO, block) {
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
      orders = orders.concat([
        { 발령구분: '출산휴가(무급)', 발령시작일: mu.start, _pt: 'unpaid', _pseudo: true },
        { 발령구분: '출산휴가 복귀', 발령시작일: addDay(mu.end), _pt: 'normal', _pseudo: true },
      ]);
    }
    // 같은 날 충돌 시 가짜(출산복귀) 이벤트를 앞에 두어 실제 발령이 이기도록 정렬
    orders = orders.slice().sort((a, b) => cmp(a.발령시작일 || '', b.발령시작일 || '') || ((a._pseudo ? 0 : 1) - (b._pseudo ? 0 : 1)));
    const PT = o => o._pt || payTypeOf(o.발령구분);
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

    const inMonth = orders.filter(o => o.발령시작일 && cmp(o.발령시작일, monthStart) >= 0 && cmp(o.발령시작일, cutoffISO) <= 0);
    const segs = [{ startDay: 1, payType: baseType, contract: baseContract, gubun: baseGubun }];
    for (const o of inMonth) {
      const pt = PT(o);
      // 복직=발령일 당일부터 정상 / 단축근로종료=발령일 다음날부터 정상
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
    // 같은 날 충돌 시 실제 발령이 가짜(출산휴가 복귀) 이벤트를 이긴다.
    // (출산 무급 종료 다음날 = 육아휴직 시작일이 겹치면, '정상복귀'가 육아휴직을 덮어쓰지 않도록)
    segs.forEach(s => {
      const last = merged[merged.length - 1];
      if (last && last.startDay === s.startDay) {
        if (!(s.pseudo && !last.pseudo)) merged[merged.length - 1] = s;
      } else merged.push(s);
    });
    merged.sort((a, b) => a.startDay - b.startDay);

    const n = merged.length, total = 30; let acc = 0;
    for (let i = 0; i < n; i++) {
      if (i < n - 1) { const span = merged[i + 1].startDay - merged[i].startDay; merged[i].days = span; acc += span; }
      else { let last = total - acc; const paid = ['normal', 'sick', 'short'].includes(merged[i].payType); if (last <= 0) last = paid ? 1 : 0; merged[i].days = last; }
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
  function computeBase(ctx, sabun, y, m, cutoff, block, exc, trace) {
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

    const seg = buildSegments(ctx, sabun, y, m, cutoffISO, block);
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

    LEDGER_ITEMS.forEach(k => pay[k] = ceilU(real[k]));

    // 무급휴가 공제: 감액 항목에 총액 마이너스(절하)
    // 1일 급여 = 연봉항목 ÷ 12 ÷ 30 (고정 일당). 성과가급도 분기지급과 무관하게 항상 연액/12 기준.
    const uvac = unpaidVacInMonth(ctx, sabun, y, m, exc);
    let uvacDeduct = 0;
    if (uvac > 0) {
      const ec = effContract(ctx, sabun, monthEnd);
      let fullGross = flat + (applied14 ? 500000 : 0);
      if (ec) for (const srcK of Object.keys(ITEMMAP)) fullGross += (ec.items[srcK] || 0) / 12;
      // 1일 급여를 십원 절하한 뒤 일수를 곱한다(대장 방식). (일당절하 × 일수)
      uvacDeduct = floorU(fullGross / 30) * uvac;
      pay['감액'] = (pay['감액'] || 0) - uvacDeduct;
    }

    const peakApplied = roster && (roster.피크적용 || '').includes('적용') && roster.피크예상일 && P(roster.피크예상일).m === m && y >= P(roster.피크예상일).y;
    if (trace) {
      const ec = effContract(ctx, sabun, monthEnd) || { items: {} };
      trace.연봉일자 = ec.연봉일자; trace.연봉 = Object.assign({}, ec.items);
      trace.month = m; trace.quarterMonth = QUARTER_MONTHS.has(m);
      trace.segments = seg.segments.map(s => ({ label: s.gubun || PT_LABEL[s.payType], days: s.days, payType: s.payType }));
      trace.ilhal = seg.segments.length > 1 || (seg.segments[0] && seg.segments[0].payType !== 'normal');
      trace.dutyLabel = dutyBase ? (roster && roster.직책 || '') : (dutyExt ? '본점 예외' : '');
      trace.dutyFlat = flat; trace.is14 = applied14; trace.uvac = uvac; trace.uvacDeduct = uvacDeduct; trace.peakApplied = peakApplied;
      trace.발령 = (ctx.ordersBy.get(sabun) || []).map(o => ({ 구분: o.발령구분, 시작일: o.발령시작일, 퇴직일: o.퇴직일 || '' }));
      trace.휴가 = (ctx.vacBy.get(sabun) || []).map(v => ({ 종류: v.휴가종류, 시작일: v.시작일, 종료일: v.종료일, 일수: v.휴가일수 }));
    }
    return { retired: false, pay, paidUnits, is14: applied14, segments: seg.segments, uvac, peakApplied };
  }

  // 누적 소급: 전월 이전의 (실제−기지급) 차액을 급여 나오는 달에 정산.
  // 무급기간엔 이월되어 복직/급여발생 달에 반영(음수 급여 방지).
  function carryIn(ctx, sabun, y, m) {
    const acc = {}; LEDGER_ITEMS.forEach(k => acc[k] = 0);
    for (let back = 12; back >= 1; back--) {
      const mm = addMonth(y, m, -back);
      const ap = computeBase(ctx, sabun, mm.y, mm.m, 'pay', [], null);
      const ac = computeBase(ctx, sabun, mm.y, mm.m, 'actual', [], null);
      if (ap.retired || ac.retired) continue;
      const paid = LEDGER_ITEMS.reduce((a, k) => a + (ap.pay[k] || 0), 0) > 0;
      if (paid) LEDGER_ITEMS.forEach(k => acc[k] = 0);
      LEDGER_ITEMS.forEach(k => acc[k] += (ac.pay[k] || 0) - (ap.pay[k] || 0));
    }
    return acc;
  }

  // ---------- 한 사람 종합 ----------
  function computePerson(ctx, sabun, y, m) {
    const exc = [];
    const trace = { extras: [] };
    // 당월 지급액 = 지급일(as-paid) 기준. 지급일 이후 변동은 다음달 소급.
    const base = computeBase(ctx, sabun, y, m, 'pay', [], exc, trace);
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

    // 징계
    ctx.discipline.filter(d => d.사번 === sabun).forEach(d => {
      if ((d.종류 || '').includes('감봉')) {
        const amt = Math.abs(num(d.금액));
        pay['감액'] = (pay['감액'] || 0) - amt;
        notes.push('감봉 감액 ' + amt.toLocaleString());
        trace.extras.push({ label: '감봉(감액)', amount: -amt });
      } else if ((d.종류 || '').includes('정직')) {
        LEDGER_ITEMS.forEach(k => { if (k === '감액') return; if (SUSPEND_EXCL.has(k)) pay[k] = 0; else pay[k] = ceilU(pay[k] * 0.5); });
        notes.push('정직 50% (역량가급 제외)');
        trace.extras.push({ label: '정직 50% (역량가급·고정역량가급 제외)', amount: null });
      }
    });

    // 누적 소급정산: 급여 나오는 달에 반영
    const paidThisMonth = LEDGER_ITEMS.reduce((a, k) => a + (base.pay[k] || 0), 0) > 0;
    if (paidThisMonth) {
      const carry = carryIn(ctx, sabun, y, m);
      let s = 0; LEDGER_ITEMS.forEach(k => { pay[k] += carry[k]; s += carry[k]; });
      if (s !== 0) { notes.push(`소급정산 ${s >= 0 ? '+' : ''}${s.toLocaleString()}`); trace.extras.push({ label: '소급정산 (전월 이전 지급일 이후 변동 정산)', amount: s }); }
    }

    const segNote = base.segments && (base.segments.length > 1 || (base.segments[0] && base.segments[0].payType !== 'normal'));
    if (segNote) notes.unshift('일할 · ' + base.segments.map(s => `${s.gubun || PT_LABEL[s.payType]} ${s.days}일`).join(' → '));
    if (base.uvac > 0) notes.push(`전월 무급휴가 ${base.uvac}일 공제`);
    if (base.peakApplied) notes.push('임금피크 해당월');
    trace.finalPay = Object.assign({}, pay);

    return { retired: false, pay, notes, exc, paidUnits: base.paidUnits, segments: base.segments, trace };
  }

  // ---------- 급여계산 (급여대장 불필요) ----------
  PV.computePayroll = function (store, target) {
    const ctx = PV.buildContext(store);
    const { y, m } = target;
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
        rows.push({
          사번: id, 성명: (roster && roster.성명) || sal.성명 || '', 소속: (roster && roster.소속) || sal.소속 || '',
          pay: r.pay, notes: r.notes || [], warn: (r.exc || []).length > 0, trace: r.trace,
          total: Math.round(Object.values(r.pay).reduce((a, b) => a + b, 0)),
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
    const seen = new Set();
    allExc.forEach(e => { const k = e.사번 + e.title; if (seen.has(k)) return; seen.add(k); alerts.push({ level: e.type || 'warn', title: `${e.title} — ${e.사번} ${e.성명 || ''}`, desc: e.desc, 사번: e.사번, 성명: e.성명, kind: e.kind }); });

    return {
      target, blocked, block, payday: payday(y, m, ctx.holidays),
      rows, alerts,
      summary: { total: rows.length, block: block.length, warn: rows.filter(r => r.warn).length, ilhal, special: cnt14 + retroP.length },
    };
  };

  // ---------- 검증 (계산 vs 급여대장) ----------
  PV.compareLedger = function (payroll, store) {
    const ledger = (store.ledger || []).filter(r => (r.지급유형 || '').trim() === '급여');
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
      rows.push({ 사번: L.사번, 성명: L.성명 || r.성명, 소속: L.소속 || r.소속, status, diffs, ours: r.pay, led: L.pay || {}, notes, warn: r.warn, trace: r.trace, ourTotal: r.total, ledTotal: Math.round(L.총지급액 || 0) });
    });

    rows.sort((a, b) => (a.status === b.status ? 0 : a.status === 'bad' ? -1 : 1));
    if (badCnt) alerts.push({ level: 'bad', title: `불일치 ${badCnt}명`, desc: '계산값과 급여대장이 다른 인원입니다.' });
    if (!badCnt && rows.length) alerts.push({ level: 'ok', title: '전원 완전일치', desc: `${rows.length}명 전원 일치` });

    return { target: payroll.target, rows, alerts, summary: { total: rows.length, ok: okCnt, bad: badCnt } };
  };

  PV.LEDGER_ITEMS = LEDGER_ITEMS;
})(window.PV);
