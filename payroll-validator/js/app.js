/* ============================================================
   app.js — UI 오케스트레이션
   입력 → [급여계산](검색기 새 창) → 급여대장 → [검증](새 창) → [최종저장]
   ============================================================ */
(function (PV) {
  'use strict';
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const won = n => (n == null ? '' : Math.round(n).toLocaleString('ko-KR'));
  const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const store = {
    salary: null, roster: null, order: null, vacation: null, holiday: [], ledger: null,
    files: {}, fileCounts: {}, uploads: { annual: new Map(), prod: new Map(), etc: new Map() },
    discipline: [], carry: new Map(), overrides: { unpaidVac: new Map(), maternity: new Map() }, dutyextra: [],
  };
  let payrollResult = null, verifyResult = null;

  /* ---------- theme / reset ---------- */
  const THEME_KEY = 'pv-theme';
  const curTheme = () => document.documentElement.getAttribute('data-theme') || 'light';
  function setTheme(t) { document.documentElement.setAttribute('data-theme', t); try { localStorage.setItem(THEME_KEY, t); } catch (e) {} }
  (function () { let t = 'light'; try { t = localStorage.getItem(THEME_KEY) || 'light'; } catch (e) {} setTheme(t); })();
  $('#themeBtn').onclick = () => setTheme(curTheme() === 'dark' ? 'light' : 'dark');
  $('#resetBtn').onclick = () => { if (confirm('모든 입력·계산·검증 결과를 초기화할까요?')) location.reload(); };

  /* ---------- toast ---------- */
  function toast(msg, kind) {
    const t = el('div', 'toast' + (kind ? ' ' + kind : ''), `<span>${esc(msg)}</span>`);
    $('#toasts').appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(10px)'; setTimeout(() => t.remove(), 300); }, 3000);
  }

  /* ---------- period ---------- */
  (function () {
    const sy = $('#selYear'), sm = $('#selMonth'), now = new Date();
    for (let y = now.getFullYear() + 1; y >= 2023; y--) { const o = el('option'); o.value = y; o.textContent = y + '년'; sy.appendChild(o); }
    for (let m = 1; m <= 12; m++) { const o = el('option'); o.value = m; o.textContent = m + '월'; sm.appendChild(o); }
    sy.value = now.getFullYear(); sm.value = now.getMonth() + 1;
    sy.onchange = sm.onchange = updatePayday; updatePayday();
  })();
  function target() { return { y: +$('#selYear').value, m: +$('#selMonth').value }; }
  function updatePayday() { const { y, m } = target(); $('#payDate').textContent = PV.payday(y, m, new Set(store.holiday || [])).slice(5).replace('-', '.'); }

  const readFile = f => f.arrayBuffer();

  /* ---------- folder (발령 다중파일 누적, 아카이브 로드) ---------- */
  $('#folderInput').onchange = async (e) => {
    const all = [...e.target.files];
    const xls = all.filter(f => /\.x(lsx|ls)$/i.test(f.name));
    const jsons = all.filter(f => /\.json$/i.test(f.name));
    if (!xls.length && !jsons.length) { toast('엑셀 파일이 없습니다', 'bad'); return; }
    // 기준 데이터 리셋(재선택 시 중복 방지)
    store.salary = store.roster = store.order = store.vacation = null; store.holiday = []; store.dutyextra = []; store.files = {}; store.fileCounts = {};
    let ok = 0;
    for (const f of xls) {
      try {
        const res = PV.readWorkbook(await readFile(f), f.name);
        if (res.type === 'unknown' || !res.data) continue;
        if (res.type === 'ledger') { store.ledger = res.data; store.files.ledger = f.name; markLedger(); continue; }
        if (res.type === 'order' || res.type === 'salary' || res.type === 'vacation') { // 여러 발령·연봉·휴가 파일 누적
          store[res.type] = (store[res.type] || []).concat(res.data);
          store.fileCounts[res.type] = (store.fileCounts[res.type] || 0) + 1;
          store.files[res.type] = store.fileCounts[res.type] > 1 ? `${store.fileCounts[res.type]}개 파일` : f.name;
        } else if (res.type === 'holiday') {
          store.holiday = [...new Set([...(store.holiday || []), ...res.data])]; store.files.holiday = f.name;
        } else if (res.type === 'dutyextra') {
          store.dutyextra = res.data; store.files.dutyextra = f.name;
        } else { store[res.type] = res.data; store.files[res.type] = f.name; }
        ok++;
      } catch (err) { console.error(f.name, err); }
    }
    // 전월 처리 아카이브
    const arch = [];
    for (const f of jsons) { try { const t = JSON.parse(await f.text()); if (t && t.type === 'pv-archive') arch.push(t); } catch (e) {} }
    if (arch.length) { arch.sort((a, b) => (a.ym < b.ym ? 1 : -1)); applyArchive(arch[0]); }

    $('#folderBadge').textContent = '연결됨'; $('#folderBadge').className = 'badge g';
    renderFolder(); detectLeaves(); renderDiscipline(); updatePayday(); refresh();
    toast(`폴더 인식 완료 · ${ok}개 기준 파일` + (arch.length ? ` · 전월 처리내역 불러옴` : ''), 'ok');
  };

  function applyArchive(a) {
    store.carry = new Map(a.carry || []);
    store.discipline = (a.discipline || []).map(d => Object.assign({}, d));
    store.overrides.unpaidVac = new Map((a.overrides && a.overrides.unpaidVac) || []);
    store.overrides.maternity = new Map((a.overrides && a.overrides.maternity) || []);
    toast(`전월(${a.ym}) 처리내역 불러옴 — 이월휴직·징계 자동 반영`, 'ok');
  }

  function renderFolder() {
    const wrap = $('#folderFiles'); wrap.innerHTML = '';
    const unit = { holiday: '일', dutyextra: '명' };
    ['salary', 'roster', 'order', 'vacation', 'holiday', 'dutyextra'].forEach(type => {
      const lab = PV.FILE_LABELS[type];
      const arr = type === 'dutyextra' ? store.dutyextra : store[type];
      const loaded = Array.isArray(arr) ? arr.length > 0 : arr != null;
      const cnt = Array.isArray(arr) ? arr.length : 0;
      const it = el('div', 'fileitem ' + (loaded ? 'ok' : 'miss'));
      it.innerHTML = `<span class="dot"></span>
        <div><div class="fi-name">${lab.name}${(type === 'order' || type === 'salary' || type === 'vacation') && store.fileCounts[type] > 1 ? ` <span class="badge g" style="font-size:9px">${store.fileCounts[type]}개 합침</span>` : ''}</div><div class="fi-sub">${lab.sub}</div></div>
        <div class="fi-meta">${loaded ? `<span class="badge g">${cnt}${unit[type] || '건'}</span>` : `<span class="badge n">${type === 'dutyextra' ? '없음' : '미인식'}</span>`}
        <div class="fi-file">${esc(store.files[type] || '')}</div></div>`;
      wrap.appendChild(it);
    });
  }

  /* ---------- ledger ---------- */
  $('#ledgerInput').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const res = PV.readWorkbook(await readFile(f), f.name);
      if (res.type !== 'ledger') { toast('급여대장 형식이 아닙니다', 'bad'); return; }
      store.ledger = res.data; store.files.ledger = f.name; markLedger(); refresh(); toast('급여대장 첨부 완료', 'ok');
    } catch (err) { toast('읽기 실패', 'bad'); console.error(err); }
  };
  function markLedger() {
    const n = store.ledger ? store.ledger.length : 0;
    $('#ledgerBadge').textContent = n ? `${n}행` : '미첨부'; $('#ledgerBadge').className = 'badge ' + (n ? 'g' : 'n');
    if (n) $('#ledgerDrop').querySelector('.dz-t').textContent = store.files.ledger || '첨부됨';
  }

  /* ---------- variable uploads ---------- */
  $$('.upfile').forEach(inp => inp.onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return; const kind = inp.dataset.up;
    try {
      const rows = PV.readAmount(await readFile(f), kind === 'etc');
      const map = store.uploads[kind]; map.clear();
      if (kind === 'etc') rows.forEach(r => { if (!map.has(r.사번)) map.set(r.사번, []); map.get(r.사번).push({ 구분: r.구분, 금액: r.금액 }); });
      else rows.forEach(r => map.set(r.사번, r.금액));
      $('#up-' + kind).classList.add('loaded'); $('#sub-' + kind).textContent = `${rows.length}건 · ${f.name}`; toast('업로드 완료', 'ok');
    } catch (err) { toast('업로드 실패', 'bad'); console.error(err); }
  });

  /* ---------- discipline ---------- */
  function renderDiscipline() {
    const box = $('#disciplineList');
    if (!store.discipline.length) { box.innerHTML = '<div class="empty">감봉·정직 대상자를 추가하세요</div>'; return; }
    const t = el('table', 'mini');
    t.innerHTML = '<thead><tr><th>사번</th><th>성명</th><th>종류</th><th style="text-align:right">금액</th><th></th></tr></thead>';
    const tb = el('tbody');
    store.discipline.forEach((d, i) => {
      const tr = el('tr');
      tr.innerHTML = `<td><input type="text" value="${esc(d.사번)}" style="width:82px" data-k="사번"></td>
        <td><input type="text" value="${esc(d.성명)}" style="width:60px" data-k="성명"></td>
        <td><select class="inp" data-k="종류"><option ${d.종류 === '감봉' ? 'selected' : ''}>감봉</option><option ${d.종류 === '정직' ? 'selected' : ''}>정직</option></select></td>
        <td style="text-align:right"><input type="number" value="${d.금액 || ''}" style="width:92px;text-align:right" data-k="금액" ${d.종류 === '정직' ? 'disabled placeholder="자동"' : ''}></td>
        <td><span class="rowdel" title="삭제">✕</span></td>`;
      tr.querySelectorAll('[data-k]').forEach(inp => inp.onchange = () => { d[inp.dataset.k] = inp.dataset.k === '금액' ? +inp.value : inp.value; if (inp.dataset.k === '종류') renderDiscipline(); });
      tr.querySelector('.rowdel').onclick = () => { store.discipline.splice(i, 1); renderDiscipline(); };
      tb.appendChild(tr);
    });
    t.appendChild(tb); box.innerHTML = ''; box.appendChild(t);
  }
  $('#addDiscipline').onclick = () => { store.discipline.push({ 사번: '', 성명: '', 종류: '감봉', 금액: 0 }); renderDiscipline(); };
  renderDiscipline();

  /* ---------- 휴직 확인 (이월 + 무급·의병휴직 종료일 체크) ---------- */
  const needsEnd = 종류 => /무급휴직|의병휴직/.test(종류 || '');
  // 무급휴직 발령구분값 = '기타휴직(무급)'
  function orderLeaveType(g) { g = g || ''; if (/의병/.test(g)) return '의병휴직'; if (/무급/.test(g)) return '무급휴직'; return null; }
  function detectLeaves() {
    if (!store.roster) return;
    const orderBy = new Map(); (store.order || []).forEach(o => { if (!orderBy.has(o.사번)) orderBy.set(o.사번, []); orderBy.get(o.사번).push(o); });
    const nameOf = sabun => (store.roster.find(x => x.사번 === sabun) || {}).성명 || '';
    const cand = new Map(); // 사번 → {성명, source, 종류fix, 시작일fix}
    // 이월 휴직 (명부 (휴직) & 발령에 휴직 없음)
    store.roster.forEach(r => {
      if ((r.직무 || '').includes('(휴직)') && !(orderBy.get(r.사번) || []).some(o => /휴직/.test(o.발령구분 || '')))
        cand.set(r.사번, { 성명: r.성명, source: 'carry' });
    });
    // 발령상 "현재" 무급·의병휴직자만 (최신 휴직/복직 발령 기준 — 복직했거나 다른 휴직으로 넘어갔으면 제외)
    orderBy.forEach((os, sabun) => {
      const chain = os.filter(o => /휴직|복직/.test(o.발령구분 || '') && o.발령시작일).slice().sort((a, b) => a.발령시작일 < b.발령시작일 ? -1 : 1);
      if (!chain.length) return;
      const last = chain[chain.length - 1];
      const t = orderLeaveType(last.발령구분); // 복직·육아휴직 등이 최신이면 null → 제외
      if (!t) return;
      const prev = cand.get(sabun);
      if (!prev || prev.source === 'order') cand.set(sabun, { 성명: nameOf(sabun) || last.성명 || '', source: 'order', 종류fix: t, 시작일fix: last.발령시작일 });
    });
    const box = $('#carryList'); box.innerHTML = '';
    const list = [...cand.entries()];
    let missing = 0;
    if (!list.length) { $('#carryBadge').textContent = '0'; $('#carryBadge').className = 'badge n'; box.innerHTML = '<div class="empty">휴직 확인 대상자가 없습니다</div>'; return; }
    const t = el('table', 'mini');
    t.innerHTML = '<thead><tr><th>사번</th><th>성명</th><th>종류</th><th>시작일</th><th>종료일</th></tr></thead>';
    const tb = el('tbody');
    list.forEach(([sabun, c]) => {
      const cur = store.carry.get(sabun) || {};
      const 종류 = c.source === 'order' ? c.종류fix : (cur.종류 || '');
      const endReq = needsEnd(종류);
      if (endReq && !cur.종료일) missing++;
      const 종류Cell = c.source === 'order'
        ? `<span class="badge ${c.종류fix === '의병휴직' ? 'g' : 'n'}" style="font-size:10px">${c.종류fix}</span>`
        : `<select class="inp" data-k="종류"><option value="">선택</option>${['육아휴직', '무급휴직', '가족돌봄휴직', '난임휴직', '의병휴직'].map(x => `<option ${cur.종류 === x ? 'selected' : ''}>${x}</option>`).join('')}</select>`;
      const 시작Cell = c.source === 'order' ? `<span class="muted" style="font-size:11px">${c.시작일fix || ''}</span>` : `<input type="date" data-k="시작일" value="${cur.시작일 || ''}" style="width:130px">`;
      const tr = el('tr');
      tr.innerHTML = `<td>${esc(sabun)}</td><td>${esc(c.성명)}</td><td>${종류Cell}</td><td>${시작Cell}</td>
        <td><input type="date" data-k="종료일" value="${cur.종료일 || ''}" style="width:130px${endReq && !cur.종료일 ? ';border-color:var(--bad);box-shadow:0 0 0 2px var(--bad-soft)' : ''}" ${endReq ? 'title="무급·의병휴직은 종료일 필수"' : ''}></td>`;
      tr.querySelectorAll('[data-k]').forEach(inp => inp.onchange = () => {
        const o = store.carry.get(sabun) || {}; if (c.source === 'order') o.종류 = c.종류fix; o[inp.dataset.k] = inp.value; store.carry.set(sabun, o);
        if (inp.dataset.k !== '종료일') detectLeaves();
        else detectLeaves();
      });
      tb.appendChild(tr);
    });
    t.appendChild(tb); box.appendChild(t);
    $('#carryBadge').textContent = missing ? `종료일 ${missing}` : String(list.length);
    $('#carryBadge').className = 'badge ' + (missing ? 'g' : 'n');
  }

  /* ---------- enable ---------- */
  function refresh() {
    $('#calcBtn').disabled = !(store.salary && store.roster && store.order);
    $('#verifyBtn').disabled = !(payrollResult && !payrollResult.blocked && store.ledger);
  }
  const storeForEngine = () => ({ salary: store.salary, roster: store.roster, order: store.order, vacation: store.vacation, holiday: store.holiday, ledger: store.ledger, uploads: store.uploads, discipline: store.discipline, carry: store.carry, overrides: store.overrides, dutyExtra: store.dutyextra });

  /* ---------- alerts ---------- */
  const ALERT_ICON = {
    block: '<path d="M12 9v4m0 4h.01M10.3 3.9L2.4 18a2 2 0 001.7 3h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    bad: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M15 9l-6 6M9 9l6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    warn: '<path d="M12 9v4m0 4h.01M10.3 3.9L2.4 18a2 2 0 001.7 3h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    info: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M12 11v5M12 8h.01" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    ok: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M8 12l3 3 5-6" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  };
  function renderAlerts(box, alerts) {
    box.innerHTML = '';
    if (!alerts.length) { box.innerHTML = '<div class="empty">특이사항 없음</div>'; return; }
    alerts.forEach(a => {
      const clickable = a.kind && a.사번;
      const d = el('div', 'alert ' + a.level + (clickable ? ' clickable' : ''));
      d.innerHTML = `<div class="a-ic"><svg viewBox="0 0 24 24">${ALERT_ICON[a.level] || ALERT_ICON.info}</svg></div>
        <div><div class="a-t">${esc(a.title)}</div><div class="a-d">${esc(a.desc || '')}</div></div>
        ${clickable ? '<span class="a-go">입력 →</span>' : ''}`;
      if (clickable) d.onclick = () => openFixModal(a);
      box.appendChild(d);
    });
  }

  /* ---------- 담당자 입력 모달 ---------- */
  function openFixModal(a) {
    if (a.kind === 'carry') {
      openModal({
        title: '이월 휴직 정보 입력', sub: `${a.사번}`,
        fields: [
          { key: '시작일', label: '휴직 시작일', type: 'date', value: (store.carry.get(a.사번) || {}).시작일 || '' },
          { key: '종류', label: '휴직 종류', type: 'select', options: ['육아휴직', '무급휴직', '가족돌봄휴직', '난임휴직', '의병휴직'], value: (store.carry.get(a.사번) || {}).종류 || '' },
        ],
        onSubmit: v => { store.carry.set(a.사번, { 시작일: v.시작일, 종류: v.종류 }); detectLeaves(); runCalc(false); toast('반영 완료 — 재계산됨', 'ok'); },
      });
    } else if (a.kind === 'maternity') {
      const cur = store.overrides.maternity.get(a.사번) || {};
      openModal({
        title: '출산휴가 기간 입력', sub: `${a.사번} · 유급 60일(다태아 75일) 이후 무급 자동계산`,
        fields: [
          { key: '유형', label: '유형', type: 'select', options: ['일반', '다태아', '미숙아'], value: cur.유형 || '일반' },
          { key: '전시작', label: '출산전 시작일', type: 'date', value: cur.전시작 || '' },
          { key: '전종료', label: '출산전 종료일', type: 'date', value: cur.전종료 || '' },
          { key: '후시작', label: '출산후 시작일', type: 'date', value: cur.후시작 || '' },
          { key: '후종료', label: '출산후 종료일', type: 'date', value: cur.후종료 || '' },
        ],
        onSubmit: v => { store.overrides.maternity.set(a.사번, { 유형: v.유형, 전시작: v.전시작, 전종료: v.전종료, 후시작: v.후시작, 후종료: v.후종료 }); runCalc(false); toast('반영 완료 — 무급일수 자동계산·재계산됨', 'ok'); },
      });
    }
  }
  function openModal(cfg) {
    const root = $('#modalRoot');
    const fields = cfg.fields.map(f => {
      let inp;
      if (f.type === 'select') inp = `<select class="inp" data-k="${f.key}"><option value="">선택</option>${f.options.map(o => `<option ${f.value === o ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
      else inp = `<input type="${f.type}" data-k="${f.key}" value="${esc(f.value)}">`;
      return `<div class="m-field"><label>${esc(f.label)}</label>${inp}</div>`;
    }).join('');
    const ov = el('div', 'modal-ov');
    ov.innerHTML = `<div class="modal"><div class="m-head"><div class="m-ic"><svg viewBox="0 0 24 24" width="16" height="16">${ALERT_ICON.warn}</svg></div>
      <div><h3>${esc(cfg.title)}</h3><div class="m-sub">${esc(cfg.sub || '')}</div></div></div>
      <div class="m-body">${fields}</div>
      <div class="m-foot"><button class="btn btn-ghost btn-sm" data-x>취소</button><button class="btn btn-primary btn-sm" data-ok>적용</button></div></div>`;
    const close = () => ov.remove();
    ov.onclick = e => { if (e.target === ov) close(); };
    ov.querySelector('[data-x]').onclick = close;
    ov.querySelector('[data-ok]').onclick = () => { const v = {}; ov.querySelectorAll('[data-k]').forEach(i => v[i.dataset.k] = i.value); cfg.onSubmit(v); close(); };
    root.appendChild(ov);
  }

  /* ---------- STEP A: 급여계산 ---------- */
  function runCalc(openWindow) {
    const res = PV.computePayroll(storeForEngine(), target());
    payrollResult = res; verifyResult = null;
    $('#verifyTiles').classList.add('hidden'); $('#verifyActions').classList.add('hidden'); $('#verifyAlerts').innerHTML = '';
    const ve = $('#verifyExcel'); if (ve) ve.remove(); const sv = $('#saveBtn'); if (sv) sv.remove();
    $('#calcTiles').classList.remove('hidden');
    $('#tiTotal').textContent = res.summary.total; $('#tiIlhal').textContent = res.summary.ilhal;
    $('#tiSpecial').textContent = res.summary.special; $('#tiWarn').textContent = res.summary.warn; $('#tiBlock').textContent = res.summary.block;
    renderAlerts($('#calcAlerts'), res.alerts);
    $('#calcActions').classList.toggle('hidden', res.blocked);
    ensureExtraButtons(); refresh();
    if (res.blocked) { toast('연봉 미입력 — 전체 계산 차단', 'bad'); }
    else if (openWindow) { openPayrollWindow(); toast(`급여계산 완료 · ${res.summary.total}명`, 'ok'); }
  }
  $('#calcBtn').onclick = () => { try { runCalc(true); } catch (e) { console.error(e); toast('오류: ' + e.message, 'bad'); } };
  $('#openCalcBtn').onclick = openPayrollWindow;

  /* ---------- STEP B: 검증 ---------- */
  function runVerify(openWindow) {
    const res = PV.compareLedger(payrollResult, storeForEngine());
    verifyResult = res;
    $('#verifyTiles').classList.remove('hidden');
    $('#tiOk').textContent = res.summary.ok; $('#tiBad').textContent = res.summary.bad;
    renderAlerts($('#verifyAlerts'), res.alerts);
    $('#verifyActions').classList.remove('hidden');
    ensureExtraButtons();
    if (openWindow) openVerifyWindow();
    toast(res.summary.bad ? `검증 완료 · 불일치 ${res.summary.bad}명` : '전원 완전일치 · 최종저장 가능', res.summary.bad ? '' : 'ok');
  }
  $('#verifyBtn').onclick = () => { if (!payrollResult) { toast('먼저 급여계산을 실행하세요', 'bad'); return; } try { runVerify(true); } catch (e) { console.error(e); toast('오류: ' + e.message, 'bad'); } };
  $('#openVerifyBtn').onclick = openVerifyWindow;

  function ensureExtraButtons() {
    if (!$('#calcExcel') && payrollResult && !payrollResult.blocked) {
      const b = el('button', 'btn btn-ghost btn-block', '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg> 급여명세 엑셀');
      b.id = 'calcExcel'; b.style.marginTop = '8px'; b.onclick = exportPayroll; $('#calcActions').appendChild(b);
    }
    if (verifyResult && !$('#verifyExcel')) {
      const b = el('button', 'btn btn-ghost btn-block', '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg> 검증결과 엑셀');
      b.id = 'verifyExcel'; b.style.marginTop = '8px'; b.onclick = exportVerify; $('#verifyActions').appendChild(b);
    }
    // 최종저장: 검증 완료 & 불일치 0
    if (verifyResult && verifyResult.summary.bad === 0 && !$('#saveBtn')) {
      const b = el('button', 'btn btn-save btn-block', '<svg viewBox="0 0 24 24" fill="none"><path d="M5 3h11l3 3v13a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M8 3v5h7M8 21v-6h8v6" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg> 최종 저장 (폴더 보관용)');
      b.id = 'saveBtn'; b.style.marginTop = '10px'; b.onclick = saveArchive; $('#verifyActions').appendChild(b);
    }
  }

  function saveArchive() {
    const { y, m } = payrollResult.target, ym = `${y}-${String(m).padStart(2, '0')}`;
    const a = {
      type: 'pv-archive', ym, savedAt: new Date().toISOString(),
      carry: [...store.carry.entries()], discipline: store.discipline,
      overrides: { unpaidVac: [...store.overrides.unpaidVac.entries()], maternity: [...store.overrides.maternity.entries()] },
      summary: payrollResult.summary,
      rows: payrollResult.rows.map(r => ({ 사번: r.사번, 성명: r.성명, 소속: r.소속, pay: r.pay, total: r.total, notes: r.notes })),
    };
    const blob = new Blob([JSON.stringify(a, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = `급여처리_${ym}.json`; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    toast(`급여처리_${ym}.json 저장 — 기준 폴더에 넣어두면 다음달 자동 로드`, 'ok');
  }

  /* ================= 새 창 (검색기) ================= */
  const WIN_CSS = `
  *{box-sizing:border-box}body{margin:0;font-family:-apple-system,"Segoe UI","Apple SD Gothic Neo","Noto Sans KR",sans-serif;background:var(--bg);color:var(--tx);font-size:12.5px}
  :root{--bg:#eef1f7;--su:#fff;--su2:#f5f8fd;--bd:#e2e8f2;--tx:#1c2436;--tx2:#5a6579;--tx3:#8a94a8;--br:#4f6bff;--ok:#12b76a;--bad:#f04438;--warn:#f79009;--info:#2e90fa;--oks:#e5f7ee;--bads:#fdeceb;--warns:#fdf1df}
  [data-theme=dark]{--bg:#0c0f17;--su:#161b28;--su2:#1b2130;--bd:#252c3c;--tx:#eef2fb;--tx2:#a4afc4;--tx3:#6f7a91;--br:#6d84ff;--ok:#3ddc90;--bad:#ff6b60;--warn:#ffb454;--info:#5aa9ff;--oks:#123123;--bads:#331715;--warns:#33260f}
  .top{background:var(--su);border-bottom:1px solid var(--bd);padding:13px 22px;display:flex;align-items:center;gap:14px;flex-wrap:wrap}
  .top h1{font-size:16px;margin:0;font-weight:800}.top .m{color:var(--tx3);font-size:12px;font-weight:600}
  .top .sp{flex:1}.top .cnt{font-size:12px;color:var(--tx2);font-weight:700}
  .search2 input{width:220px;font-family:inherit;font-size:12.5px;padding:8px 12px;border:1px solid var(--bd);border-radius:9px;background:var(--su2);color:var(--tx)}
  .top button{font-family:inherit;font-weight:700;font-size:12px;border:1px solid var(--bd);background:var(--su2);color:var(--tx2);border-radius:9px;padding:8px 14px;cursor:pointer}
  .top button:hover{border-color:var(--br);color:var(--br)}
  .wrap{padding:16px 22px 70px}
  .chips{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:13px}
  .chip{border:1px solid var(--bd);background:var(--su);color:var(--tx2);font-weight:750;font-size:12px;padding:7px 14px;border-radius:20px;cursor:pointer;font-family:inherit;display:flex;gap:7px;align-items:center;transition:all .15s}
  .chip:hover{border-color:var(--br)}
  .chip.on{background:var(--br);color:#fff;border-color:var(--br)}
  .chip .c-n{font-weight:850;opacity:.9}
  .sum{display:flex;gap:12px;margin-bottom:13px;flex-wrap:wrap}
  .sc{background:var(--su);border:1px solid var(--bd);border-radius:10px;padding:9px 15px}
  .sc .k{font-size:10px;color:var(--tx3);font-weight:700}.sc .v{font-size:19px;font-weight:850}
  .tbl{border:1px solid var(--bd);border-radius:12px;overflow:auto;max-height:calc(100vh - 210px)}
  table{width:100%;border-collapse:collapse;background:var(--su)}
  th{background:var(--su2);color:var(--tx3);font-size:10.5px;text-transform:uppercase;letter-spacing:.02em;padding:10px 10px;text-align:right;position:sticky;top:0;z-index:2;border-bottom:1px solid var(--bd);white-space:nowrap;cursor:pointer;user-select:none}
  th.l{text-align:left}th:hover{color:var(--br)}th .ar{font-size:9px;margin-left:3px;color:var(--br)}
  th.filtered{color:var(--br)}th.filtered::after{content:"⚲";margin-left:3px}
  td{padding:8px 10px;border-bottom:1px solid var(--bd);text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
  td.l{text-align:left}tr:last-child td{border-bottom:none}
  tbody tr:hover{background:var(--su2)}
  .rbad{background:var(--bads)}.rbad:hover{background:var(--bads)}
  .tot{font-weight:800}
  .note{color:var(--tx2);font-size:11px;text-align:left;white-space:normal;min-width:220px;max-width:360px;line-height:1.5}
  .tag{display:inline-block;padding:1px 7px;border-radius:20px;font-size:10px;font-weight:800;margin:1px 2px 1px 0}
  .tag.ilhal{background:var(--warns);color:var(--warn)}.tag.sp{background:#eef;color:var(--br)}
  .tag.warn{background:var(--warns);color:var(--warn)}.tag.diff{background:var(--bads);color:var(--bad)}
  .pill{padding:2px 9px;border-radius:20px;font-size:11px;font-weight:800}.pill.ok{background:var(--oks);color:var(--ok)}.pill.bad{background:var(--bads);color:var(--bad)}
  .dpos{color:var(--bad);font-weight:800}.dneg{color:var(--info);font-weight:800}
  .ctx{position:fixed;z-index:60;background:var(--su);border:1px solid var(--bd);border-radius:10px;box-shadow:0 14px 34px rgba(0,0,0,.28);padding:6px;min-width:200px}
  .ctx button{display:block;width:100%;text-align:left;border:none;background:none;color:var(--tx);font-family:inherit;font-size:12.5px;padding:8px 10px;border-radius:7px;cursor:pointer;font-weight:650}
  .ctx button:hover{background:var(--su2)}
  .ctx .cf{padding:7px 8px}.ctx .cf label{font-size:10px;color:var(--tx3);font-weight:700;display:block;margin-bottom:5px}
  .ctx .cf input{width:100%;font-family:inherit;font-size:12px;padding:7px 9px;border:1px solid var(--bd);border-radius:7px;background:var(--su2);color:var(--tx)}
  .empty2{padding:40px;text-align:center;color:var(--tx3);font-weight:600}
  tr.clickrow{cursor:pointer}
  .dov{position:fixed;inset:0;z-index:80;background:rgba(10,15,25,.5);display:grid;place-items:center;padding:20px}
  .dcard{background:var(--su);border:1px solid var(--bd);border-radius:16px;box-shadow:0 24px 60px rgba(0,0,0,.4);width:min(760px,96vw);max-height:90vh;overflow:auto}
  .dhead{padding:14px 18px;border-bottom:1px solid var(--bd);font-size:13px;color:var(--tx2);display:flex;align-items:center;gap:8px;position:sticky;top:0;background:var(--su)}
  .dhead b{color:var(--tx);font-size:15px}.dhead .dx{margin-left:10px;cursor:pointer;color:var(--tx3);font-weight:800;font-size:16px}
  .dhead .dexp{margin-left:auto;cursor:pointer;color:var(--br);font-weight:700;font-size:12px;padding:4px 10px;border:1px solid var(--br);border-radius:7px}.dhead .dexp:hover{background:var(--br);color:#fff}
  .dbody{padding:14px 18px}
  .dcontract{background:var(--su2);border:1px solid var(--bd);border-radius:10px;padding:10px 12px;margin-bottom:12px;font-size:11.5px;color:var(--tx2);line-height:1.7}
  .dcontract b{color:var(--tx)}
  .dseg{font-size:11.5px;color:var(--warn);font-weight:700;margin-bottom:10px}
  .dsub{font-size:11px;color:var(--tx3);font-weight:800;margin:14px 0 6px;text-transform:uppercase;letter-spacing:.03em}
  table.dt{width:100%;border-collapse:collapse;border:1px solid var(--bd);border-radius:10px;overflow:hidden}
  table.dt th{position:static;background:var(--su2);padding:8px 10px;font-size:10px}
  table.dt td{padding:8px 10px}
  table.dt td.fm{color:var(--tx3);font-size:11px;white-space:normal}
  table.dt tr.dd td{background:var(--bads)}
  .dtot{display:flex;justify-content:space-between;margin-top:12px;padding:11px 13px;background:var(--su2);border-radius:10px;font-weight:800;font-size:13px}
  .dtot .dpos{color:var(--bad)}.dtot .dneg{color:var(--info)}
  .dnote{margin-top:12px;font-size:12px;color:var(--tx2);background:var(--su2);border-radius:9px;padding:10px 12px}
  .dback{font-size:11.5px;color:var(--tx2);background:var(--su2);border:1px solid var(--bd);border-radius:9px;padding:10px 12px;line-height:1.7}
  @media print{.top button,.chips,.search2{display:none}.tbl{max-height:none;overflow:visible}th{position:static}}
  `;

  // 팝업 내부 런타임(문자열로 주입되어 팝업 컨텍스트에서 실행)
  function popupRuntime() {
    const D = window.__D, doc = document;
    const st = { chip: null, q: '', sort: null, dir: 1, colf: {} };
    const norm = v => (v == null ? '' : '' + v).toLowerCase();
    const tb = doc.getElementById('tb'), thead = doc.getElementById('thead');
    // ── 계산근거 텍스트 리포트 (캡쳐 대체용 내보내기) ──
    function repText(d) {
      const nf = n => n == null ? '' : (+n).toLocaleString('ko-KR');
      const L = [];
      L.push('■ ' + d.사번 + '  ' + (d.성명 || ''));
      L.push('적용 연봉계약: ' + (d.연봉일자 || '-'));
      const yb = Object.keys(d.연봉 || {}).filter(k => d.연봉[k]).map(k => k + ' ' + nf(d.연봉[k])).join(' · ');
      L.push('연봉항목: ' + (yb || '없음'));
      if (d.ilhal && d.segments && d.segments.length) L.push('일할 근무구간: ' + d.segments.map(s => s.label + ' ' + s.days + '일').join(' → '));
      L.push('');
      L.push('[항목별 계산]  항목 | 계산식 | 계산 | 대장 | 차이');
      (d.items || []).forEach(it => { const df = it.ours - it.led; L.push('  ' + it.col + ' | ' + (it.formula || '') + ' | ' + nf(it.ours) + ' | ' + nf(it.led) + ' | ' + (df ? (df > 0 ? '+' : '') + nf(df) : '0')); });
      if (d.extras && d.extras.length) { L.push(''); L.push('[조정·가감 내역]'); d.extras.forEach(e => L.push('  ' + e.label + ': ' + (e.amount == null ? '—' : nf(e.amount)))); }
      const td = d.ourTotal - d.ledTotal;
      L.push('');
      L.push('[총액·세전] 계산 ' + nf(d.ourTotal) + ' / 대장 ' + nf(d.ledTotal) + ' / 차이 ' + (td ? (td > 0 ? '+' : '') + nf(td) : '일치'));
      if (d.notes && d.notes.length) L.push('[비고] ' + d.notes.join(' · '));
      const mu = d.matUnpaid;
      const impTxt = v => {
        if (!v.impact) return '';
        if (v.impact === '감액' && v.amt) return '  ← 감액 ' + nf(v.amt);
        if (v.impact === '추가지급' && v.amt) return '  ← 추가지급 +' + nf(v.amt);
        if (v.impact === '익월공제') return '  ← 익월공제';
        if (v.impact === '유급지급') return '  ← 유급지급';
        return '';
      };
      if (d.발령 && d.발령.length) { L.push(''); L.push('[백데이터·발령]  (★=이번달 반영)'); d.발령.forEach(o => L.push('  ' + (o.aff ? '★ ' : '  ') + (o.시작일 || '') + ' ' + (o.구분 || '') + (o.퇴직일 ? ' (퇴직일 ' + o.퇴직일 + ')' : ''))); }
      if (d.휴가 && d.휴가.length) { L.push(''); L.push('[백데이터·휴가]' + (mu ? ` (출산/유사산 무급 ${mu.start}~${mu.end})` : '') + '  (★=이번달 반영)'); d.휴가.forEach(v => L.push('  ' + (v.aff ? '★ ' : '  ') + (v.시작일 || '') + (v.종료일 && v.종료일 !== v.시작일 ? '~' + v.종료일 : '') + ' ' + (v.종류 || '') + ' ' + (v.일수 || '') + '일' + (v.tag ? ' [' + v.tag + ']' : '') + impTxt(v))); }
      return L.join('\n');
    }
    function dl(name, text) { const b = new Blob([text], { type: 'text/plain;charset=utf-8' }); const a = doc.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; doc.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1500); }
    function exportOne(d) { dl(`검증상세_${D.ym || ''}_${d.사번}_${(d.성명 || '')}.txt`, `[검증 상세]  ${D.title || ''}  ${D.meta || ''}\n${'='.repeat(46)}\n\n` + repText(d)); }
    function exportAll() {
      const rs = D.rows.filter(r => r.detail);
      if (!rs.length) { alert('상세 내역이 없습니다'); return; }
      const head = `[검증 상세 전체]  ${D.title || ''}  ${D.meta || ''}  ·  ${rs.length}명\n${'='.repeat(46)}\n\n`;
      dl(`검증상세전체_${D.ym || ''}.txt`, head + rs.map(r => repText(r.detail)).join('\n\n' + '-'.repeat(46) + '\n\n'));
    }
    { const eb = doc.getElementById('expAll'); if (eb) eb.onclick = exportAll; }
    function match(r) {
      if (st.chip && !r.flags[st.chip]) return false;
      if (st.q) { const s = st.q.toLowerCase(); if (!D.columns.some(c => norm(r.vals[c.key]).includes(s))) return false; }
      for (const k in st.colf) { if (st.colf[k] && !norm(r.vals[k]).includes(st.colf[k].toLowerCase())) return false; }
      return true;
    }
    function render() {
      let rows = D.rows.filter(match);
      if (st.sort) { const c = D.columns.find(x => x.key === st.sort); rows = rows.slice().sort((a, b) => { let x = a.vals[st.sort], y = b.vals[st.sort]; if (c && c.kind === 'num') return ((+x || 0) - (+y || 0)) * st.dir; return norm(x) < norm(y) ? -st.dir : norm(x) > norm(y) ? st.dir : 0; }); }
      tb.innerHTML = rows.length ? rows.map(r => '<tr class="' + (r.cls || '') + (r.detail ? ' clickrow' : '') + '" data-i="' + D.rows.indexOf(r) + '">' + D.columns.map(c => {
        if (c.kind === 'tags') return '<td class="l note">' + (r.tagsHtml || '') + '</td>';
        let v = r.vals[c.key];
        let disp = c.kind === 'num' ? (v ? (+v).toLocaleString('ko-KR') : '<span style="color:var(--tx3)">·</span>') : (v == null ? '' : ('' + v));
        return '<td class="' + (c.align === 'l' ? 'l' : '') + (c.tot ? ' tot' : '') + (c.cls ? ' ' + c.cls(r) : '') + '">' + disp + '</td>';
      }).join('') + '</tr>').join('') : '<tr><td class="empty2" colspan="' + D.columns.length + '">일치하는 항목이 없습니다</td></tr>';
      doc.getElementById('cnt').textContent = rows.length + '명';
      D.chips.forEach(ch => { const e = doc.getElementById('chip-' + ch.k); if (e) e.querySelector('.c-n').textContent = (ch.k === 'all' ? D.rows.length : D.rows.filter(r => r.flags[ch.flag]).length); });
      thead.querySelectorAll('th').forEach(th => { const k = th.dataset.key; const ar = th.querySelector('.ar'); if (ar) ar.textContent = k === st.sort ? (st.dir > 0 ? '▲' : '▼') : ''; th.classList.toggle('filtered', !!st.colf[k]); });
    }
    thead.querySelectorAll('th').forEach(th => {
      const k = th.dataset.key; if (!k) return;
      th.onclick = () => { if (st.sort === k) st.dir = -st.dir; else { st.sort = k; st.dir = 1; } render(); };
      th.oncontextmenu = e => { e.preventDefault(); showCtx(e.clientX, e.clientY, k, th.textContent.replace(/[▲▼⚲]/g, '').trim()); };
    });
    function closeCtx() { const e = doc.getElementById('ctx'); if (e) e.remove(); }
    function showCtx(x, y, k, label) {
      closeCtx();
      const m = doc.createElement('div'); m.className = 'ctx'; m.id = 'ctx';
      m.innerHTML = '<button data-a="asc">▲ 오름차순 정렬</button><button data-a="desc">▼ 내림차순 정렬</button>'
        + '<div class="cf"><label>필터검색 (부분일치)</label><input id="cfi" placeholder="' + label + ' 검색" value="' + (st.colf[k] || '') + '"></div>'
        + '<button data-a="clear">✕ 이 열 필터 해제</button>';
      doc.body.appendChild(m);
      const rc = m.getBoundingClientRect();
      m.style.left = Math.min(x, innerWidth - rc.width - 8) + 'px'; m.style.top = Math.min(y, innerHeight - rc.height - 8) + 'px';
      m.querySelector('[data-a=asc]').onclick = () => { st.sort = k; st.dir = 1; render(); closeCtx(); };
      m.querySelector('[data-a=desc]').onclick = () => { st.sort = k; st.dir = -1; render(); closeCtx(); };
      m.querySelector('[data-a=clear]').onclick = () => { delete st.colf[k]; render(); closeCtx(); };
      const inp = m.querySelector('#cfi'); inp.oninput = () => { st.colf[k] = inp.value; render(); }; setTimeout(() => inp.focus(), 10);
    }
    doc.addEventListener('click', e => { if (!e.target.closest('.ctx') && !e.target.closest('th')) closeCtx(); });
    // 행 클릭 → 상세(계산 vs 대장)
    tb.onclick = e => { const tr = e.target.closest('tr[data-i]'); if (!tr) return; const r = D.rows[+tr.dataset.i]; if (r && r.detail) openDetail(r.detail); };
    function openDetail(d) {
      const nf = n => n == null ? '' : (+n).toLocaleString('ko-KR');
      const 연봉H = Object.keys(d.연봉 || {}).filter(k => d.연봉[k]).map(k => k + ' <b>' + nf(d.연봉[k]) + '</b>').join(' · ') || '연봉정보 없음';
      const segH = (d.ilhal && d.segments && d.segments.length) ? '<div class="dseg">⏱ 일할 근무구간: ' + d.segments.map(s => s.label + ' ' + s.days + '일').join(' → ') + '</div>' : '';
      const itemsH = d.items.map(it => { const diff = it.ours - it.led; return '<tr class="' + (diff ? 'dd' : '') + '"><td class="l">' + it.col + '</td><td class="l fm">' + (it.formula || '') + '</td><td>' + (it.ours ? nf(it.ours) : '·') + '</td><td>' + (it.led ? nf(it.led) : '·') + '</td><td class="' + (diff > 0 ? 'dpos' : diff < 0 ? 'dneg' : '') + '">' + (diff ? (diff > 0 ? '+' : '') + nf(diff) : '0') + '</td></tr>'; }).join('');
      const extraH = (d.extras && d.extras.length) ? '<div class="dsub">조정·가감 내역</div><table class="dt"><tbody>' + d.extras.map(e => '<tr><td class="l">' + e.label + '</td><td>' + (e.amount == null ? '—' : nf(e.amount)) + '</td></tr>').join('') + '</tbody></table>' : '';
      const mu = d.matUnpaid;
      const tagHtml = t => t ? ' <b style="color:' + (t === '무급' ? 'var(--bad)' : t === '혼재' ? 'var(--warn)' : 'var(--ok)') + '">[' + t + ']</b>' : '';
      const impHtml = v => {  // 이번달 급여 영향: 감액(빨강 −) / 추가지급(초록 +) / 익월공제·유급지급(회색)
        if (!v.impact) return '';
        if (v.impact === '감액' && v.amt) return ' <b style="color:var(--bad)">감액 ' + nf(v.amt) + '</b>';
        if (v.impact === '추가지급' && v.amt) return ' <b style="color:var(--ok)">추가지급 +' + nf(v.amt) + '</b>';
        if (v.impact === '익월공제') return ' <span style="color:var(--warn)">익월공제</span>';
        if (v.impact === '유급지급') return ' <span style="color:var(--tx3)">유급지급</span>';
        return '';
      };
      const affWrap = (html, aff) => aff ? '<span style="font-weight:800;text-decoration:underline;text-decoration-color:var(--br);text-underline-offset:2px">' + html + '</span>' : html;
      const matLegend = mu ? '<span style="font-size:11px;color:var(--tx3)"> · 출산/유사산 무급 ' + mu.start + '~' + mu.end + '</span>' : '';
      const balH = ((d.발령 && d.발령.length) || (d.휴가 && d.휴가.length)) ? '<div class="dsub">고려한 백데이터 (발령·휴가)' + matLegend + ' <span style="font-size:11px;color:var(--br);font-weight:700">— 밑줄=이번달 반영</span></div><div class="dback">'
        + (d.발령 || []).map(o => affWrap('📋 ' + (o.시작일 || '') + ' ' + (o.구분 || '') + (o.퇴직일 ? ' (퇴직일 ' + o.퇴직일 + ')' : ''), o.aff)).join('<br>')
        + ((d.발령 && d.발령.length && d.휴가 && d.휴가.length) ? '<br>' : '')
        + (d.휴가 || []).map(v => affWrap('🏖 ' + (v.시작일 || '') + (v.종료일 && v.종료일 !== v.시작일 ? '~' + v.종료일 : '') + ' ' + (v.종류 || '') + ' ' + (v.일수 || '') + '일' + tagHtml(v.tag) + impHtml(v), v.aff)).join('<br>')
        + '</div>' : '';
      const totDiff = d.ourTotal - d.ledTotal;
      const totH = '<div class="dtot"><span>총액 (세전)</span><span>계산 ' + nf(d.ourTotal) + ' &nbsp;/&nbsp; 대장 ' + nf(d.ledTotal) + ' &nbsp; <span class="' + (totDiff > 0 ? 'dpos' : totDiff < 0 ? 'dneg' : '') + '">' + (totDiff ? (totDiff > 0 ? '+' : '') + nf(totDiff) : '일치') + '</span></span></div>';
      const notesH = (d.notes && d.notes.length) ? '<div class="dnote">📌 ' + d.notes.join(' · ') + '</div>' : '';
      const ov = doc.createElement('div'); ov.className = 'dov';
      ov.innerHTML = '<div class="dcard"><div class="dhead"><b>' + d.사번 + ' ' + (d.성명 || '') + '</b> 계산 근거 (연봉 → 월급여 · 세전)<span class="dexp" title="이 사람의 계산근거·백데이터를 파일로 저장">⬇ 내보내기</span><span class="dx">✕</span></div><div class="dbody">'
        + '<div class="dcontract">📄 적용 연봉계약 <b>' + (d.연봉일자 || '-') + '</b><br>' + 연봉H + '</div>'
        + segH
        + '<div class="dsub">항목별 계산</div><table class="dt"><thead><tr><th class="l">항목</th><th class="l">계산식</th><th>계산</th><th>대장</th><th>차이</th></tr></thead><tbody>' + itemsH + '</tbody></table>'
        + extraH + totH + balH + notesH + '</div></div>';
      ov.onclick = e => { if (e.target === ov || e.target.className === 'dx') ov.remove(); };
      ov.querySelector('.dexp').onclick = e => { e.stopPropagation(); exportOne(d); };
      doc.body.appendChild(ov);
    }
    doc.getElementById('gs').oninput = e => { st.q = e.target.value; render(); };
    doc.querySelectorAll('.chip').forEach(c => c.onclick = () => { const k = c.dataset.k; st.chip = (k === 'all' ? null : k); doc.querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x.dataset.k === (st.chip || 'all'))); render(); });
    render();
  }

  function openSearchWin(title, meta, columns, rows, chips, sumHTML, ym) {
    const w = window.open('', '_blank');
    if (!w) { toast('팝업이 차단되었습니다. 팝업 허용 후 다시 시도하세요.', 'bad'); return; }
    const head = '<tr>' + columns.map(c => `<th class="${c.align === 'l' ? 'l' : ''}" data-key="${c.key}">${esc(c.label)}<span class="ar"></span></th>`).join('') + '</tr>';
    const chipHTML = chips.map(ch => `<button class="chip${ch.k === 'all' ? ' on' : ''}" data-k="${ch.k}" id="chip-${ch.k}">${esc(ch.label)} <span class="c-n"></span></button>`).join('');
    const hasDetail = rows.some(r => r.detail);
    const payload = { columns, rows, chips, title, meta, ym: ym || '' };
    const body = `<div class="top"><h1>${esc(title)}</h1><span class="m">${esc(meta)}</span><span class="cnt" id="cnt"></span><span class="sp"></span>
        <div class="search2"><input id="gs" placeholder="🔍 전체 검색 (부분일치)"></div>
        ${hasDetail ? '<button id="expAll" title="현재 목록 전원의 계산근거·백데이터를 텍스트 파일 1개로 저장">⬇ 상세 전체 내보내기</button>' : ''}
        <button onclick="window.print()">인쇄 / PDF</button></div>`;
    const bodyRest = `
      <div class="wrap">${sumHTML || ''}<div class="chips">${chipHTML}</div>
      <div class="tbl"><table><thead id="thead">${head}</thead><tbody id="tb"></tbody></table></div>
      <div style="margin-top:10px;font-size:11px;color:var(--tx3)">헤더 <b>우클릭</b> = 정렬·열 필터검색 · 헤더 클릭 = 정렬 · 상단 칩/검색 = 필터</div></div>
      <script>window.__D=${JSON.stringify(payload)};(${popupRuntime.toString()})();<\/script>`;
    w.document.write(`<!DOCTYPE html><html data-theme="${curTheme()}"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${WIN_CSS}</style></head><body>${body}${bodyRest}</body></html>`);
    w.document.close();
  }

  function usedItemCols(rows) {
    const set = new Set();
    rows.forEach(r => Object.keys(r.pay || {}).forEach(k => { if (r.pay[k]) set.add(k); }));
    const cols = PV.LEDGER_ITEMS.filter(c => set.has(c));
    [...set].forEach(c => { if (!cols.includes(c)) cols.push(c); });
    return cols;
  }
  // 검증 상세: 계산 근거(연봉→계산식→값) 구성
  const SRC_OF = { 기본급: '기본급', 능력급: '실적급', 성과급: '성과급', 성과가급: '성과가급', 변동역량가급1: '변동역량1', 변동역량가급2: '변동역량2' };
  function buildDetail(r) {
    const t = r.trace || {}, 연봉 = t.연봉 || {}, nf = n => Math.round(n || 0).toLocaleString('ko-KR');
    const cols = [...new Set([...PV.LEDGER_ITEMS, ...Object.keys(r.ours || {}), ...Object.keys(r.led || {})])].filter(c => ((r.ours && r.ours[c]) || (r.led && r.led[c])));
    const items = cols.map(c => {
      const ours = Math.round((r.ours && r.ours[c]) || 0), led = Math.round((r.led && r.led[c]) || 0);
      let f = '';
      if (SRC_OF[c]) {
        const ann = 연봉[SRC_OF[c]] || 0;
        if (c === '성과가급') f = t.quarterMonth ? `(${nf(ann)} ÷ 12 절상) × 3 (분기)` : '분기 비지급월';
        else f = `${nf(ann)} ÷ 12`;
        if (t.ilhal && c !== '성과가급') f += ' × 일할';
        if (c === '변동역량가급1' && t.is14) f += ' + 14명특례 500,000';
      } else if (c === '고정역량가급') f = `직책수당 ${t.dutyLabel || ''} ${nf(t.dutyFlat || 0)}` + (t.ilhal ? ' × 일할' : '');
      else if (c === '감액') f = (t.uvac ? `무급휴가 ${t.uvac}일 −${nf(t.uvacDeduct)}` : '') + ((r.notes || []).some(n => n.includes('감봉')) ? ' + 감봉' : '');
      else f = '업로드/기타 항목';
      return { col: c, ours, led, formula: f };
    });
    // ── 백데이터 유급/무급 + 이번달 급여 영향(감액/추가지급) 계산 ──
    const ym = (t.year && t.month) ? `${t.year}-${String(t.month).padStart(2, '0')}` : '';
    const pmObj = (t.year && t.month) ? (t.month === 1 ? { y: t.year - 1, m: 12 } : { y: t.year, m: t.month - 1 }) : null;
    const pm = pmObj ? `${pmObj.y}-${String(pmObj.m).padStart(2, '0')}` : '';
    const monthStartISO = ym ? ym + '-01' : '';
    const isUnpaidVac = k => /무급휴가|가족돌봄|보건|생리/.test(k || '');
    const isMat = k => /출산|유사산/.test(k || '');
    const mu = t.matUnpaid;
    let fullG = (t.dutyFlat || 0) + (t.is14 ? 500000 : 0);
    Object.values(연봉).forEach(v => fullG += (+v || 0) / 12);
    const dayRate = Math.round(fullG / 30);
    const 휴가 = (t.휴가 || []).map(v => {
      const k = v.종류 || '', s = v.시작일 || '', e = v.종료일 || s, sm = s.slice(0, 7);
      let tag = '유급', aff = false, impact = '', amt = 0;
      if (isMat(k)) {
        const unpaidDay = mu && s >= mu.start && s <= mu.end;
        tag = mu && unpaidDay ? '무급' : (mu && s <= mu.end && e >= mu.start ? '혼재' : '유급');
        if (sm === ym) { aff = true; if (unpaidDay) { impact = '감액'; amt = -dayRate; } else impact = '유급지급'; }
      } else if (isUnpaidVac(k)) {
        tag = '무급';
        if (sm === pm) { aff = true; impact = '감액'; amt = t.uvac ? -Math.round((t.uvacDeduct || 0) / t.uvac) : 0; }
        else if (sm === ym) { aff = true; impact = '익월공제'; }
      } else if (sm === ym) { aff = true; impact = '유급지급'; }
      return { 종류: k, 시작일: s, 종료일: v.종료일, 일수: v.일수, tag, aff, impact, amt };
    });
    let baselineDate = null;
    (t.발령 || []).forEach(o => { if (monthStartISO && (o.시작일 || '') < monthStartISO) baselineDate = o.시작일; });
    const 발령 = (t.발령 || []).map(o => {
      const sm = (o.시작일 || '').slice(0, 7);
      const aff = (ym && sm === ym) || o.시작일 === baselineDate || ((o.퇴직일 || '').slice(0, 7) === ym);
      return { 구분: o.구분, 시작일: o.시작일, 퇴직일: o.퇴직일, aff };
    });
    return { 사번: r.사번, 성명: r.성명, 연봉일자: t.연봉일자, 연봉: 연봉, quarterMonth: t.quarterMonth, ilhal: t.ilhal, segments: t.segments || [], items, extras: t.extras || [], dutyLabel: t.dutyLabel, dutyFlat: t.dutyFlat, uvac: t.uvac, uvacDeduct: t.uvacDeduct, 발령: 발령, 휴가: 휴가, matUnpaid: t.matUnpaid || null, ym, ourTotal: r.ourTotal, ledTotal: r.ledTotal, notes: r.notes || [] };
  }
  const tagHTML = notes => (notes || []).map(n => `<span class="tag ${n.startsWith('일할') ? 'ilhal' : n.includes('확인') ? 'warn' : 'sp'}">${esc(n)}</span>`).join('');
  const flagsOf = r => ({ ilhal: (r.notes || []).some(n => n.startsWith('일할')), special: (r.notes || []).some(n => n.includes('특례') || n.includes('소급') || n.includes('임금피크') || n.includes('정직') || n.includes('감봉')), warn: !!r.warn });

  function openPayrollWindow() {
    const res = payrollResult; if (!res) { toast('먼저 급여계산을 실행하세요', 'bad'); return; }
    if (res.blocked) { const w = window.open('', '_blank'); if (w) { w.document.write(`<!DOCTYPE html><html data-theme="${curTheme()}"><head><meta charset="utf-8"><style>${WIN_CSS}</style></head><body><div class="top"><h1>급여계산 차단</h1></div><div class="wrap"><div class="tbl"><table><thead><tr><th class="l">사번</th><th class="l">사유</th><th class="l">필요 연봉일자</th></tr></thead><tbody>${res.block.map(b => `<tr class="rbad"><td class="l">${esc(b.사번)}</td><td class="l">${esc(b.reason)}</td><td class="l">${esc(b.일자)}</td></tr>`).join('')}</tbody></table></div></div></body></html>`); w.document.close(); } return; }
    const items = usedItemCols(res.rows);
    if (!items.includes('감액')) items.push('감액'); // 감액 컬럼 항상 표시
    const ym = `${res.target.y}-${String(res.target.m).padStart(2, '0')}`;
    const columns = [{ key: 'no', label: 'No', align: 'l' }, { key: '사번', label: '사번', align: 'l' }, { key: '성명', label: '성명', align: 'l' }, { key: '소속', label: '소속', align: 'l' },
      ...items.map(c => ({ key: c, label: c, kind: 'num' })), { key: 'total', label: '총액', kind: 'num', tot: true }, { key: '비고', label: '비고', align: 'l', kind: 'tags' }];
    const rows = res.rows.map((r, i) => ({ vals: Object.assign({ no: i + 1, 사번: r.사번, 성명: r.성명, 소속: r.소속, total: r.total, 비고: (r.notes || []).join(' ') }, items.reduce((o, c) => (o[c] = r.pay[c] || 0, o), {})), tagsHtml: tagHTML(r.notes) || '<span style="color:var(--tx3)">—</span>', flags: flagsOf(r) }));
    const chips = [{ k: 'all', label: '전체' }, { k: 'ilhal', label: '일할', flag: 'ilhal' }, { k: 'special', label: '특이', flag: 'special' }, { k: 'warn', label: '점검', flag: 'warn' }];
    const sumHTML = `<div class="sum"><div class="sc"><div class="k">대상</div><div class="v">${res.summary.total}</div></div><div class="sc"><div class="k">일할</div><div class="v">${res.summary.ilhal}</div></div><div class="sc"><div class="k">특이</div><div class="v">${res.summary.special}</div></div><div class="sc"><div class="k">점검</div><div class="v">${res.summary.warn}</div></div></div>`;
    openSearchWin(`급여명세 ${ym}`, `${ym} · 지급일 ${res.payday}`, columns, rows, chips, sumHTML, ym);
  }

  function openVerifyWindow() {
    const res = verifyResult; if (!res) { toast('먼저 검증을 실행하세요', 'bad'); return; }
    const ym = `${res.target.y}-${String(res.target.m).padStart(2, '0')}`;
    const columns = [{ key: 'no', label: 'No', align: 'l' }, { key: '사번', label: '사번', align: 'l' }, { key: '성명', label: '성명', align: 'l' }, { key: '소속', label: '소속', align: 'l' },
      { key: 'ourTotal', label: '계산총액', kind: 'num' }, { key: 'ledTotal', label: '대장총액', kind: 'num' }, { key: 'diff', label: '차이', kind: 'num', cls: r => r.vals.diff > 0 ? 'dpos' : r.vals.diff < 0 ? 'dneg' : '' },
      { key: '상태', label: '상태', align: 'l' }, { key: '비고', label: '비고 (특이/불일치)', align: 'l', kind: 'tags' }];
    const rows = res.rows.map((r, i) => {
      const diff = r.ourTotal - r.ledTotal;
      const diffTags = (r.diffs || []).filter(d => d.col !== '—').map(d => `<span class="tag diff">${esc(d.col)} ${d.diff > 0 ? '+' : ''}${won(d.diff)}</span>`).join('');
      const noteTags = (r.notes || []).filter(n => !n.startsWith('불일치')).map(n => `<span class="tag ${n.startsWith('일할') ? 'ilhal' : 'sp'}">${esc(n)}</span>`).join('');
      return { cls: r.status === 'bad' ? 'rbad' : '', vals: { no: i + 1, 사번: r.사번, 성명: r.성명, 소속: r.소속, ourTotal: r.ourTotal, ledTotal: r.ledTotal, diff, 상태: r.status === 'ok' ? '일치' : '불일치', 비고: ((r.diffs || []).map(d => d.col).join(' ') + ' ' + (r.notes || []).join(' ')) },
        tagsHtml: (diffTags + noteTags) || (r.status === 'ok' ? '<span class="pill ok">일치</span>' : ''), flags: { bad: r.status === 'bad', ok: r.status === 'ok', warn: !!r.warn },
        detail: buildDetail(r) };
    });
    const chips = [{ k: 'all', label: '전체' }, { k: 'bad', label: '불일치', flag: 'bad' }, { k: 'ok', label: '일치', flag: 'ok' }, { k: 'warn', label: '점검', flag: 'warn' }];
    const sumHTML = `<div class="sum"><div class="sc"><div class="k">대상</div><div class="v">${res.summary.total}</div></div><div class="sc"><div class="k" style="color:var(--ok)">일치</div><div class="v" style="color:var(--ok)">${res.summary.ok}</div></div><div class="sc"><div class="k" style="color:var(--bad)">불일치</div><div class="v" style="color:var(--bad)">${res.summary.bad}</div></div></div>`;
    openSearchWin(`검증결과 ${ym}`, `${ym} · 계산 vs 급여대장(세전)`, columns, rows, chips, sumHTML, ym);
  }

  /* ================= 엑셀 export ================= */
  function exportPayroll() {
    const res = payrollResult; if (!res || res.blocked) return;
    const cols = usedItemCols(res.rows), wb = XLSX.utils.book_new(), ym = `${res.target.y}-${String(res.target.m).padStart(2, '0')}`;
    const aoa = [['No', '사번', '성명', '소속', ...cols, '총액', '비고']];
    res.rows.forEach((r, i) => aoa.push([i + 1, r.사번, r.성명, r.소속, ...cols.map(c => r.pay[c] || 0), r.total, (r.notes || []).join(' / ')]));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), '급여명세');
    const alr = [['구분', '제목', '내용']], lv = { block: '차단', warn: '점검', info: '내역', ok: '정상', bad: '불일치' };
    res.alerts.forEach(a => alr.push([lv[a.level] || a.level, a.title, a.desc || '']));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(alr), '점검·특이');
    XLSX.writeFile(wb, `급여명세_${ym}.xlsx`); toast('급여명세 엑셀 저장', 'ok');
  }
  function exportVerify() {
    const res = verifyResult; if (!res) return;
    const wb = XLSX.utils.book_new(), ym = `${res.target.y}-${String(res.target.m).padStart(2, '0')}`;
    const sum = [['No', '사번', '성명', '소속', '상태', '계산총액', '대장총액', '차이', '비고']];
    res.rows.forEach((r, i) => sum.push([i + 1, r.사번, r.성명, r.소속, r.status === 'ok' ? '일치' : '불일치', r.ourTotal, r.ledTotal, r.ourTotal - r.ledTotal, (r.notes || []).join(' / ')]));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sum), '검증요약');
    const det = [['사번', '성명', '항목', '계산값', '대장값', '차이']];
    res.rows.filter(r => r.status === 'bad').forEach(r => (r.diffs || []).forEach(d => det.push([r.사번, r.성명, d.col, d.ours, d.led, d.diff])));
    if (det.length === 1) det.push(['—', '불일치 없음', '', '', '', '']);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(det), '불일치상세');
    XLSX.writeFile(wb, `급여검증_${ym}.xlsx`); toast('검증결과 엑셀 저장', 'ok');
  }

  renderFolder();
})(window.PV);
