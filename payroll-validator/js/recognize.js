/* ============================================================
   recognize.js — 파일 자동 인식 & 파싱
   폴더 안에 여러 xlsx를 넣어도 내용(헤더)으로 종류 판별
   ============================================================ */
window.PV = window.PV || {};
(function (PV) {
  'use strict';

  // ---- 날짜 정규화 → 'YYYY-MM-DD' 문자열 or null ----
  function toISO(v) {
    if (v == null || v === '' || v === ' ' || v === '-') return null;
    if (v instanceof Date && !isNaN(v)) {
      const y = v.getFullYear(), m = v.getMonth() + 1, d = v.getDate();
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    if (typeof v === 'number') { // excel serial
      const dt = XLSX.SSF ? XLSX.SSF.parse_date_code(v) : null;
      if (dt) return `${dt.y}-${String(dt.m).padStart(2, '0')}-${String(dt.d).padStart(2, '0')}`;
    }
    const s = String(v).trim();
    let m = s.match(/^(\d{4})[-./]\s?(\d{1,2})[-./]\s?(\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    return null;
  }
  function num(v) {
    if (v == null || v === '' || v === '-' || v === ' ') return 0;
    if (typeof v === 'number') return v;
    const n = parseFloat(String(v).replace(/[, ₩\s]/g, ''));
    return isNaN(n) ? 0 : n;
  }
  function txt(v) { return v == null ? '' : String(v).trim(); }
  PV.toISO = toISO; PV.num = num; PV.txt = txt;

  // ---- 워크북 → rows(2D array) ----
  function sheetRows(ws) {
    return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false });
  }

  // 헤더행에서 이름→인덱스 맵
  function headerMap(row) {
    const map = {};
    (row || []).forEach((c, i) => { const t = txt(c); if (t) map[t] = i; });
    return map;
  }
  function findRowWith(rows, keys, limit = 6) {
    for (let r = 0; r < Math.min(rows.length, limit); r++) {
      const set = (rows[r] || []).map(txt);
      if (keys.every(k => set.includes(k))) return r;
    }
    return -1;
  }
  function anyRowWith(rows, keys, limit = 6) {
    for (let r = 0; r < Math.min(rows.length, limit); r++) {
      const set = (rows[r] || []).map(txt);
      if (keys.some(k => set.includes(k))) return r;
    }
    return -1;
  }

  // ---- 종류 판별 ----
  function classify(rows, fname) {
    const head = [];
    for (let r = 0; r < Math.min(rows.length, 4); r++) (rows[r] || []).forEach(c => head.push(txt(c)));
    const H = new Set(head);
    const has = (...ks) => ks.every(k => H.has(k));
    const some = (...ks) => ks.some(k => H.has(k));
    if (has('귀속년월', '총지급액') || has('실지급액', '총지급액')) return 'ledger';
    if (has('연봉일자', '연봉계')) return 'salary';
    if (has('임금피크제적용여부')) return 'roster';
    if (has('발령구분', '발령시작일')) return 'order';
    if (has('휴가종류') && some('결재진행상태', '휴가일수')) return 'vacation';
    if (some('공휴일', '휴일') && some('일자', '날짜', '날') ) return 'holiday';
    // filename fallback
    const fn = (fname || '');
    if (/직책수당|본점/i.test(fn)) return 'dutyextra';
    if (/급여대장|payroll|ledger/i.test(fn)) return 'ledger';
    if (/연봉/i.test(fn)) return 'salary';
    if (/명부/i.test(fn)) return 'roster';
    if (/발령/i.test(fn)) return 'order';
    if (/휴가/i.test(fn)) return 'vacation';
    if (/공휴|휴일|holiday/i.test(fn)) return 'holiday';
    return 'unknown';
  }

  // ---- 각 종류별 파서 ----
  function parseSalary(rows) {
    const hr = findRowWith(rows, ['연봉일자', '연봉계']);
    const H = headerMap(rows[hr]);
    const g = (row, name) => row[H[name]];
    const out = [];
    for (let r = hr + 1; r < rows.length; r++) {
      const row = rows[r]; if (!row) continue;
      const sabun = txt(g(row, '사번')); if (!sabun) continue;
      out.push({
        사번: sabun, 성명: txt(g(row, '성명')), 소속: txt(g(row, '소속')),
        재직구분: txt(g(row, '재직구분')),
        연봉일자: toISO(g(row, '연봉일자')),
        items: {
          기본급: num(g(row, '기본급')), 실적급: num(g(row, '실적급')),
          성과급: num(g(row, '성과급')), 성과가급: num(g(row, '성과가급')),
          변동역량1: num(g(row, '변동역량1')), 변동역량2: num(g(row, '변동역량2')),
        },
        연봉계: num(g(row, '연봉계')),
      });
    }
    return out;
  }

  function parseRoster(rows) {
    const hr = anyRowWith(rows, ['임금피크제적용여부', '사번']);
    const H = headerMap(rows[hr]);
    const g = (row, name) => row[H[name]];
    const out = [];
    for (let r = hr + 1; r < rows.length; r++) {
      const row = rows[r]; if (!row) continue;
      const sabun = txt(g(row, '사번')); if (!sabun) continue;
      out.push({
        사번: sabun, 성명: txt(g(row, '성명')), 소속: txt(g(row, '소속')),
        직급: txt(g(row, '직급')), 직급코드: txt(g(row, '직급코드')),
        직위: txt(g(row, '직위')), 직책: txt(g(row, '직책')), 직무: txt(g(row, '직무')),
        피크적용: txt(g(row, '임금피크제적용여부')),
        피크예상일: toISO(g(row, '임금피크제예상일')),
        입사일: toISO(g(row, '입사일')),
        생년월일: toISO(g(row, '생년월일')),
      });
    }
    return out;
  }

  // 발령: 2단 헤더(현재/발령전/발령후 그룹)
  function parseOrder(rows) {
    const hr = findRowWith(rows, ['발령구분', '발령시작일'], 4);
    const r1 = rows[hr] || [], r2 = rows[hr + 1] || [];
    const H1 = headerMap(r1);
    // 그룹 시작 컬럼
    const gStart = {};
    r1.forEach((c, i) => { const t = txt(c); if (t === '현재' || t === '발령전' || t === '발령후') gStart[t] = i; });
    // 그룹 경계(다음 그룹 시작 or 성별/입사구분 등 tail)
    const order = ['현재', '발령전', '발령후'].filter(k => k in gStart).sort((a, b) => gStart[a] - gStart[b]);
    function subIdx(group, subname) {
      if (!(group in gStart)) return -1;
      const start = gStart[group];
      const gi = order.indexOf(group);
      let end = r2.length;
      if (gi + 1 < order.length) end = gStart[order[gi + 1]];
      for (let i = start; i < end; i++) if (txt(r2[i]) === subname) return i;
      return -1;
    }
    const idx = {
      사번: H1['사번'], 성명: H1['성명'], 퇴직일: H1['퇴직일'],
      발령구분: H1['발령구분'], 발령시작일: H1['발령시작일'],
      현재직무: subIdx('현재', '직무'), 전직무: subIdx('발령전', '직무'), 후직무: subIdx('발령후', '직무'),
      현재직급코드: subIdx('현재', '직급코드'), 후직급코드: subIdx('발령후', '직급코드'),
      현재직급: subIdx('현재', '직급'), 후직급: subIdx('발령후', '직급'),
    };
    const g = (row, i) => (i != null && i >= 0) ? row[i] : null;
    const out = [];
    for (let r = hr + 2; r < rows.length; r++) {
      const row = rows[r]; if (!row) continue;
      const sabun = txt(g(row, idx.사번)); if (!sabun) continue;
      out.push({
        사번: sabun, 성명: txt(g(row, idx.성명)),
        퇴직일: toISO(g(row, idx.퇴직일)),
        발령구분: txt(g(row, idx.발령구분)),
        발령시작일: toISO(g(row, idx.발령시작일)),
        전직무: txt(g(row, idx.전직무)), 후직무: txt(g(row, idx.후직무)), 현재직무: txt(g(row, idx.현재직무)),
        현재직급코드: txt(g(row, idx.현재직급코드)), 후직급코드: txt(g(row, idx.후직급코드)),
        현재직급: txt(g(row, idx.현재직급)), 후직급: txt(g(row, idx.후직급)),
      });
    }
    return out;
  }

  function parseVacation(rows) {
    const hr = findRowWith(rows, ['휴가종류'], 4);
    const H = headerMap(rows[hr]);
    const g = (row, name) => row[H[name]];
    const out = [];
    for (let r = hr + 1; r < rows.length; r++) {
      const row = rows[r]; if (!row) continue;
      const sabun = txt(g(row, '사번')); if (!sabun) continue;
      out.push({
        사번: sabun, 성명: txt(g(row, '이름')) || txt(g(row, '성명')),
        시작일: toISO(g(row, '시작일')), 종료일: toISO(g(row, '종료일')),
        휴가종류: txt(g(row, '휴가종류')),
        시작구분: txt(g(row, '시작일 휴가구분')), 종료구분: txt(g(row, '종료일 휴가구분')),
        휴가일수: num(g(row, '휴가일수')),
        결재: txt(g(row, '결재진행상태')),
      });
    }
    return out;
  }

  // 직책수당(본점) 예외자: 사번·성명 (사번만 사용)
  function parseDutyExtra(rows) {
    let start = 0;
    const first = (rows[0] || []).map(txt);
    if (first.some(t => /사번|성명|이름/.test(t))) start = 1;
    const out = [];
    for (let r = start; r < rows.length; r++) {
      const row = rows[r]; if (!row) continue;
      const sabun = txt(row[0]); if (!sabun || sabun === 'Σ') continue;
      out.push(sabun);
    }
    return out;
  }

  function parseHoliday(rows) {
    // 어떤 열이든 날짜로 해석되면 공휴일로 수집
    const set = new Set();
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r] || [];
      for (const c of row) { const iso = toISO(c); if (iso) set.add(iso); }
    }
    return [...set];
  }

  function parseLedger(rows) {
    const hr = findRowWith(rows, ['총지급액'], 4);
    const H = headerMap(rows[hr]);
    const g = (row, name) => (H[name] != null ? row[H[name]] : null);
    const out = [];
    for (let r = hr + 1; r < rows.length; r++) {
      const row = rows[r]; if (!row) continue;
      const sabun = txt(g(row, '사번')); if (!sabun || sabun === 'Σ') continue;
      const rec = {
        사번: sabun, 성명: txt(g(row, '성명')), 소속: txt(g(row, '소속')),
        귀속년월: txt(g(row, '귀속년월')), 지급유형: txt(g(row, '지급유형')),
        직급: txt(g(row, '직급')), 직책: txt(g(row, '직책')), 직무: txt(g(row, '직무')),
        퇴사일자: toISO(g(row, '퇴사일자')), 입사일자: toISO(g(row, '입사일자')),
        pay: {}, 총지급액: num(g(row, '총지급액')),
      };
      // 세전 지급 항목만 수집
      PV.LEDGER_PAY_COLS.forEach(name => { rec.pay[name] = num(g(row, name)); });
      out.push(rec);
    }
    return out;
  }

  // 급여대장 세전 지급항목 컬럼 (검증 비교 후보)
  PV.LEDGER_PAY_COLS = [
    '기본급', '능력급', '상여금', '성과급', '성과가급', '변동역량가급1', '변동역량가급2',
    '고정역량가급', '감액', '연차수당', '생산성향상격려금', '차량유지비', '조사연구비', '업무성과금',
  ];

  // 간단 2열(사번·금액) / 3열(사번·구분·금액) 업로드 파서
  PV.parseAmountUpload = function (rows, withKind) {
    // 헤더 유무 감지
    let start = 0;
    const first = (rows[0] || []).map(txt);
    if (first.some(t => /사번|금액|구분/.test(t))) start = 1;
    const out = [];
    for (let r = start; r < rows.length; r++) {
      const row = rows[r]; if (!row) continue;
      const sabun = txt(row[0]); if (!sabun) continue;
      if (withKind) out.push({ 사번: sabun, 구분: txt(row[1]), 금액: num(row[2]) });
      else out.push({ 사번: sabun, 금액: num(row[1]) });
    }
    return out;
  };

  // 진입점: ArrayBuffer + filename → {type, data, rowsCount}
  PV.readWorkbook = function (arrayBuffer, fname) {
    const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = sheetRows(ws);
    const type = classify(rows, fname);
    let data = null;
    switch (type) {
      case 'salary': data = parseSalary(rows); break;
      case 'roster': data = parseRoster(rows); break;
      case 'order': data = parseOrder(rows); break;
      case 'vacation': data = parseVacation(rows); break;
      case 'holiday': data = parseHoliday(rows); break;
      case 'ledger': data = parseLedger(rows); break;
      case 'dutyextra': data = parseDutyExtra(rows); break;
      default: data = null;
    }
    return { type, data, rowsCount: Array.isArray(data) ? data.length : 0, rawRows: rows };
  };

  PV.readAmount = function (arrayBuffer, withKind) {
    const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = sheetRows(ws);
    return PV.parseAmountUpload(rows, withKind);
  };

  PV.FILE_LABELS = {
    salary: { name: '연봉내역', sub: '확정 연봉 · 최신 연봉일자' },
    roster: { name: '직원명부', sub: '임금피크 · 직책 · 휴직판별' },
    order: { name: '발령정보', sub: '퇴직/휴직/복직/직무변경 (누적)' },
    vacation: { name: '휴가데이터', sub: '무급휴가 공제 (결재완료)' },
    holiday: { name: '공휴일', sub: '실제 지급일 산출' },
    dutyextra: { name: '직책수당(본점)', sub: '직책 없는 월 10만 예외자' },
    ledger: { name: '급여대장', sub: '검증 대상 (세전)' },
  };

})(window.PV);
