/* ============================================================
   engine.js — 급여 계산 엔진 (세전)
   스펙: payroll_spec 기준
   - 항목별 ÷12 절상 / 일할 30일 모델(앞구간 실제·마지막=30−앞, 유급 최소1)
   - 임금피크·육아기단축 연봉누락 차단
   - 발령(퇴직/휴직/복직/단축/직무변경) 변수
   - 휴가 무급공제(결재완료), 출산 유급60·무급 누적
   - 직책수당(고정역량가급) / 14명 특례 / 징계 / 20일 소급
   ============================================================ */
window.PV = window.PV || {};
(function (PV) {
  'use strict';
  const { num, txt } = PV;

  // 연봉 항목 → 급여대장 컬럼 매핑
  const ITEMMAP = {
    기본급: '기본급', 실적급: '능력급', 성과급: '성과급', 성과가급: '성과가급',
    변동역량1: '변동역량가급1', 변동역량2: '변동역량가급2',
  };
  const LEDGER_ITEMS = ['기본급', '능력급', '성과급', '성과가급', '변동역량가급1', '변동역량가급2', '고정역량가급', '감액'];
  // 의병휴직 지급대상 제외(=0) 항목
  const SICK_EXCL = new Set(['성과가급', '변동역량가급1', '변동역량가급2', '고정역량가급']);
  // 정직 제외(=역량가급류) 항목
  const SUSPEND_EXCL = new Set(['변동역량가급1', '변동역량가급2', '고정역량가급']);

  const UNPAID_LEAVE = ['육아휴직', '무급휴직', '가족돌봄휴직', '난임휴직'];
  const FULLY_UNPAID_VAC = ['가족돌봄휴가', '보건(생리)휴가(무급)', '무급휴가'];

  // ---------- 날짜 유틸 ----------
  const P = s => { if (!s) return null; const [y, m, d] = s.split('-').map(Number); return { y, m, d }; };
  const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const dim = (y, m) => new Date(y, m, 0).getDate();          // 실제 달력 일수
  const dow = (y, m, d) => new Date(y, m - 1, d).getDay();     // 0=일 6=토
  const cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0;           // ISO 문자열 비교
  function prevMonth(y, m) { return m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 }; }
  function addMonth(y, m, n) { let t = y * 12 + (m - 1) + n; return { y: Math.floor(t / 12), m: (t % 12) + 1 }; }
  PV.dim = dim;

  // 실제 지급일 = 20일, 공휴일/주말이면 앞선 근무일
  function payday(y, m, holidays) {
    let d = 20;
    while (d >= 1) {
      const wd = dow(y, m, d), s = iso(y, m, d);
      if (wd !== 0 && wd !== 6 && !holidays.has(s)) return s;
      d--;
    }
    return iso(y, m, 20);
  }
  PV.payday = payday;

  // ---------- 컨텍스트 빌드 ----------
  PV.buildContext = function (store) {
    const byId = (arr, key) => { const m = new Map(); (arr || []).forEach(r => { const k = r[key]; if (!m.has(k)) m.set(k, []); m.get(k).push(r); }); return m; };
    const salaryBy = byId(store.salary, '사번');
    salaryBy.forEach(list => list.sort((a, b) => cmp(a.연봉일자 || '', b.연봉일자 || '')));
    const ordersBy = byId(store.order, '사번');
    ordersBy.forEach(list => list.sort((a, b) => cmp(a.발령시작일 || '', b.발령시작일 || '')));
    const vacBy = byId((store.vacation || []).filter(v => v.결재 === '결재완료'), '사번');
    const rosterBy = new Map(); (store.roster || []).forEach(r => rosterBy.set(r.사번, r));
    const holidays = new Set(store.holiday || []);
    return {
      salaryBy, ordersBy, vacBy, rosterBy, holidays,
      uploads: store.uploads || { annual: new Map(), prod: new Map(), etc: new Map() },
      discipline: store.discipline || [],
      carry: store.carry || new Map(),
      ledgerBy: (() => { const m = new Map(); (store.ledger || []).forEach(r => { if (!m.has(r.사번)) m.set(r.사번, []); m.get(r.사번).push(r); }); return m; })(),
    };
  };

  // 특정일 유효 연봉계약(연봉일자 ≤ date 중 최신), 없으면 최초
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
    return 'normal'; // 직무변경 등
  }

  // 직책수당(고정역량가급) 월 고정액
  function dutyAllowance(roster) {
    if (!roster) return 0;
    const 직책 = roster.직책 || '', 직급 = roster.직급 || '';
    if (직책.includes('센터장')) return 100000;
    if (직책.includes('부서장')) return 1500000;
    if (직책.includes('본부장')) {
      if (직급 === 'L') return 2000000;
      if (직급.includes('이사')) return 0;
      return 0;
    }
    return 0;
  }

  // 14명 특례 대상 여부 (직무변경 26-07-01 · JA · 소액전담→대물보상, 상태 유지)
  function is14(ctx, sabun, monthEnd) {
    const orders = (ctx.ordersBy.get(sabun) || []).filter(o => o.발령시작일 && cmp(o.발령시작일, monthEnd) <= 0);
    // 가장 최근 직무변경
    const jobChanges = orders.filter(o => (o.발령구분 || '').includes('직무변경'));
    if (!jobChanges.length) return false;
    const last = jobChanges[jobChanges.length - 1];
    const jaOK = (last.후직급 || last.현재직급 || '').toUpperCase().startsWith('JA');
    const target = last.발령시작일 === '2026-07-01' && last.전직무.includes('소액전담') && last.후직무.includes('대물보상');
    if (!(target && jaOK)) return false;
    // 이후 대물보상에서 벗어나는 직무변경이 없어야 함(상태 유지)
    return last.후직무.includes('대물보상');
  }

  // ---------- 월 세그먼트(일할) 구성 ----------
  function buildSegments(ctx, sabun, y, m, cutoffISO, block) {
    const monthStart = iso(y, m, 1), monthEnd = iso(y, m, dim(y, m));
    const orders = ctx.ordersBy.get(sabun) || [];
    // baseline payType (월초 시점)
    const prior = orders.filter(o => o.발령시작일 && cmp(o.발령시작일, monthStart) < 0);
    let baseType = 'normal', baseGubun = '';
    if (prior.length) { baseGubun = prior[prior.length - 1].발령구분; baseType = payTypeOf(baseGubun); }
    else {
      const roster = ctx.rosterBy.get(sabun);
      if (roster && (roster.직무 || '').includes('(휴직)')) {
        const c = ctx.carry.get(sabun);
        if (c && c.종류) baseType = c.종류.includes('의병') ? 'sick' : 'unpaid';
        else baseType = 'unpaid';
      }
    }
    if (baseType === 'retire') return { retired: true };
    // baseline 계약
    let baseContract = effContract(ctx, sabun, monthStart);

    // 월중 발령(컷오프 이내)
    const inMonth = orders.filter(o => o.발령시작일 && cmp(o.발령시작일, monthStart) >= 0 && cmp(o.발령시작일, cutoffISO) <= 0);
    // 세그먼트 경계
    const segs = [{ startDay: 1, payType: baseType, contract: baseContract, gubun: baseGubun }];
    for (const o of inMonth) {
      const pt = payTypeOf(o.발령구분);
      if (pt === 'retire') { return { retired: true }; }
      let contract;
      if (pt === 'short') {
        contract = contractExactOn(ctx, sabun, o.발령시작일);
        if (!contract && block) block.push({ 사번: sabun, reason: '육아기단축 연봉 미입력', 일자: o.발령시작일 });
        contract = contract || effContract(ctx, sabun, o.발령시작일);
      } else {
        contract = effContract(ctx, sabun, o.발령시작일);
      }
      segs.push({ startDay: P(o.발령시작일).d, payType: pt, contract, gubun: o.발령구분 });
    }
    // 같은 날 중복 발령 → 마지막 우선
    const merged = [];
    segs.forEach(s => { const last = merged[merged.length - 1]; if (last && last.startDay === s.startDay) merged[merged.length - 1] = s; else merged.push(s); });
    merged.sort((a, b) => a.startDay - b.startDay);

    // 일수 계산: 앞 구간 실제일수, 마지막 = 30 − 앞합 (유급 최소1)
    const n = merged.length, total = 30;
    let acc = 0;
    for (let i = 0; i < n; i++) {
      if (i < n - 1) {
        const span = merged[i + 1].startDay - merged[i].startDay; // 실제 달력 일수
        merged[i].days = span; acc += span;
      } else {
        let last = total - acc;
        const paid = merged[i].payType === 'normal' || merged[i].payType === 'sick' || merged[i].payType === 'short';
        if (last <= 0) last = paid ? 1 : 0;
        merged[i].days = last;
      }
    }
    return { segments: merged, retired: false, monthEnd };
  }

  // 무급휴가/출산 무급일수(대상월)
  function unpaidVacInMonth(ctx, sabun, y, m, exc) {
    const rows = ctx.vacBy.get(sabun) || [];
    const ym = `${y}-${String(m).padStart(2, '0')}`;
    let days = 0;
    // 완전 무급
    rows.forEach(v => {
      if (FULLY_UNPAID_VAC.includes(v.휴가종류) && (v.시작일 || '').startsWith(ym)) days += (v.휴가일수 || 1);
    });
    // 출산 계열
    const mat = rows.filter(v => /출산|유사산/.test(v.휴가종류));
    if (mat.length) {
      const hasSplit = mat.some(v => /출산전휴가|출산후휴가/.test(v.휴가종류));
      if (hasSplit) {
        exc && exc.push({ 사번: sabun, type: 'warn', title: '출산휴가 분리행 — 담당자 확인', desc: '출산전/출산후가 분리 입력되어 자동 유급·무급 판정을 보류했습니다. 수동 확인이 필요합니다.' });
      } else {
        // 누적 유급한도
        const 다태아 = mat.some(v => v.휴가종류.includes('다태아'));
        const 유사산 = mat.some(v => v.휴가종류.includes('유사산'));
        const limit = 다태아 ? 75 : (유사산 ? 60 : 60);
        const dates = mat.filter(v => v.시작일).map(v => v.시작일).sort();
        dates.forEach((dt, idx) => { if (idx >= limit && dt.startsWith(ym)) days += 1; });
      }
    }
    return days;
  }

  // ---------- 한 사람·한 달 base 계산 ----------
  // cutoff: 'actual'|'pay'
  function computeBase(ctx, sabun, y, m, cutoff, block, exc) {
    const monthEnd = iso(y, m, dim(y, m));
    const cutoffISO = cutoff === 'pay' ? payday(y, m, ctx.holidays) : monthEnd;
    const roster = ctx.rosterBy.get(sabun);

    // 임금피크 차단검증 (해당월=피크월, 정확히 연도-피크월-01 계약 필요)
    if (roster && (roster.피크적용 || '').includes('적용') && roster.피크예상일) {
      const pk = P(roster.피크예상일);
      if (pk && pk.m === m && y >= pk.y) {
        const need = iso(y, m, 1);
        if (!contractExactOn(ctx, sabun, need) && block) block.push({ 사번: sabun, reason: '임금피크 연봉 미입력', 일자: need });
      }
    }

    const seg = buildSegments(ctx, sabun, y, m, cutoffISO, block);
    if (seg.retired) return { retired: true };

    const pay = {}; LEDGER_ITEMS.forEach(k => pay[k] = 0);
    let paidUnits = 0; // 유급 근로단위(normal+short) − 무급휴가 (직책/특례 프로레이션용)

    // 세그먼트별 항목 누적 (실수 누적 후 마지막 절상)
    const real = {}; LEDGER_ITEMS.forEach(k => real[k] = 0);
    seg.segments.forEach(s => {
      const c = s.contract; if (!c) return;
      const days = s.days || 0;
      // 기본 6항목
      for (const [srcK, colK] of Object.entries(ITEMMAP)) {
        const annual = c.items[srcK] || 0;
        let rate = 0;
        if (s.payType === 'normal' || s.payType === 'short') rate = 1;
        else if (s.payType === 'sick') rate = SICK_EXCL.has(colK) ? 0 : 0.8;
        else rate = 0; // unpaid
        real[colK] += (annual / 12 / 30) * days * rate;
      }
      if (s.payType === 'normal' || s.payType === 'short') paidUnits += days;
    });

    // 무급휴가 공제 (현재 유효계약 기준 일당)
    const uvac = unpaidVacInMonth(ctx, sabun, y, m, exc);
    if (uvac > 0) {
      const c = effContract(ctx, sabun, monthEnd);
      if (c) for (const [srcK, colK] of Object.entries(ITEMMAP)) real[colK] -= (c.items[srcK] || 0) / 12 / 30 * uvac;
      paidUnits -= uvac;
    }
    if (paidUnits < 0) paidUnits = 0;

    // 직책수당(고정역량가급): 월고정 flat, 유급근로단위로 프로레이션
    const flat = dutyAllowance(roster);
    if (flat > 0) real['고정역량가급'] += flat / 30 * paidUnits;

    // 14명 특례: 변동역량가급1 +500,000 (프로레이션)
    const applied14 = is14(ctx, sabun, monthEnd);
    if (applied14) real['변동역량가급1'] += 500000 / 30 * paidUnits;

    // 항목별 마지막 절상
    LEDGER_ITEMS.forEach(k => pay[k] = Math.ceil(real[k] - 1e-6));

    return { retired: false, pay, paidUnits, is14: applied14, segments: seg.segments, uvac, peakApplied: (roster && (roster.피크적용 || '').includes('적용') && roster.피크예상일 && P(roster.피크예상일).m === m && y >= P(roster.피크예상일).y) };
  }
  const PT_LABEL = { normal: '정상근무', unpaid: '무급휴직', sick: '의병휴직(80%)', short: '육아기단축' };

  // 소급용: 항목 diff (actual − aspaid) for month
  function monthDiff(ctx, sabun, y, m, block) {
    const a = computeBase(ctx, sabun, y, m, 'actual', block, null);
    const p = computeBase(ctx, sabun, y, m, 'pay', [], null);
    if (a.retired || p.retired) return null;
    const d = {}; LEDGER_ITEMS.forEach(k => d[k] = (a.pay[k] || 0) - (p.pay[k] || 0));
    let has = LEDGER_ITEMS.some(k => d[k] !== 0);
    return has ? d : null;
  }

  // 복직월 여부 & 육아휴직 시작월 탐색
  function returnInfo(ctx, sabun, y, m) {
    const monthStart = iso(y, m, 1), monthEnd = iso(y, m, dim(y, m));
    const orders = ctx.ordersBy.get(sabun) || [];
    const back = orders.find(o => (o.발령구분 || '').includes('복직') && o.발령시작일 >= monthStart && o.발령시작일 <= monthEnd);
    if (!back) return null;
    // 직전 (무급)휴직 시작 발령
    const leaves = orders.filter(o => payTypeOf(o.발령구분) === 'unpaid' && o.발령시작일 < back.발령시작일);
    const leave = leaves.length ? leaves[leaves.length - 1] : null;
    return { back, leave };
  }

  // ---------- 최종: 한 사람 종합 ----------
  function computePerson(ctx, sabun, y, m, block) {
    const exc = [];
    const base = computeBase(ctx, sabun, y, m, 'actual', block, exc);
    if (base.retired) return { retired: true };
    const pay = Object.assign({}, base.pay);
    const notes = [];
    if (base.is14) notes.push('14명특례 +50만(변동역량가급1)');

    // 이월휴직 종류 미입력 경고
    const roster = ctx.rosterBy.get(sabun);
    const orders = ctx.ordersBy.get(sabun) || [];
    if (roster && (roster.직무 || '').includes('(휴직)') && !orders.some(o => payTypeOf(o.발령구분) === 'unpaid' || payTypeOf(o.발령구분) === 'sick')) {
      if (!ctx.carry.get(sabun) || !ctx.carry.get(sabun).종류) exc.push({ 사번: sabun, type: 'warn', title: '이월 휴직 종류 확인 필요', desc: '명부상 (휴직) 상태이나 종류 미입력 → 무급으로 계산했습니다.' });
    }

    // 업로드 변동항목
    if (m === 1 && ctx.uploads.annual.has(sabun)) pay['연차수당'] = (pay['연차수당'] || 0) + num(ctx.uploads.annual.get(sabun));
    if (ctx.uploads.prod.has(sabun)) pay['생산성향상격려금'] = (pay['생산성향상격려금'] || 0) + num(ctx.uploads.prod.get(sabun));
    if (ctx.uploads.etc.has(sabun)) ctx.uploads.etc.get(sabun).forEach(e => { if (e.구분) pay[e.구분] = (pay[e.구분] || 0) + num(e.금액); });

    // 징계
    ctx.discipline.filter(d => d.사번 === sabun).forEach(d => {
      if ((d.종류 || '').includes('감봉')) {
        pay['감액'] = (pay['감액'] || 0) - Math.abs(num(d.금액));
        notes.push('감봉 감액 ' + Math.abs(num(d.금액)).toLocaleString());
      } else if ((d.종류 || '').includes('정직')) {
        // (급여 − 변동1 − 변동2 − 고정역량) × 50%
        LEDGER_ITEMS.forEach(k => { if (k === '감액') return; if (SUSPEND_EXCL.has(k)) pay[k] = 0; else pay[k] = Math.ceil(pay[k] * 0.5 - 1e-6); });
        notes.push('정직 50% (역량가급 제외)');
      }
    });

    // 20일 소급 — 전월 (actual − aspaid), 이번달 유급 있으면 반영
    const pm = prevMonth(y, m);
    const d1 = monthDiff(ctx, sabun, pm.y, pm.m, block);
    if (d1 && base.paidUnits > 0) {
      let s = 0; LEDGER_ITEMS.forEach(k => { if (k === '감액') { pay[k] += d1[k]; } else { pay[k] += d1[k]; } s += d1[k]; });
      notes.push(`전월 소급 ${s >= 0 ? '+' : ''}${s.toLocaleString()}`);
    }
    // 복직월 육아휴직 초과분 일괄공제
    const ri = returnInfo(ctx, sabun, y, m);
    if (ri && ri.leave) {
      const lm = P(ri.leave.발령시작일);
      const dl = monthDiff(ctx, sabun, lm.y, lm.m, block); // actual−aspaid (음수=과지급)
      if (dl) {
        let s = 0; LEDGER_ITEMS.forEach(k => { pay[k] += dl[k]; s += dl[k]; });
        if (s !== 0) notes.push(`복직 정산(육아휴직 과지급 회수) ${s.toLocaleString()}`);
      }
    }

    // 비고(특이사항) 구성
    const segNote = base.segments && (base.segments.length > 1 || (base.segments[0] && base.segments[0].payType !== 'normal'));
    if (segNote) notes.unshift('일할 · ' + base.segments.map(s => `${s.gubun || PT_LABEL[s.payType]} ${s.days}일`).join(' → '));
    if (base.uvac > 0) notes.push(`무급휴가 ${base.uvac}일 공제`);
    if (base.peakApplied) notes.push('임금피크 해당월');

    return { retired: false, pay, notes, exc, paidUnits: base.paidUnits, segments: base.segments };
  }

  // ---------- 급여계산 (급여대장 불필요) ----------
  // 대상 = 연봉내역 보유 전 직원(퇴직 제외)
  PV.computePayroll = function (store, target) {
    const ctx = PV.buildContext(store);
    const { y, m } = target;
    const block = [];
    // 대상자 수집
    const ids = new Set([...ctx.salaryBy.keys()]);
    // 차단검증 전수
    ids.forEach(id => computeBase(ctx, id, y, m, 'actual', block, null));
    const blocked = block.length > 0;

    const rows = [], alerts = [], allExc = [];
    if (!blocked) {
      ids.forEach(id => {
        const r = computePerson(ctx, id, y, m, []);
        if (r.retired) return;
        const roster = ctx.rosterBy.get(id);
        const sal = (ctx.salaryBy.get(id) || []).slice(-1)[0] || {};
        (r.exc || []).forEach(e => allExc.push(e));
        rows.push({
          사번: id, 성명: (roster && roster.성명) || sal.성명 || '', 소속: (roster && roster.소속) || sal.소속 || '',
          pay: r.pay, notes: r.notes || [], warn: (r.exc || []).length > 0,
          total: Math.round(Object.values(r.pay).reduce((a, b) => a + b, 0)),
        });
      });
      rows.sort((a, b) => (a.소속 || '').localeCompare(b.소속 || '') || a.사번.localeCompare(b.사번));
    }

    // 알림
    if (blocked) alerts.push({ level: 'block', title: `연봉 미입력 — 전체 계산 차단 (${block.length}건)`, desc: block.map(b => `${b.사번}(${b.reason} ${b.일자})`).join(', ') + ' · 인사시스템에 연봉 입력 후 재실행하세요.' });
    const cnt14 = rows.filter(r => (r.notes || []).some(n => n.includes('14명특례'))).length;
    if (cnt14) alerts.push({ level: 'info', title: `직무변경 특례 ${cnt14}명`, desc: 'JA·소액전담→대물보상(26-07-01) 변동역량가급1 +월 50만원' });
    const retroP = rows.filter(r => (r.notes || []).some(n => n.includes('소급') || n.includes('복직 정산')));
    if (retroP.length) alerts.push({ level: 'info', title: `소급정산 반영 ${retroP.length}명`, desc: retroP.map(r => r.성명 || r.사번).join(', ') });
    const ilhal = rows.filter(r => (r.notes || []).some(n => n.startsWith('일할'))).length;
    if (ilhal) alerts.push({ level: 'info', title: `일할계산 ${ilhal}명`, desc: '휴직·복직·단축 등으로 일할 적용된 인원' });
    const seen = new Set();
    allExc.forEach(e => { const k = e.사번 + e.title; if (seen.has(k)) return; seen.add(k); alerts.push({ level: e.type || 'warn', title: `${e.title} — ${e.사번}`, desc: e.desc }); });

    return {
      target, blocked, block, payday: payday(y, m, ctx.holidays),
      rows, alerts,
      summary: { total: rows.length, block: block.length, warn: rows.filter(r => r.warn).length, ilhal, special: cnt14 + retroP.length },
    };
  };

  // ---------- 검증 (계산결과 vs 급여대장) ----------
  PV.compareLedger = function (payroll, store) {
    const ledger = (store.ledger || []).filter(r => (r.지급유형 || '').includes('급여') && !(r.지급유형 || '').includes('퇴직'));
    const byId = new Map(); payroll.rows.forEach(r => byId.set(r.사번, r));
    const rows = [], alerts = [];
    let okCnt = 0, badCnt = 0;
    const ledgerIds = new Set();

    ledger.forEach(L => {
      ledgerIds.add(L.사번);
      const r = byId.get(L.사번);
      if (!r) {
        rows.push({ 사번: L.사번, 성명: L.성명, 소속: L.소속, status: 'bad', diffs: [{ col: '—', ours: 0, led: Math.round(L.총지급액 || 0), diff: -Math.round(L.총지급액 || 0) }], ours: {}, led: L.pay || {}, notes: ['계산 대상에 없음(연봉/재직 확인)'], warn: true, ourTotal: 0, ledTotal: Math.round(L.총지급액 || 0) });
        badCnt++; return;
      }
      const ourCols = new Set(PV.LEDGER_ITEMS);
      Object.keys(r.pay).forEach(k => { if (r.pay[k] !== 0) ourCols.add(k); });
      const diffs = [];
      ourCols.forEach(col => {
        const ours = Math.round(r.pay[col] || 0), led = Math.round((L.pay && L.pay[col]) || 0);
        if (ours !== led) diffs.push({ col, ours, led, diff: ours - led });
      });
      const status = diffs.length ? 'bad' : 'ok';
      status === 'ok' ? okCnt++ : badCnt++;
      const notes = (r.notes || []).slice();
      if (diffs.length) notes.unshift('불일치: ' + diffs.map(d => d.col).join(', '));
      rows.push({
        사번: L.사번, 성명: L.성명 || r.성명, 소속: L.소속 || r.소속, status, diffs,
        ours: r.pay, led: L.pay || {}, notes, warn: r.warn,
        ourTotal: r.total, ledTotal: Math.round(L.총지급액 || 0),
      });
    });
    // 계산엔 있으나 대장에 없는 사람
    payroll.rows.forEach(r => { if (!ledgerIds.has(r.사번)) { /* 대장 미포함(참고) */ } });

    rows.sort((a, b) => (a.status === b.status ? 0 : a.status === 'bad' ? -1 : 1));
    if (badCnt) alerts.push({ level: 'bad', title: `불일치 ${badCnt}명`, desc: '계산값과 급여대장이 다른 인원입니다.' });
    if (!badCnt && rows.length) alerts.push({ level: 'ok', title: '전원 완전일치', desc: `${rows.length}명 전원 일치` });

    return { target: payroll.target, rows, alerts, summary: { total: rows.length, ok: okCnt, bad: badCnt } };
  };

  PV.LEDGER_ITEMS = LEDGER_ITEMS;
})(window.PV);
