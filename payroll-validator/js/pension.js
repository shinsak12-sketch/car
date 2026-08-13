/* ============================================================
   pension.js — 퇴직급여(퇴직연금) 계산 엔진  ※ 급여 로직과 독립
   - 평균임금: 연봉내역 기반 월액, 부분월 일할, 성과가급 12분할, 연차수당 3/12
   - 재직연수 계수: 일수법(÷365) vs 월력법(총개월÷12) 중 MAX, 4자리 절삭
   - 세전 퇴직급여 = 30일분 평균임금 × 계수 (원단위 절상)
   - 퇴직소득세: 근속연수공제·환산급여공제·기본세율 → 세후 실지급액
   기준값(공제표·세율표 등)은 config.js(PV.CONFIG)에서 읽음.
   ============================================================ */
window.PV = window.PV || {};
(function (PV) {
  'use strict';
  const C = () => PV.CONFIG || PV.CONFIG_DEFAULT || {};

  // ---------- 날짜 유틸 ----------
  const P = s => { const [y, m, d] = String(s).split('-').map(Number); return { y, m, d }; };
  const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const dim = (y, m) => new Date(y, m, 0).getDate();                 // 그 달 총일수 (m=0 → 전년 12월)
  const serial = s => { const { y, m, d } = P(s); return Math.floor(Date.UTC(y, m - 1, d) / 86400000); };
  const addDays = (s, n) => { const t = new Date((serial(s) + n) * 86400000); return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()); };
  const daysInc = (a, b) => serial(b) - serial(a) + 1;               // 포함 일수
  const cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0;

  // 포함구간 [s..e]의 달력차 → {Y,M,D}
  function ymd(s, e) {
    const a = P(s), b = P(addDays(e, 1));   // 끝일 포함 → exclusive end = e+1
    let Y = b.y - a.y, M = b.m - a.m, D = b.d - a.d;
    if (D < 0) { M -= 1; D += dim(b.y, b.m - 1); }
    if (M < 0) { Y -= 1; M += 12; }
    return { Y, M, D };
  }
  // 짤짤이 일수 → 개월(퇴직월부터 실제 달력일수로 역산, 초과 순간 올림)
  function daysToMonths(D, retY, retM) {
    if (D <= 0) return 0;
    let cum = 0, cnt = 0, y = retY, m = retM;
    while (cum < D) { cum += dim(y, m); cnt++; m--; if (m < 1) { m = 12; y--; } }
    return cnt;
  }
  const truncate4 = x => Math.floor(x * 10000) / 10000;
  const ceilWon = x => Math.ceil(x - 1e-6);
  const ceilU = x => (Math.ceil((x - 1e-6) / 10) * 10) || 0;   // 십원 절상(급여검증 엔진과 동일)
  const floorWon = x => Math.floor(x + 1e-6);
  const floorU = x => (Math.floor((x + 1e-6) / 10) * 10) || 0; // 십원 절사(세액 단수처리)

  // ---------- 산입구간(제외기간 반영) ----------
  // 입력: 기산일~퇴직일에서 제외기간 빼고 남은 연속구간들 [{s,e}]
  function countedSegments(startISO, endISO, excludes) {
    let segs = [{ s: startISO, e: endISO }];
    (excludes || []).filter(x => x && x.시작 && x.종료).sort((a, b) => cmp(a.시작, b.시작)).forEach(ex => {
      const out = [];
      segs.forEach(seg => {
        if (cmp(ex.종료, seg.s) < 0 || cmp(ex.시작, seg.e) > 0) { out.push(seg); return; }  // 겹침 없음
        if (cmp(seg.s, ex.시작) < 0) out.push({ s: seg.s, e: addDays(ex.시작, -1) });         // 앞 조각
        if (cmp(seg.e, ex.종료) > 0) out.push({ s: addDays(ex.종료, 1), e: seg.e });          // 뒤 조각
      });
      segs = out;
    });
    return segs.filter(s => cmp(s.s, s.e) <= 0);
  }

  // ---------- 재직연수 계수 ----------
  function serviceFactor(입사일, 퇴직일, 제외, 중간정산일) {
    const 기산일 = 중간정산일 ? addDays(중간정산일, 1) : 입사일;
    const segs = countedSegments(기산일, 퇴직일, 제외);
    // 일수법 — 계수는 full 정밀도 사용(표기만 4자리 절삭)
    const 산입일수 = segs.reduce((a, s) => a + daysInc(s.s, s.e), 0);
    const 일수계수 = 산입일수 / 365;
    // 월력법
    const ret = P(퇴직일);
    let SY = 0, SM = 0, SD = 0;
    const segYmd = segs.map(s => { const r = ymd(s.s, s.e); SY += r.Y; SM += r.M; SD += r.D; return { seg: s, ...r }; });
    const 역산개월 = daysToMonths(SD, ret.y, ret.m);
    const 총개월 = SY * 12 + SM + 역산개월;
    const 월력계수 = 총개월 / 12;
    const 채택 = Math.max(일수계수, 월력계수);   // full 정밀도 — 퇴직급여 계산에 그대로 사용
    return {
      기산일, segs, segYmd, 산입일수, 일수계수,
      합_Y: SY, 합_M: SM, 합_D: SD, 역산개월, 총개월, 월력계수,
      계수: 채택, method: 월력계수 >= 일수계수 ? '월력법' : '일수법',
    };
  }

  // ---------- 연봉계약 해석 ----------
  // salaryList: [{연봉일자, 기본급, 성과급, 성과가급, 변동역량1, 변동역량2}] (정렬 무관)
  function contractOn(salaryList, dateISO) {
    const eff = (salaryList || []).filter(r => r.연봉일자 && cmp(r.연봉일자, dateISO) <= 0).sort((a, b) => cmp(a.연봉일자, b.연봉일자));
    return eff.length ? eff[eff.length - 1] : ((salaryList || []).slice().sort((a, b) => cmp(a.연봉일자 || '', b.연봉일자 || ''))[0] || null);
  }

  // ---------- 직전 3개월 임금총액 (표1/표2) ----------
  // endISO = 평균임금 산정 종료일(정상급여 마지막일, 기본=퇴직일)
  function wageWindow(salaryList, endISO, 고정역량월) {
    const startISO = addDays(addMonths(endISO, -3), 1);   // 종료일 − 3개월 + 1일
    const rows = [];
    // 달력 월 단위로 잘라 행 생성
    let cy = P(startISO).y, cm = P(startISO).m;
    while (true) {
      const mStart = iso(cy, cm, 1), mEnd = iso(cy, cm, dim(cy, cm));
      const rs = cmp(mStart, startISO) < 0 ? startISO : mStart;
      const re = cmp(mEnd, endISO) > 0 ? endISO : mEnd;
      if (cmp(rs, re) <= 0) {
        const 일수 = daysInc(rs, re), 월일 = dim(cy, cm);
        const k = contractOn(salaryList, rs) || {};
        // 월 급액을 먼저 원단위 절상 → 부분월은 (월액 × 근무일수 ÷ 그달일수) 반올림
        // 각 연봉 항목을 12로 나눈 뒤 십원 절상(급여검증과 동일). 부분월은 ×일수/월일 후 반올림.
        const 기본월 = ceilU(num(k.기본급) / 12);
        const 능력월 = ceilU(num(k.실적급) / 12);
        const 성과월 = ceilU(num(k.성과급) / 12) + ceilU(num(k.성과가급) / 12);
        const 기타월 = ceilU(num(k.변동역량1) / 12) + ceilU(num(k.변동역량2) / 12) + num(고정역량월);
        const 급여 = Math.round(기본월 * 일수 / 월일);
        const 능력급 = Math.round(능력월 * 일수 / 월일);
        const 성과급 = Math.round(성과월 * 일수 / 월일);
        const 기타 = Math.round(기타월 * 일수 / 월일);
        rows.push({ 기간: `${rs} ~ ${re}`, 시작: rs, 종료: re, 일수, 급여, 능력급, 성과급, 기타 });
      }
      if (cy === P(endISO).y && cm === P(endISO).m) break;
      cm++; if (cm > 12) { cm = 1; cy++; }
    }
    const totalDays = rows.reduce((a, r) => a + r.일수, 0);
    return { startISO, endISO, rows, totalDays };
  }
  function addMonths(s, n) { const { y, m, d } = P(s); const t = y * 12 + (m - 1) + n; const ny = Math.floor(t / 12), nm = (t % 12) + 1; return iso(ny, nm, Math.min(d, dim(ny, nm))); }
  const num = v => { if (v == null) return 0; const n = Number(String(v).replace(/[^0-9.-]/g, '')); return isNaN(n) ? 0 : n; };

  // ---------- 퇴직소득세 ----------
  function retirementTax(퇴직급여, 근속연수) {
    const cfg = C();
    const pick = (table, x) => { for (const b of table) { if (b.upTo == null || x <= b.upTo) return b; } return table[table.length - 1]; };
    const 근속공제tbl = cfg.근속연수공제 || [], 환산공제tbl = cfg.환산급여공제 || [], 세율tbl = cfg.기본세율 || [];
    const b1 = pick(근속공제tbl, 근속연수);
    const 근속연수공제 = b1 ? b1.base + b1.per * (근속연수 - b1.from) : 0;
    const 환산급여 = 근속연수 > 0 ? floorWon((퇴직급여 - 근속연수공제) / 근속연수 * 12) : 0;   // 원 미만 버림
    const b2 = pick(환산공제tbl, 환산급여);
    const 환산급여공제 = b2 ? floorWon(b2.base + b2.rate * (환산급여 - b2.from)) : 0;             // 원 미만 버림
    const 과세표준 = Math.max(0, 환산급여 - 환산급여공제);
    const b3 = pick(세율tbl, 과세표준);
    const 환산산출세액 = b3 ? Math.max(0, 과세표준 * b3.rate - b3.deduct) : 0;                    // full(표기 반올림)
    const 산출세액 = floorWon(환산산출세액 / 12 * 근속연수);                                       // 원 미만 버림
    const 지방소득세 = floorWon(산출세액 * 0.1);                                                  // 원 미만 버림
    return { 근속연수, 근속연수공제, 환산급여, 환산급여공제, 과세표준, 환산산출세액, 산출세액, 지방소득세, 세액계: 산출세액 + 지방소득세, 세율: b3 ? b3.rate : 0, 누진공제: b3 ? b3.deduct : 0 };
  }

  // ---------- 메인 ----------
  // input: {사번,성명,입사일,퇴직일,제도, 평균임금종료일, 중간정산일, 제외기간:[{시작,종료}],
  //         연봉계약:[{연봉일자,기본급,성과급,성과가급,변동역량1,변동역량2}], 고정역량월, 연차수당, dcMisFund}
  PV.computeSeverance = function (input) {
    const 입사일 = input.입사일, 퇴직일 = input.퇴직일;
    const endISO = input.평균임금종료일 || 퇴직일;
    const win = wageWindow(input.연봉계약, endISO, input.고정역량월);
    const D = win.totalDays;
    const sum급여 = win.rows.reduce((a, r) => a + r.급여, 0);
    const sum능력 = win.rows.reduce((a, r) => a + r.능력급, 0);
    const sum성과 = win.rows.reduce((a, r) => a + r.성과급, 0);
    const sum기타 = win.rows.reduce((a, r) => a + r.기타, 0);
    const 안분율 = (C().퇴직_연차수당_안분 != null ? C().퇴직_연차수당_안분 : 0.25);
    const 연차전액 = num(input.연차수당);        // 최근 1개월 지급 전액(표기용)
    const 연차반영 = 연차전액 * 안분율;           // 3개월 환산(계산용)
    const avg30 = v => D > 0 ? v / D * 30 : 0;
    const avgRows = [
      { 구분: '급여', 지급총액: sum급여, 평균임금: avg30(sum급여) },
      { 구분: '능력급', 지급총액: sum능력, 평균임금: avg30(sum능력) },
      { 구분: '성과급', 지급총액: sum성과, 평균임금: avg30(sum성과) },
      { 구분: '연차수당', 지급총액: 연차전액, 평균임금: avg30(연차반영), 표기전액: true, 반영액: 연차반영 },
      { 구분: '기타급여', 지급총액: sum기타, 평균임금: avg30(sum기타) },
    ];
    const 합계지급총액 = sum급여 + sum능력 + sum성과 + sum기타 + 연차전액;   // 표시용(연차 전액)
    const 반영총액 = sum급여 + sum능력 + sum성과 + sum기타 + 연차반영;       // 계산용(연차 3/12)
    const 평균임금30 = avg30(반영총액);   // 30일분 평균임금(연차는 3개월 환산 반영)

    const sf = serviceFactor(입사일, 퇴직일, input.제외기간, input.중간정산일);
    const 퇴직급여 = floorU(평균임금30 * sf.계수);   // 세전, 십원 절사(버림)

    const 근속연수 = Math.ceil(sf.총개월 / 12);
    const tax = retirementTax(퇴직급여, 근속연수);
    const 실지급액 = 퇴직급여 - tax.세액계;

    // DC: 동일 산식으로 퇴직급여 계산, 회사 부담은 미적립분만
    const dc = input.제도 === 'DC' ? { 제도: 'DC', 미적립금: num(input.dcMisFund) || null, 안내: '동일 산식 · 회사 부담 = 미적립 기간분' } : null;

    return {
      info: { 사번: input.사번, 성명: input.성명, 입사일, 퇴직일, 제도: input.제도 || 'DB', endISO, 중간정산일: input.중간정산일 || null, 연차수당: 연차전액, 고정역량월: num(input.고정역량월) },
      window: win, avg: { rows: avgRows, 합계지급총액, 반영총액, 평균임금30, 연차전액, 연차반영 },
      service: sf, 퇴직급여, tax, 실지급액, dc,
      back: { 연봉계약: input.연봉계약 || [], 제외기간: input.제외기간 || [], 발령: input.발령 || [], 휴가: input.휴가 || [], shift: endISO !== 퇴직일 ? (input.shift || { 종료일: endISO }) : null },
    };
  };

  // 급여변동(정상급여 아님) 기간 = ①발령 휴직/단축 블록 ②출산전후휴가(휴가내역)
  //  → 기타 무급휴가는 감액 없다 가정(제외). 통합 후 퇴직 직전 변동을 건너뛴 정상기간 종료일 산출.
  function variancePeriods(orders, vacs, 퇴직일) {
    const isLeaveOrd = g => /휴직|정직|직위해제|단축/.test(g || '') && !/복직/.test(g || '') && !/종료/.test(g || '');
    const isMatVac = t => /출산|유사산/.test(t || '') && !/배우자/.test(t || '');
    const periods = [];
    const os = (orders || []).filter(o => o.발령시작일 && !/퇴직/.test(o.발령구분 || '') && cmp(o.발령시작일, 퇴직일) <= 0).sort((a, b) => cmp(a.발령시작일, b.발령시작일));
    os.forEach((o, idx) => {
      if (!isLeaveOrd(o.발령구분)) return;
      const next = os[idx + 1];
      periods.push({ s: o.발령시작일, e: next ? addDays(next.발령시작일, -1) : 퇴직일, 사유: o.발령구분 });
    });
    const md = (vacs || []).filter(v => isMatVac(v.종류) && v.시작일).map(v => ({ s: v.시작일, e: v.종료일 || v.시작일 }));
    if (md.length) {
      const s = md.reduce((a, x) => x.s < a ? x.s : a, md[0].s);
      const e = md.reduce((a, x) => x.e > a ? x.e : a, md[0].e);
      periods.push({ s, e: cmp(e, 퇴직일) > 0 ? 퇴직일 : e, 사유: '출산전후휴가' });
    }
    return periods;
  }
  PV.pensionSuggestAvgEnd = function (orders, vacs, 퇴직일) {
    const periods = variancePeriods(orders, vacs, 퇴직일);
    if (!periods.length) return { 종료일: 퇴직일, shifted: false, periods };
    let end = 퇴직일, 사유 = null, 시작일 = null, moved = false, guard = 0;
    while (guard++ < 60) {
      const hit = periods.find(p => cmp(p.s, end) <= 0 && cmp(end, p.e) <= 0);
      if (!hit) break;
      end = addDays(hit.s, -1); 사유 = hit.사유; 시작일 = hit.s; moved = true;
    }
    return moved ? { 종료일: end, shifted: true, 사유, 시작일, periods } : { 종료일: 퇴직일, shifted: false, periods };
  };

  PV.pensionAutofill = function (store, 사번) {
    if (!store) return null;
    const sList = (store.salary || []).filter(r => String(r.사번) === String(사번)).map(r => ({
      연봉일자: r.연봉일자, 기본급: num(r.기본급 || (r.items && r.items.기본급)), 실적급: num(r.실적급 || (r.items && r.items.실적급)),
      성과급: num(r.성과급 || (r.items && r.items.성과급)),
      성과가급: num(r.성과가급 || (r.items && r.items.성과가급)), 변동역량1: num(r.변동역량1 || (r.items && r.items.변동역량1)),
      변동역량2: num(r.변동역량2 || (r.items && r.items.변동역량2)),
    }));
    const roster = (store.roster || []).find(r => String(r.사번) === String(사번)) || {};
    const orderRow = (store.order || []).find(r => String(r.사번) === String(사번) && (r.성명 || r.퇴직일)) || {};
    // 고정역량가급: 최근 급여대장 값
    let 고정역량월 = 0;
    (store.ledger || []).filter(r => String(r.사번) === String(사번)).forEach(r => { const v = num((r.pay && r.pay.고정역량가급) || r.고정역량가급); if (v) 고정역량월 = v; });
    // 연차수당: 최근 1개월 지급분
    let 연차수당 = 0;
    (store.ledger || []).filter(r => String(r.사번) === String(사번)).forEach(r => { const v = num((r.pay && r.pay.연차수당) || r.연차수당); if (v) 연차수당 = v; });
    const 발령 = (store.order || []).filter(r => String(r.사번) === String(사번)).map(o => ({ 발령구분: o.발령구분, 발령시작일: o.발령시작일, 퇴직일: o.퇴직일 || '' })).sort((a, b) => cmp(a.발령시작일 || '', b.발령시작일 || ''));
    const 휴가 = (store.vacation || []).filter(r => String(r.사번) === String(사번)).map(v => ({ 종류: v.휴가종류 || v.종류, 시작일: v.시작일, 종료일: v.종료일, 일수: v.휴가일수 || v.일수 }));
    return {
      성명: roster.성명 || orderRow.성명 || '',              // 퇴직자는 명부에 없을 수 있어 발령 성명 폴백
      입사일: roster.그룹입사일 || roster.입사일 || roster.입사일자 || '',
      퇴직일: orderRow.퇴직일 || '',
      연봉계약: sList, 고정역량월, 연차수당, 발령, 휴가,
    };
  };
})(window.PV);
