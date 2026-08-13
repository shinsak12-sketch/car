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
    resolutions: new Map(), // 전월 처리내역(사번 → {review, processedMode}) — 이번달 소급 계산 시 반영
  };
  let payrollResult = null, verifyResult = null;

  /* ---------- theme / reset ---------- */
  const THEME_KEY = 'pv-theme';
  const curTheme = () => document.documentElement.getAttribute('data-theme') || 'light';
  function setTheme(t) { document.documentElement.setAttribute('data-theme', t); try { localStorage.setItem(THEME_KEY, t); } catch (e) {} }
  (function () { let t = 'light'; try { t = localStorage.getItem(THEME_KEY) || 'light'; } catch (e) {} setTheme(t); })();
  $('#themeBtn').onclick = () => setTheme(curTheme() === 'dark' ? 'light' : 'dark');
  $('#resetBtn').onclick = () => { if (confirm('모든 입력·계산·검증 결과를 초기화할까요?')) location.reload(); };
  { const cb = $('#cfgBtn'); if (cb) cb.onclick = openConfigModal; }

  /* ---------- toast ---------- */
  function toast(msg, kind) {
    const t = el('div', 'toast' + (kind ? ' ' + kind : ''), `<span>${esc(msg)}</span>`);
    $('#toasts').appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(10px)'; setTimeout(() => t.remove(), 300); }, 3000);
  }

  /* ---------- period ---------- */
  (function () {
    const sy = $('#selYear'), sm = $('#selMonth'), now = new Date();
    for (let y = now.getFullYear() + 10; y >= 2023; y--) { const o = el('option'); o.value = y; o.textContent = y + '년'; sy.appendChild(o); }
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
    store.resolutions = new Map(a.resolutions || []); // 전월 검증 처리내역(재계산/후단/정상/오류) → 소급 반영
    toast(`전월(${a.ym}) 처리내역 불러옴 — 이월휴직·징계·검증처리 자동 반영`, 'ok');
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
    if (!store.discipline.length) { box.innerHTML = '<div class="empty">감봉·정직·결근·지각 대상자를 추가하세요</div>'; return; }
    const t = el('table', 'mini');
    t.innerHTML = '<thead><tr><th>사번</th><th>성명</th><th>종류</th><th style="text-align:right">금액</th><th></th></tr></thead>';
    const tb = el('tbody');
    store.discipline.forEach((d, i) => {
      const tr = el('tr');
      tr.innerHTML = `<td><input type="text" value="${esc(d.사번)}" style="width:82px" data-k="사번"></td>
        <td><input type="text" value="${esc(d.성명)}" style="width:60px" data-k="성명"></td>
        <td><select class="inp" data-k="종류">${['감봉', '정직', '결근', '지각'].map(x => `<option ${d.종류 === x ? 'selected' : ''}>${x}</option>`).join('')}</select></td>
        <td style="text-align:right"><input type="number" value="${d.금액 || ''}" style="width:92px;text-align:right" data-k="금액" ${d.종류 === '정직' ? 'disabled placeholder="자동"' : 'placeholder="감액"'}></td>
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
    const { y, m } = target();
    const mmStr = String(m).padStart(2, '0');
    const monthStart = `${y}-${mmStr}-01`;
    const monthEnd = `${y}-${mmStr}-${String(PV.dim(y, m)).padStart(2, '0')}`;
    const orderBy = new Map(); (store.order || []).forEach(o => { if (!orderBy.has(o.사번)) orderBy.set(o.사번, []); orderBy.get(o.사번).push(o); });
    // 이미 퇴직(이번 달 말 이전 퇴직) → 휴직 확인 불필요
    const retiredSet = new Set();
    (store.order || []).forEach(o => { if (/퇴직/.test(o.발령구분 || '')) { const d = o.퇴직일 || o.발령시작일 || ''; if (d && d <= monthEnd) retiredSet.add(o.사번); } });
    // 이미 종료(담당자 입력 종료일이 이번 달 시작 전) → 휴직 확인 불필요
    const ended = sabun => { const cur = store.carry.get(sabun) || {}; return cur.종료일 && cur.종료일 < monthStart; };
    const skip = sabun => retiredSet.has(sabun) || ended(sabun);
    const nameOf = sabun => (store.roster.find(x => x.사번 === sabun) || {}).성명 || '';
    const cand = new Map(); // 사번 → {성명, source, 종류fix, 시작일fix}
    // 이월 휴직 (명부 (휴직) & 발령에 휴직 없음)
    store.roster.forEach(r => {
      if (skip(r.사번)) return;
      if ((r.직무 || '').includes('(휴직)') && !(orderBy.get(r.사번) || []).some(o => /휴직/.test(o.발령구분 || '')))
        cand.set(r.사번, { 성명: r.성명, source: 'carry' });
    });
    // 발령상 "현재" 무급·의병휴직자만 (최신 휴직/복직 발령 기준 — 복직했거나 다른 휴직으로 넘어갔으면 제외)
    //  퇴직했거나(retiredSet) 종료일이 지난 사람은 제외.
    orderBy.forEach((os, sabun) => {
      if (skip(sabun)) return;
      const chain = os.filter(o => /휴직|복직|퇴직/.test(o.발령구분 || '') && o.발령시작일).slice().sort((a, b) => a.발령시작일 < b.발령시작일 ? -1 : 1);
      if (!chain.length) return;
      const last = chain[chain.length - 1];
      if (/퇴직/.test(last.발령구분 || '')) return; // 최신이 퇴직 → 제외
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
  const storeForEngine = () => ({ salary: store.salary, roster: store.roster, order: store.order, vacation: store.vacation, holiday: store.holiday, ledger: store.ledger, uploads: store.uploads, discipline: store.discipline, carry: store.carry, overrides: store.overrides, dutyExtra: store.dutyextra, resolutions: store.resolutions });

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

  /* ---------- ⚙ 기준값(조건값) 설정 ---------- */
  const CFG_DEF = () => PV.CONFIG_DEFAULT || {};
  function openConfigModal() {
    const root = $('#modalRoot');
    let cfg = JSON.parse(JSON.stringify(PV.CONFIG || CFG_DEF()));
    const ov = el('div', 'modal-ov');
    root.appendChild(ov);
    const numI = (k, v, extra) => `<input type="number" data-k="${k}" value="${esc(v)}" ${extra || ''} style="width:130px">`;
    const txtI = (k, v, w) => `<input type="text" data-k="${k}" value="${esc(v)}" style="width:${w || 130}px">`;
    function render() {
      const wageRows = Object.keys(cfg.최저시급 || {}).sort().map(y =>
        `<div class="cfg-r" data-wage-row><input type="text" data-wage-year value="${esc(y)}" style="width:70px" placeholder="연도"><input type="number" data-wage-val value="${esc(cfg.최저시급[y])}" style="width:110px" placeholder="시급"><button class="cfg-del" data-del-wage title="삭제">✕</button></div>`).join('');
      const dutyRows = (cfg.직책수당 || []).map((d, i) =>
        `<div class="cfg-r" data-duty-row><input type="text" data-duty-kw value="${esc(d.키워드)}" style="width:200px" placeholder="키워드(쉼표로 여러개)"><input type="text" data-duty-grade value="${esc(d.직급조건 || '')}" style="width:70px" placeholder="직급"><input type="number" data-duty-amt value="${esc(d.금액)}" style="width:110px" placeholder="금액"><button class="cfg-del" data-del-duty="${i}" title="삭제">✕</button></div>`).join('');
      ov.innerHTML = `<div class="modal cfg-modal"><div class="m-head"><div class="m-ic">⚙</div>
        <div><h3>급여 기준값(조건값) 설정</h3><div class="m-sub">규칙이 바뀌면 여기서 수정하세요. 저장하면 이 브라우저에 기억되고, 급여계산을 다시 실행하면 반영됩니다.</div></div></div>
        <div class="m-body cfg-body">
          <div class="cfg-sec"><div class="cfg-h">지급·기본</div>
            <div class="cfg-f"><label>급여지급일 (매월)</label>${numI('급여지급일', cfg.급여지급일)}</div>
            <div class="cfg-f"><label>성과가급 분기지급월 <span class="cfg-hint">쉼표 구분</span></label>${txtI('_분기월', (cfg.성과가급_분기지급월 || []).join(','), 160)}</div>
          </div>
          <div class="cfg-sec"><div class="cfg-h">최저임금 <span class="cfg-hint">★매년 갱신 — 새 해는 '연도 추가'</span></div>
            <div data-wage-wrap>${wageRows}</div>
            <button class="cfg-add" data-add-wage>+ 연도 추가</button>
            <div class="cfg-f" style="margin-top:8px"><label>최저연봉 월환산계수 <span class="cfg-hint">거의 안 바꿈</span></label>${numI('최저연봉_월환산계수', cfg.최저연봉_월환산계수, 'step="0.0001"')}</div>
          </div>
          <div class="cfg-sec"><div class="cfg-h">출산전후휴가 (법 개정 시)</div>
            <div class="cfg-f"><label>단태아 유급일</label>${numI('출산_단태아_유급일', cfg.출산_단태아_유급일)}</div>
            <div class="cfg-f"><label>다태아 유급일</label>${numI('출산_다태아_유급일', cfg.출산_다태아_유급일)}</div>
            <div class="cfg-f"><label>단태아 법정일</label>${numI('출산_단태아_법정일', cfg.출산_단태아_법정일)}</div>
            <div class="cfg-f"><label>다태아 법정일</label>${numI('출산_다태아_법정일', cfg.출산_다태아_법정일)}</div>
          </div>
          <div class="cfg-sec"><div class="cfg-h">휴직</div>
            <div class="cfg-f"><label>의병휴직 지급률 <span class="cfg-hint">0.8 = 80%</span></label>${numI('의병휴직_지급률', cfg.의병휴직_지급률, 'step="0.01"')}</div>
          </div>
          <div class="cfg-sec"><div class="cfg-h">직책수당 (고정역량가급) <span class="cfg-hint">직책에 키워드 포함 시 금액 지급 · 직급조건 비우면 무관</span></div>
            <div class="cfg-r cfg-r-hd"><span style="width:200px">키워드</span><span style="width:70px">직급</span><span style="width:110px">금액</span></div>
            <div data-duty-wrap>${dutyRows}</div>
            <button class="cfg-add" data-add-duty>+ 규칙 추가</button>
          </div>
          <div class="cfg-sec"><div class="cfg-h">14명 직무변경 특례</div>
            <div class="cfg-f"><label>추가금액(월)</label>${numI('특례_14명_금액', cfg.특례_14명_금액)}</div>
            <div class="cfg-f"><label>적용 발령일</label>${txtI('특례_14명_적용일', cfg.특례_14명_적용일, 130)}</div>
            <div class="cfg-f"><label>전직무 포함어</label>${txtI('특례_14명_전직무', cfg.특례_14명_전직무, 130)}</div>
            <div class="cfg-f"><label>후직무 포함어</label>${txtI('특례_14명_후직무', cfg.특례_14명_후직무, 130)}</div>
            <div class="cfg-f"><label>직급 접두</label>${txtI('특례_14명_직급접두', cfg.특례_14명_직급접두, 80)}</div>
          </div>
        </div>
        <div class="m-foot cfg-foot">
          <button class="btn btn-ghost btn-sm" data-export>⬇ 설정파일(config.js) 내보내기</button>
          <button class="btn btn-ghost btn-sm" data-reset>기본값 복원</button>
          <span style="flex:1"></span>
          <button class="btn btn-ghost btn-sm" data-x>닫기</button>
          <button class="btn btn-primary btn-sm" data-save>저장</button>
        </div></div>`;
      wire();
    }
    function collect() {
      const g = k => ov.querySelector(`[data-k="${k}"]`);
      const gn = k => +g(k).value;
      cfg.급여지급일 = gn('급여지급일') || 20;
      cfg.최저연봉_월환산계수 = gn('최저연봉_월환산계수') || cfg.최저연봉_월환산계수;
      cfg.의병휴직_지급률 = gn('의병휴직_지급률');
      ['출산_단태아_유급일', '출산_다태아_유급일', '출산_단태아_법정일', '출산_다태아_법정일'].forEach(k => cfg[k] = gn(k));
      cfg.성과가급_분기지급월 = (ov.querySelector('[data-k="_분기월"]').value || '').split(',').map(s => +s.trim()).filter(n => n >= 1 && n <= 12);
      const wage = {}; ov.querySelectorAll('[data-wage-row]').forEach(r => { const y = r.querySelector('[data-wage-year]').value.trim(); const v = +r.querySelector('[data-wage-val]').value || 0; if (y) wage[y] = v; }); cfg.최저시급 = wage;
      const duty = []; ov.querySelectorAll('[data-duty-row]').forEach(r => { const kw = r.querySelector('[data-duty-kw]').value.trim(); const gr = r.querySelector('[data-duty-grade]').value.trim(); const amt = +r.querySelector('[data-duty-amt]').value || 0; if (kw) duty.push({ 키워드: kw, 직급조건: gr, 금액: amt }); }); cfg.직책수당 = duty;
      cfg.특례_14명_금액 = gn('특례_14명_금액') || 0;
      cfg.특례_14명_적용일 = g('특례_14명_적용일').value.trim();
      cfg.특례_14명_전직무 = g('특례_14명_전직무').value.trim();
      cfg.특례_14명_후직무 = g('특례_14명_후직무').value.trim();
      cfg.특례_14명_직급접두 = g('특례_14명_직급접두').value.trim();
    }
    function wire() {
      const close = () => ov.remove();
      ov.onclick = e => { if (e.target === ov) close(); };
      ov.querySelector('[data-x]').onclick = close;
      ov.querySelector('[data-add-wage]').onclick = () => { collect(); cfg.최저시급[''] = 0; render(); };
      ov.querySelectorAll('[data-del-wage]').forEach(b => b.onclick = e => { collect(); const y = e.target.closest('[data-wage-row]').querySelector('[data-wage-year]').value.trim(); delete cfg.최저시급[y]; render(); });
      ov.querySelector('[data-add-duty]').onclick = () => { collect(); (cfg.직책수당 = cfg.직책수당 || []).push({ 키워드: '', 직급조건: '', 금액: 0 }); render(); };
      ov.querySelectorAll('[data-del-duty]').forEach(b => b.onclick = e => { collect(); cfg.직책수당.splice(+e.target.dataset.delDuty, 1); render(); });
      ov.querySelector('[data-reset]').onclick = () => { if (confirm('모든 기준값을 기본값으로 되돌릴까요? (저장을 눌러야 최종 적용됩니다)')) { cfg = JSON.parse(JSON.stringify(CFG_DEF())); render(); } };
      ov.querySelector('[data-export]').onclick = () => { collect(); dlText('config.js', genConfigJs(cfg)); toast('config.js 내보냄 — payroll-validator/js/config.js 를 이 파일로 교체하면 됩니다', 'ok'); };
      ov.querySelector('[data-save]').onclick = () => { collect(); PV.saveConfig(cfg); updatePayday(); toast('기준값 저장됨 — 급여계산을 다시 실행하면 반영됩니다', 'ok'); close(); };
    }
    render();
  }
  function dlText(name, text) { const b = new Blob([text], { type: 'text/javascript;charset=utf-8' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1500); }
  function genConfigJs(c) {
    const j = v => JSON.stringify(v);
    const wage = Object.keys(c.최저시급 || {}).sort().map(y => `'${y}': ${+c.최저시급[y] || 0}`).join(', ');
    const duty = (c.직책수당 || []).map(d => `      { 키워드: ${j(d.키워드)}, 직급조건: ${j(d.직급조건 || '')}, 금액: ${+d.금액 || 0} },`).join('\n');
    return `/* ============================================================
   config.js — 급여 계산 '기준값(조건값)' 모음  (프로그램 '⚙ 기준값 설정'에서 생성)
   규칙이 바뀌면 이 값을 수정하거나, 프로그램의 '⚙ 기준값' 화면에서 편집하세요.
   ============================================================ */
window.PV = window.PV || {};
(function (PV) {
  'use strict';
  const DEFAULT = {
    급여지급일: ${+c.급여지급일 || 20},
    최저시급: { ${wage} },
    최저연봉_월환산계수: ${+c.최저연봉_월환산계수},
    성과가급_분기지급월: [${(c.성과가급_분기지급월 || []).join(', ')}],
    출산_단태아_유급일: ${+c.출산_단태아_유급일}, 출산_다태아_유급일: ${+c.출산_다태아_유급일},
    출산_단태아_법정일: ${+c.출산_단태아_법정일}, 출산_다태아_법정일: ${+c.출산_다태아_법정일},
    의병휴직_지급률: ${+c.의병휴직_지급률},
    직책수당: [
${duty}
    ],
    특례_14명_금액: ${+c.특례_14명_금액 || 0},
    특례_14명_적용일: ${j(c.특례_14명_적용일 || '')},
    특례_14명_전직무: ${j(c.특례_14명_전직무 || '')},
    특례_14명_후직무: ${j(c.특례_14명_후직무 || '')},
    특례_14명_직급접두: ${j(c.특례_14명_직급접두 || '')},
  };
  const KEY = 'payroll_config_v1';
  const clone = o => JSON.parse(JSON.stringify(o));
  function loadOverride() { try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function resolve() { const c = clone(DEFAULT); const ov = loadOverride(); if (ov) Object.keys(ov).forEach(k => { if (ov[k] !== undefined && ov[k] !== null) c[k] = ov[k]; }); return c; }
  PV.CONFIG_DEFAULT = DEFAULT;
  PV.CONFIG = resolve();
  PV.reloadConfig = () => (PV.CONFIG = resolve());
  PV.saveConfig = obj => { try { localStorage.setItem(KEY, JSON.stringify(obj)); } catch (e) {} return (PV.CONFIG = resolve()); };
  PV.resetConfig = () => { try { localStorage.removeItem(KEY); } catch (e) {} return (PV.CONFIG = resolve()); };
})(window.PV);
`;
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
    else { if (openWindow) openPayrollWindow(); toast(`급여계산 완료 · ${res.summary.total}명 — 검증에서 확인하세요`, 'ok'); }
  }
  // 급여계산 실행 시 리스트 창은 자동으로 열지 않음(검증에서 확인). '창 열기' 버튼으로 수동 오픈.
  $('#calcBtn').onclick = () => { try { runCalc(false); } catch (e) { console.error(e); toast('오류: ' + e.message, 'bad'); } };
  $('#openCalcBtn').onclick = openPayrollWindow;

  // 팝업(재계산·후단처리 처리)에서 호출 — 검증결과에 반영(내보내기·재검증에도 유지)
  //  처리해도 대장과 차이가 남으면 해결 아님 → status 'bad' 유지(빨간색).
  window.__pvResolveVerify = function (사번, alt) {
    if (!verifyResult || !alt) return;
    const row = verifyResult.rows.find(r => r.사번 === 사번);
    if (!row) return;
    const matched = alt.matched !== false && alt.status === 'ok';
    const label = alt.mode === 'rear' ? '후단처리' : alt.mode === 'ignore' ? '전월이월무시' : '당월적용';
    row.processedMode = alt.mode; row.resolved = matched; row.ourTotal = alt.total; row.review = matched ? 'resolved' : 'processed';
    if (alt.items) { const p = {}; alt.items.forEach(it => p[it.col] = it.ours); row.ours = p; }
    const keep = (row.notes || []).filter(n => !n.startsWith('불일치') && !/처리(완료|\(대장 불일치\))$/.test(n) && !n.startsWith('오류확인'));
    if (matched) { row.status = 'ok'; row.diffs = []; row.notes = [label + ' 처리완료'].concat(keep); }
    else { row.status = 'bad'; row.diffs = alt.diffs || row.diffs; row.notes = [label + ' 처리(대장 불일치)'].concat(keep); }
    refreshVerifyTiles();
  };
  // 팝업 '오류 확인'에서 호출 — 대장 오류로 담당자가 확인한 건(검토 완료, 불일치 카운트에서 제외)
  window.__pvMarkError = function (사번, info) {
    if (!verifyResult) return;
    const row = verifyResult.rows.find(r => r.사번 === 사번);
    if (!row) return;
    const memo = (info && info.memo) || '';
    row.review = 'error'; row.resolved = false; row.errMemo = memo;
    const keep = (row.notes || []).filter(n => !n.startsWith('불일치') && !/처리(완료|\(대장 불일치\))$/.test(n) && !n.startsWith('오류확인'));
    row.notes = ['오류확인' + (memo ? ': ' + memo : '')].concat(keep);
    refreshVerifyTiles();
  };
  // 팝업 '정상처리'에서 호출 — 대장 정상·계산이 수기입력 누락으로 다른 건을 정상(검토완료)으로 인정
  window.__pvNormalize = function (사번, memo) {
    if (!verifyResult) return;
    const row = verifyResult.rows.find(r => r.사번 === 사번);
    if (!row) return;
    row.review = 'normal'; row.resolved = true; row.normMemo = memo || '';
    const keep = (row.notes || []).filter(n => !n.startsWith('불일치') && !n.startsWith('오류확인') && !n.startsWith('정상처리') && !/처리(완료|\(대장 불일치\))$/.test(n));
    row.status = 'ok'; row.notes = ['정상처리' + (memo ? ': ' + memo : '')].concat(keep);
    refreshVerifyTiles();
  };
  window.__pvUnmarkError = function (사번) {
    if (!verifyResult) return;
    const row = verifyResult.rows.find(r => r.사번 === 사번);
    if (!row) return;
    row.review = null; row.resolved = false; row.errMemo = ''; row.normMemo = '';
    row.status = (row.diffs && row.diffs.length) ? 'bad' : 'ok';
    row.notes = (row.notes || []).filter(n => !n.startsWith('오류확인') && !n.startsWith('정상처리'));
    refreshVerifyTiles();
  };
  // 검증 요약 재계산 + 타일/저장버튼 갱신 (일치=ok, 불일치=미검토 mismatch, 오류=검토완료)
  function refreshVerifyTiles() {
    if (!verifyResult) return;
    let ok = 0, bad = 0, err = 0;
    verifyResult.rows.forEach(r => { if (r.review === 'error') err++; else if (r.status === 'ok') ok++; else bad++; });
    verifyResult.summary.ok = ok; verifyResult.summary.bad = bad; verifyResult.summary.error = err;
    if ($('#tiOk')) $('#tiOk').textContent = ok;
    if ($('#tiBad')) $('#tiBad').textContent = bad;
    ensureExtraButtons();
  }
  // 팝업 '검증 저장'에서 호출 — 처리·오류 요약 리스트를 랜딩 페이지 검증 영역에 렌더
  window.__pvSaveVerify = function () {
    if (!verifyResult) return;
    refreshVerifyTiles(); renderVerifySummary();
    toast('검증 저장 완료 — 처리·오류 요약이 검증 영역에 정리되었습니다', 'ok');
  };
  function renderVerifySummary() {
    const box = $('#verifySummary'); if (!box) return;
    const rows = (verifyResult ? verifyResult.rows : []).filter(r => r.review === 'error' || r.processedMode || r.resolved);
    if (!rows.length) { box.innerHTML = '<div class="vsum-empty" style="margin-top:12px;font-size:12px;color:var(--muted,#8a94a8)">처리·오류 건이 없습니다.</div>'; return; }
    const won2 = n => (n == null ? '' : Math.round(n).toLocaleString('ko-KR'));
    const meta = { error: { c: 'var(--bad)', t: '오류' }, normal: { c: 'var(--ok)', t: '정상처리' }, resolvedFront: { c: 'var(--br,#4f6bff)', t: '당월적용' }, resolvedRear: { c: 'var(--ok)', t: '후단처리' }, processed: { c: 'var(--bad)', t: '처리(불일치)' } };
    const kindOf = r => r.review === 'error' ? 'error' : r.review === 'normal' ? 'normal' : (r.resolved ? (r.processedMode === 'rear' ? 'resolvedRear' : 'resolvedFront') : 'processed');
    const items = rows.map(r => {
      const k = kindOf(r), m = meta[k];
      const diff = r.ourTotal - r.ledTotal;
      const detail = k === 'error'
        ? '대장 오류' + (r.errMemo ? ' — ' + esc(r.errMemo) : '') + ((r.diffs || []).length ? ' (' + (r.diffs || []).map(d => d.col).join(', ') + ')' : '')
        : k === 'normal'
          ? '정상 인정' + (r.normMemo ? ' — ' + esc(r.normMemo) : '') + ((r.diffs || []).length ? ' (' + (r.diffs || []).map(d => d.col).join(', ') + ')' : '')
          : (r.resolved ? '대장과 일치 처리' : '처리 후에도 차이 ' + (diff > 0 ? '+' : '') + won2(diff));
      return `<div class="vsum-it" style="display:flex;gap:8px;align-items:flex-start;padding:7px 9px;border:1px solid var(--line,#e2e8f2);border-radius:8px;margin-bottom:6px;background:var(--card,#fff)">
        <span style="flex:0 0 auto;font-size:10px;font-weight:800;color:#fff;background:${m.c};border-radius:20px;padding:2px 8px;margin-top:1px">${m.t}</span>
        <div style="flex:1;min-width:0"><div style="font-weight:700;font-size:12.5px">${esc(r.사번)} ${esc(r.성명 || '')} <span style="color:var(--muted,#8a94a8);font-weight:500">${esc(r.소속 || '')}</span></div>
        <div style="font-size:11.5px;color:var(--muted,#5a6579);margin-top:2px">${detail}</div></div></div>`;
    }).join('');
    const eC = verifyResult.summary.error || 0, rC = rows.filter(r => r.resolved).length, pC = rows.filter(r => !r.resolved && r.review !== 'error').length;
    box.innerHTML = `<div style="margin-top:14px"><div style="font-size:11px;font-weight:800;color:var(--muted,#8a94a8);text-transform:uppercase;letter-spacing:.03em;margin-bottom:8px">검증 처리 요약 · 완료 ${rC} · 오류 ${eC}${pC ? ' · 미해결 ' + pC : ''}</div>${items}</div>`;
  }

  /* ---------- STEP B: 검증 ---------- */
  function runVerify(openWindow) {
    const res = PV.compareLedger(payrollResult, storeForEngine());
    verifyResult = res;
    const vs = $('#verifySummary'); if (vs) vs.innerHTML = '';
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
      // 검증 처리내역(재계산/후단/정상/오류) → 다음달 소급 계산에 반영
      resolutions: (verifyResult ? verifyResult.rows : []).filter(r => r.review || r.processedMode).map(r => [r.사번, { review: r.review || null, processedMode: r.processedMode || null }]),
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
  .top button.btn-saveverify{background:var(--ok);border-color:var(--ok);color:#fff}
  .top button.btn-saveverify:hover{opacity:.9;color:#fff;border-color:var(--ok)}
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
  .note{color:var(--tx2);font-size:11px;text-align:left;white-space:normal;min-width:240px;max-width:400px;line-height:1.5}
  .vgrp{display:flex;flex-direction:column;gap:5px}
  .vg{display:flex;flex-wrap:wrap;gap:5px;align-items:center}
  .vg-d{padding-bottom:1px}
  .tag{display:inline-flex;align-items:center;padding:3px 9px;border-radius:7px;font-size:10.5px;font-weight:700;margin:0;line-height:1.3;font-variant-numeric:tabular-nums;border:1px solid transparent}
  .tag.ilhal{background:var(--warns);color:var(--warn);border-color:color-mix(in srgb,var(--warn) 25%,transparent)}
  .tag.sp{background:color-mix(in srgb,var(--br) 10%,transparent);color:var(--br);border-color:color-mix(in srgb,var(--br) 22%,transparent)}
  .tag.warn{background:var(--warns);color:var(--warn);border-color:color-mix(in srgb,var(--warn) 30%,transparent)}
  .tag.diff{background:var(--bads);color:var(--bad);font-weight:800;border-color:color-mix(in srgb,var(--bad) 25%,transparent)}
  .tag.diff b{font-weight:850;margin-right:4px}
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
  table.dt2 th.grp{text-align:center;background:var(--su2);font-size:10px;padding:6px}
  table.dt2 .gl{border-left:2px solid var(--bd)}
  .dtot{display:flex;justify-content:space-between;margin-top:12px;padding:11px 13px;background:var(--su2);border-radius:10px;font-weight:800;font-size:13px}
  .dtot .dpos{color:var(--bad)}.dtot .dneg{color:var(--info)}
  .dnote{margin-top:12px;font-size:12px;color:var(--tx2);background:var(--su2);border-radius:9px;padding:10px 12px}
  .dverdict{margin:14px 0 4px;padding:13px 15px;border-radius:11px;border:2px solid var(--bad);background:color-mix(in srgb,var(--bad) 11%,transparent);display:flex;gap:12px;align-items:flex-start;box-shadow:0 1px 8px color-mix(in srgb,var(--bad) 18%,transparent)}
  .dverdict .vi{font-size:22px;line-height:1.1}
  .dverdict .vt{flex:1;min-width:0}
  .dverdict .vh{font-weight:900;font-size:13.5px;color:var(--bad);margin-bottom:5px;letter-spacing:.01em}
  .dverdict .vb{font-size:12px;color:var(--tx2);line-height:1.65}
  .dverdict .vb b{color:var(--bad)}
  .dverdict .vb .vd{font-size:13.5px}
  .dback{font-size:11.5px;color:var(--tx2);background:var(--su2);border:1px solid var(--bd);border-radius:9px;padding:10px 12px;line-height:1.7}
  .drecalc{margin-top:12px;padding:11px 13px;border:1px dashed var(--br);border-radius:10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;background:color-mix(in srgb,var(--br) 7%,transparent)}
  .drecalc .rc-info{font-size:11.5px;color:var(--tx2);flex:1;min-width:180px}
  .drecalc .rc-done{font-size:12px;color:var(--br);font-weight:800;flex:1;min-width:150px}
  .rc-btn{font-family:inherit;font-weight:800;font-size:12px;border:1px solid var(--br);background:var(--br);color:#fff;border-radius:8px;padding:7px 13px;cursor:pointer}
  .rc-btn.ghost{background:transparent;color:var(--br)}.rc-btn:hover{opacity:.9}
  tr.rresolved td{background:color-mix(in srgb,var(--br) 12%,var(--su))!important;color:var(--tx)}
  tr.rresolved2 td{background:color-mix(in srgb,var(--ok) 14%,var(--su))!important;color:var(--tx)}
  tr.rerror td{background:color-mix(in srgb,var(--warn) 16%,var(--su))!important;color:var(--tx)}
  tr.rnormal td{background:color-mix(in srgb,var(--ok) 12%,var(--su))!important;color:var(--tx)}
  .derr{margin-top:8px;padding:9px 12px;border:1px dashed var(--warn);border-radius:10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;background:color-mix(in srgb,var(--warn) 7%,transparent)}
  .dnorm{margin-top:8px;padding:9px 12px;border:1px dashed var(--ok);border-radius:10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;background:color-mix(in srgb,var(--ok) 7%,transparent)}
  .rc-btn.err{background:var(--warn);border-color:var(--warn);color:#fff}
  .dsogeup{display:flex;gap:0;margin-top:12px;border:1px solid var(--warn);border-radius:10px;overflow:hidden;flex-wrap:wrap}
  .dsogeup .sg-left{flex:1;min-width:220px;padding:11px 13px;background:color-mix(in srgb,var(--warn) 8%,transparent)}
  .dsogeup .sg-right{flex:0 0 240px;padding:11px 13px;border-left:1px solid var(--bd);display:flex;flex-direction:column;gap:8px;justify-content:center}
  .sg-h{font-size:11.5px;font-weight:800;color:var(--warn);margin-bottom:7px;line-height:1.5}
  .sg-ord{font-size:12.5px;margin:3px 0}.sg-ord u{text-decoration-color:var(--warn);text-underline-offset:2px}
  .sg-deriv{font-size:11.5px;color:var(--tx2);margin-top:8px;line-height:1.6}
  .sg-info{font-size:11px;color:var(--tx3)}
  @media print{.top button,.chips,.search2,.drecalc{display:none}.tbl{max-height:none;overflow:visible}th{position:static}}
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
    { const sv = doc.getElementById('saveVerify'); if (sv) sv.onclick = () => { try { if (window.opener && window.opener.__pvSaveVerify) window.opener.__pvSaveVerify(); if (window.opener && window.opener.focus) window.opener.focus(); } catch (_) {} window.close(); }; }
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
    tb.onclick = e => { const tr = e.target.closest('tr[data-i]'); if (!tr) return; const r = D.rows[+tr.dataset.i]; if (r && r.detail) openDetail(r); };
    // 재계산 결과(alt)값으로 처리 표시. mode: 'front'(당월적용/30−앞단) | 'rear'(후단처리/30−뒷단)
    //  처리해도 대장과 차이가 남으면(=status!=='ok') 해결이 아니므로 빨간색 유지.
    function resolveRow(R, alt, mode) {
      const matched = alt.status === 'ok';
      const label = mode === 'rear' ? '후단처리' : mode === 'ignore' ? '전월이월무시' : '당월적용';
      R.resolved = matched; R.processedMode = mode;
      R.cls = !matched ? 'rbad' : (mode === 'rear' ? 'rresolved2' : mode === 'ignore' ? 'rresolved2' : 'rresolved');
      if (R.vals) { R.vals.ourTotal = alt.total; R.vals.diff = alt.total - (R.detail.ledTotal || 0); R.vals.상태 = matched ? label + ' 처리완료' : label + '(불일치)'; }
      const noteTags = (alt.notes || []).filter(n => !n.startsWith('불일치')).map(n => '<span class="tag ilhal">' + n + '</span>').join('');
      const dv = alt.total - (R.detail.ledTotal || 0);
      const pill = matched
        ? '<span class="pill" style="background:' + (mode === 'rear' ? 'var(--ok)' : 'var(--br)') + ';color:#fff">✔ ' + label + ' 처리완료</span> '
        : '<span class="pill bad">⚠ ' + label + ' 처리했으나 대장 불일치 ' + (dv > 0 ? '+' : '') + nf0(dv) + '</span> ';
      R.tagsHtml = pill + noteTags;
      if (R.flags) { R.flags.resolved = matched; R.flags.bad = !matched; }
      try { if (window.opener && window.opener.__pvResolveVerify) window.opener.__pvResolveVerify(R.detail.사번, Object.assign({}, alt, { mode: mode, matched: matched })); } catch (_) {}
      render();
    }
    function nf0(n) { return n == null ? '' : (+n).toLocaleString('ko-KR'); }
    // 오류 확인: 대장 자체가 틀린 경우 담당자가 오류로 표기(검토완료 → 불일치 카운트 제외)
    function markError(R, memo) {
      R.review = 'error'; R.resolved = false; R.processedMode = null; R.cls = 'rerror'; R.errMemo = memo || '';
      if (R.vals) R.vals.상태 = '오류확인';
      const noteTags = (R.detail.notes || []).filter(n => !n.startsWith('불일치')).map(n => '<span class="tag ilhal">' + n + '</span>').join('');
      R.tagsHtml = '<span class="pill" style="background:var(--warn);color:#fff">⚑ 오류확인' + (memo ? ': ' + memo : '') + '</span> ' + noteTags;
      if (R.flags) { R.flags.bad = false; R.flags.error = true; }
      try { if (window.opener && window.opener.__pvMarkError) window.opener.__pvMarkError(R.detail.사번, { memo: memo }); } catch (_) {}
      render();
    }
    // 정상처리: 대장이 맞고 우리 계산이 근태·징계 등 수기입력 누락으로 다른 경우 → 정상(검토완료)으로 인정.
    //  앞단에 다시 입력하고 재검증(초기화)할 필요 없이 이 건만 정상 처리.
    function markNormal(R, memo) {
      R.review = 'normal'; R.resolved = true; R.processedMode = null; R.cls = 'rnormal'; R.normMemo = memo || '';
      if (R.vals) R.vals.상태 = '정상처리';
      const noteTags = (R.detail.notes || []).filter(n => !n.startsWith('불일치')).map(n => '<span class="tag ilhal">' + n + '</span>').join('');
      R.tagsHtml = '<span class="pill" style="background:var(--ok);color:#fff">✔ 정상처리' + (memo ? ': ' + memo : '') + '</span> ' + noteTags;
      if (R.flags) { R.flags.bad = false; R.flags.ok = true; R.flags.error = false; }
      try { if (window.opener && window.opener.__pvNormalize) window.opener.__pvNormalize(R.detail.사번, memo); } catch (_) {}
      render();
    }
    function unmarkError(R) {
      R.review = null; R.errMemo = ''; R.normMemo = '';
      R.cls = R._cls0 || ''; R.tagsHtml = R._tags0 || '';
      if (R.vals) R.vals.상태 = (R._cls0 === 'rbad') ? '불일치' : '일치';
      if (R.flags) { R.flags.error = false; R.flags.bad = (R._cls0 === 'rbad'); R.flags.ok = (R._cls0 !== 'rbad'); }
      try { if (window.opener && window.opener.__pvUnmarkError) window.opener.__pvUnmarkError(R.detail.사번); } catch (_) {}
      render();
    }
    function openDetail(R) {
      const d = R.detail;
      const nf = n => n == null ? '' : (+n).toLocaleString('ko-KR');
      const 연봉H = Object.keys(d.연봉 || {}).filter(k => d.연봉[k]).map(k => k + ' <b>' + nf(d.연봉[k]) + '</b>').join(' · ') || '연봉정보 없음';
      // view: 'base'(원계산) | 'alt'(당월적용/30−앞단) | 'alt2'(후단처리/30−뒷단)
      let view = R.resolved ? (R.processedMode === 'rear' ? 'alt2' : R.processedMode === 'ignore' ? 'ignore' : 'alt') : 'base';
      const altObjFor = v => v === 'alt2' ? d.alt2 : v === 'alt' ? d.alt : v === 'ignore' ? d.ignore : null;
      const curAlt = () => altObjFor(view);
      const isAlt = () => view !== 'base' && !!curAlt();
      const curItems = () => isAlt() ? curAlt().items : d.items;
      const curTotal = () => isAlt() ? curAlt().total : d.ourTotal;
      const curNotes = () => isAlt() ? curAlt().notes : d.notes;
      const altModeLabel = () => view === 'alt2' ? '후단처리 (30−뒷단)' : view === 'ignore' ? '전월 이월 무시' : '당월적용 (30−앞단)';
      const itemsHtml = () => curItems().map(it => { const diff = it.ours - it.led; return '<tr class="' + (diff ? 'dd' : '') + '"><td class="l">' + it.col + '</td><td class="l fm">' + (it.formula || (isAlt() ? altModeLabel() + '(지급일 이후분 포함)' : '')) + '</td><td>' + (it.ours ? nf(it.ours) : '·') + '</td><td>' + (it.led ? nf(it.led) : '·') + '</td><td class="' + (diff > 0 ? 'dpos' : diff < 0 ? 'dneg' : '') + '">' + (diff ? (diff > 0 ? '+' : '') + nf(diff) : '0') + '</td></tr>'; }).join('');
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
      const ov = doc.createElement('div'); ov.className = 'dov';
      function renderBody() {
        const base = !isAlt();
        const segHd = (base && d.ilhal && d.segments && d.segments.length) ? '<div class="dseg">⏱ 일할 근무구간: ' + d.segments.map(s => s.label + ' ' + s.days + '일').join(' → ') + '</div>' : '';
        const extraHd = (base && d.extras && d.extras.length) ? '<div class="dsub">조정·가감 내역</div><table class="dt"><tbody>' + d.extras.map(e => '<tr><td class="l">' + e.label + '</td><td>' + (e.amount == null ? '—' : nf(e.amount)) + '</td></tr>').join('') + '</tbody></table>' : '';
        const tot = curTotal(), td = tot - d.ledTotal;
        const totHd = '<div class="dtot"><span>총액 (세전)' + (isAlt() ? ' <b style="color:' + (view === 'alt2' ? 'var(--ok)' : 'var(--br)') + '">· ' + altModeLabel() + ' 재계산</b>' : '') + '</span><span>계산 ' + nf(tot) + ' &nbsp;/&nbsp; 대장 ' + nf(d.ledTotal) + ' &nbsp; <span class="' + (td > 0 ? 'dpos' : td < 0 ? 'dneg' : '') + '">' + (td ? (td > 0 ? '+' : '') + nf(td) : '일치') + '</span></span></div>';
        const nts = curNotes(); const notesHd = (nts && nts.length) ? '<div class="dnote">📌 ' + nts.join(' · ') + '</div>' : '';
        // 검증 경고 배너 — 항목별 계산 바로 아래에 크게. (다태아 유급 75일 과소지급 의심)
        const twinDiff = d.ourTotal - d.ledTotal;
        const verdictH = d.matTwin ? '<div class="dverdict"><div class="vi">🔺</div><div class="vt">'
          + '<div class="vh">검증 경고 · 다태아 출산휴가 유급기간 과소지급 의심</div>'
          + '<div class="vb">다태아 출산전후휴가는 법정 유급 <b>75일</b>(단태아 60일)입니다. 대장이 <b>60일 기준</b>으로 유급을 끊어 지급하면 이 달에 과소지급이 발생합니다.<br>'
          + '계산 <b>' + nf(d.ourTotal) + '</b> vs 대장 <b>' + nf(d.ledTotal) + '</b> → 차이 <b class="vd">' + (twinDiff >= 0 ? '+' : '') + nf(twinDiff) + '</b> · <b>유급 75일 반영 여부를 확인하세요.</b></div>'
          + '</div></div>' : '';
        // 재계산 박스 = '이번달' 지급일 이후 변동 처리용(당월적용/후단). 전월 소급은 아래 소급 박스가 담당.
        //  판단 기준은 소급 제외 base(=전월이월무시 값). 그래야 '소급만 있는 사람'에게 재계산 버튼이 중복으로 안 뜸.
        const baseNoSog = (d.hasSogeup && d.ignore) ? d.ignore.total : d.ourTotal;
        const altChanged = d.alt && d.alt.total !== baseNoSog;
        const alt2Changed = d.alt2 && d.alt2.total !== baseNoSog && d.alt2.total !== (d.alt ? d.alt.total : baseNoSog);
        const dsWarn = d.dayShift ? '<div style="width:100%;font-size:11.5px;color:var(--warn);font-weight:800;margin-bottom:6px;line-height:1.6">⚠ 당월(30−앞단)·익월(실제일수) 처리 시 유급일수가 달라집니다 — <u>익월 처리 권장</u>(1일 근로자 유리). 당월에 처리해야 하면 <b>후단처리</b>로 뒷구간 실제일수를 보장하세요.</div>' : '';
        let recalcH = '';
        if (isAlt() && view !== 'ignore') {
          const a = curAlt(), matched = a.status === 'ok';
          const switchBtn = (view === 'alt' && alt2Changed) ? '<button class="rc-btn ghost" data-a="alt2">후단처리(30−뒷단)로 전환</button>'
            : (view === 'alt2' && altChanged) ? '<button class="rc-btn ghost" data-a="alt">당월적용(30−앞단)으로 전환</button>' : '';
          recalcH = '<div class="drecalc"><span class="' + (matched ? 'rc-done' : 'rc-info') + '"' + (matched ? '' : ' style="color:var(--bad);font-weight:800"') + '>' + (matched ? '✔ ' : '⚠ ') + altModeLabel() + ' 적용' + (matched ? ' — 대장과 일치' : ' — 대장과 불일치 (계산 ' + nf(a.total) + ' / 대장 ' + nf(d.ledTotal) + ') · 해결 아님') + '</span>'
            + (R.resolved && R.processedMode === (view === 'alt2' ? 'rear' : 'front') ? '' : '<button class="rc-btn" data-a="apply">이 값으로 처리</button>') + switchBtn + '<button class="rc-btn ghost" data-a="revert">원계산으로</button></div>';
        } else if (view === 'base' && (altChanged || alt2Changed || d.dayShift)) {
          recalcH = '<div class="drecalc">' + dsWarn + '<span class="rc-info">이번달 지급일(20일) 이후 변동은 기본 다음달 소급. 담당자 판단으로 이번달에 바로 처리 시 방식을 선택하세요.</span>'
            + (altChanged ? '<button class="rc-btn" data-a="alt">⟳ 당월적용 (30−앞단) ' + nf(d.alt.total) + '</button>' : '')
            + (alt2Changed ? '<button class="rc-btn" style="background:var(--ok);border-color:var(--ok)" data-a="alt2">⟳ 후단처리 (30−뒷단) ' + nf(d.alt2.total) + '</button>' : '')
            + '</div>';
        } else if (view === 'base' && !d.hasSogeup) {
          recalcH = '<div class="drecalc"><span class="rc-info" style="color:var(--tx3)">💡 지급일 이후 변동 없음 — 재계산 불필요 (지급일 기준 = 월말 기준 동일)</span></div>';
        }
        // 전월 지급일 이후 변동(소급) — 백데이터 좌우분할: 좌=변동발령 강조, 우=전월 이월 무시 버튼
        const sogeupH = d.hasSogeup && d.sogeup ? ('<div class="dsogeup"><div class="sg-left">'
          + '<div class="sg-h">⚠ 전월 지급일 이후 변동 — 당월 소급 처리 대상 (담당자 누락 확인)</div>'
          + ((d.prevChangeOrders || []).map(o => '<div class="sg-ord">📋 ' + (o.시작일 || '') + ' <b><u>' + (o.구분 || '') + '</u></b></div>').join('') || '<div class="sg-ord" style="color:var(--tx3)">연봉·기타 변동</div>')
          + '<div class="sg-deriv">전월 재계산(정답) vs 전월 대장(실지급) 차액 = <b style="color:' + (d.sogeup.sum >= 0 ? 'var(--bad)' : 'var(--info)') + '">' + (d.sogeup.sum >= 0 ? '+' : '') + nf(d.sogeup.sum) + '</b> → 당월 소급 반영</div>'
          + '</div><div class="sg-right">'
          + (view === 'ignore'
            ? '<span class="rc-done">✔ 전월 이월(소급) 무시됨 — ' + nf(d.ignore ? d.ignore.total : d.ourTotal) + (d.ignore && d.ignore.status === 'ok' ? ' · 대장 일치' : '') + '</span>' + (R.resolved && R.processedMode === 'ignore' ? '' : '<button class="rc-btn" data-a="apply">이 값으로 처리</button>') + '<button class="rc-btn ghost" data-a="revert">되돌리기</button>'
            : '<div class="sg-info">이미 처리됐거나 소급 대상이 아니면 →</div><button class="rc-btn ghost" data-a="ignore">⊘ 전월 이월 무시</button>')
          + '</div></div>') : '';
        const reviewable = R._cls0 === 'rbad' || R.review;
        // 정상처리 박스: 대장이 맞고 우리 계산이 근태·징계 등 수기입력 누락으로 다른 경우 (불일치 행에만 노출)
        const normH = reviewable ? ('<div class="dnorm">' + (R.review === 'normal'
          ? '<span class="pill" style="background:var(--ok);color:#fff">✔ 정상처리됨' + (R.normMemo ? ': ' + R.normMemo : '') + '</span><button class="rc-btn ghost" data-a="unnormal">해제</button>'
          : '<span style="font-size:11.5px;color:var(--tx2);flex:1;min-width:150px">✅ 대장이 맞고 계산이 <b>근태·징계 등 수기입력 누락</b>으로 다른 경우 → 정상처리(앞단 재입력·재검증 불필요)</span><button class="rc-btn" style="background:var(--ok);border-color:var(--ok)" data-a="normal">✔ 정상처리</button>') + '</div>') : '';
        // 오류 확인 박스: 대장 자체가 틀린 경우 담당자가 오류로 표기 (불일치 행에만 노출)
        const errH = reviewable ? ('<div class="derr">' + (R.review === 'error'
          ? '<span class="pill" style="background:var(--warn);color:#fff">⚑ 오류확인됨' + (R.errMemo ? ': ' + R.errMemo : '') + '</span><button class="rc-btn ghost" data-a="unerror">오류 해제</button>'
          : '<span style="font-size:11.5px;color:var(--tx2);flex:1;min-width:150px">🔎 계산은 맞고 <b>대장이 틀린</b> 경우 → 오류로 표기(검토완료 처리)</span><button class="rc-btn err" data-a="error">⚑ 오류 확인</button>') + '</div>') : '';
        const headPill = R.review === 'error'
          ? ' <span class="pill" style="background:var(--warn);color:#fff">오류확인</span>'
          : R.review === 'normal'
            ? ' <span class="pill" style="background:var(--ok);color:#fff">정상처리</span>'
            : R.resolved
              ? ' <span class="pill" style="background:' + (R.processedMode === 'rear' ? 'var(--ok)' : 'var(--br)') + ';color:#fff">' + (R.processedMode === 'rear' ? '후단처리' : '당월적용') + ' 처리완료</span>'
              : (R.cls === 'rbad' && R.processedMode ? ' <span class="pill bad">처리했으나 불일치</span>' : '');
        // 항목별 계산: 전월 소급이 있으면 2개월치(전월→이번달) 병렬 표. 아니면 단일(계산식 포함).
        const cellN = v => v ? nf(v) : '·';
        const dcell = v => '<td class="' + (v > 0 ? 'dpos' : v < 0 ? 'dneg' : '') + '">' + (v ? (v > 0 ? '+' : '') + nf(v) : '0') + '</td>';
        const itemsTable = (!isAlt() && d.dualItems && d.dualItems.length)
          ? '<div class="dsub">항목별 계산 <span style="color:var(--br)">· 2개월 (전월 → 이번달)</span></div>'
            + '<table class="dt dt2"><thead><tr><th class="l" rowspan="2">항목</th><th colspan="3" class="grp">전월 ' + (d.prevYMlabel || '') + '</th><th colspan="3" class="grp gl">이번달 ' + (d.ym || '') + '</th></tr>'
            + '<tr><th>계산</th><th>대장</th><th>차이</th><th class="gl">계산</th><th>대장</th><th>차이</th></tr></thead><tbody>'
            + d.dualItems.map(x => { const pd = x.pOurs - x.pLed, cd = x.cOurs - x.cLed; return '<tr class="' + ((pd || cd) ? 'dd' : '') + '"><td class="l">' + x.col + '</td><td>' + cellN(x.pOurs) + '</td><td>' + cellN(x.pLed) + '</td>' + dcell(pd) + '<td class="gl">' + cellN(x.cOurs) + '</td><td>' + cellN(x.cLed) + '</td>' + dcell(cd) + '</tr>'; }).join('')
            + '</tbody></table>'
          : '<div class="dsub">항목별 계산</div><table class="dt"><thead><tr><th class="l">항목</th><th class="l">계산식</th><th>계산</th><th>대장</th><th>차이</th></tr></thead><tbody>' + itemsHtml() + '</tbody></table>';
        ov.innerHTML = '<div class="dcard"><div class="dhead"><b>' + d.사번 + ' ' + (d.성명 || '') + '</b> 계산 근거 (연봉 → 월급여 · 세전)' + headPill + '<span class="dexp" title="이 사람의 계산근거·백데이터를 파일로 저장">⬇ 내보내기</span><span class="dx">✕</span></div><div class="dbody">'
          + '<div class="dcontract">📄 적용 연봉계약 <b>' + (d.연봉일자 || '-') + '</b><br>' + 연봉H + '</div>'
          + segHd
          + itemsTable
          + verdictH
          + extraHd + totHd + recalcH + sogeupH + normH + errH + balH + notesHd + '</div></div>';
        ov.querySelector('.dx').onclick = () => ov.remove();
        ov.querySelector('.dexp').onclick = e => { e.stopPropagation(); exportOne(d); };
        const rb = ov.querySelectorAll('.rc-btn'); rb.forEach(b => b.onclick = e => {
          e.stopPropagation(); const a = b.dataset.a;
          if (a === 'alt') { view = 'alt'; renderBody(); }
          else if (a === 'alt2') { view = 'alt2'; renderBody(); }
          else if (a === 'ignore') { view = 'ignore'; renderBody(); }
          else if (a === 'revert') { view = 'base'; renderBody(); }
          else if (a === 'apply') { const mode = view === 'alt2' ? 'rear' : view === 'ignore' ? 'ignore' : 'front'; resolveRow(R, curAlt(), mode); renderBody(); }
          else if (a === 'error') { const memo = (window.prompt('오류 내용 (대장 오류 사유 등, 선택):', R.errMemo || '') || '').trim(); markError(R, memo); renderBody(); }
          else if (a === 'unerror') { unmarkError(R); renderBody(); }
          else if (a === 'normal') { const memo = (window.prompt('정상처리 사유 (예: 결근 3일 수기누락, 대장 정상 — 선택):', R.normMemo || '') || '').trim(); markNormal(R, memo); renderBody(); }
          else if (a === 'unnormal') { unmarkError(R); renderBody(); }
        });
      }
      renderBody();
      ov.onclick = e => { if (e.target === ov) ov.remove(); };
      doc.body.appendChild(ov);
    }
    doc.getElementById('gs').oninput = e => { st.q = e.target.value; render(); };
    doc.querySelectorAll('.chip').forEach(c => c.onclick = () => { const k = c.dataset.k; st.chip = (k === 'all' ? null : k); doc.querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x.dataset.k === (st.chip || 'all'))); render(); });
    render();
  }

  function openSearchWin(title, meta, columns, rows, chips, sumHTML, ym, opts) {
    opts = opts || {};
    const w = window.open('', '_blank');
    if (!w) { toast('팝업이 차단되었습니다. 팝업 허용 후 다시 시도하세요.', 'bad'); return; }
    const head = '<tr>' + columns.map(c => `<th class="${c.align === 'l' ? 'l' : ''}" data-key="${c.key}">${esc(c.label)}<span class="ar"></span></th>`).join('') + '</tr>';
    const chipHTML = chips.map(ch => `<button class="chip${ch.k === 'all' ? ' on' : ''}" data-k="${ch.k}" id="chip-${ch.k}">${esc(ch.label)} <span class="c-n"></span></button>`).join('');
    const hasDetail = rows.some(r => r.detail);
    const payload = { columns, rows, chips, title, meta, ym: ym || '' };
    const body = `<div class="top"><h1>${esc(title)}</h1><span class="m">${esc(meta)}</span><span class="cnt" id="cnt"></span><span class="sp"></span>
        <div class="search2"><input id="gs" placeholder="🔍 전체 검색 (부분일치)"></div>
        ${hasDetail ? '<button id="expAll" title="현재 목록 전원의 계산근거·백데이터를 텍스트 파일 1개로 저장">⬇ 상세 전체 내보내기</button>' : ''}
        <button onclick="window.print()">인쇄 / PDF</button>
        ${opts.saveVerify ? '<button id="saveVerify" class="btn-saveverify" title="처리·오류 내역을 저장하고 메인 화면으로 이동">💾 검증 저장</button>' : ''}</div>`;
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
        if (c === '성과급' && t.minTopup > 0) f += ` + 최저보전 ${nf(t.minTopup)}`;
        if (c === '변동역량가급1' && t.is14) f += ' + 14명특례 500,000';
      } else if (c === '고정역량가급') f = `직책수당 ${t.dutyLabel || ''} ${nf(t.dutyFlat || 0)}` + (t.ilhal ? ' × 일할' : '');
      else if (c === '감액') f = (t.uvac ? `무급휴가 ${t.uvac}일 −${nf(t.uvacDeduct)}` : '') + ((r.notes || []).filter(n => /감봉|결근|지각/.test(n)).map(n => ' + ' + n.split(' ')[0]).join(''));
      else f = '업로드/기타 항목';
      return { col: c, ours, led, formula: f };
    });
    // ── 백데이터 유급/무급 + 이번달 급여 영향(감액/추가지급) 계산 ──
    const ym = (t.year && t.month) ? `${t.year}-${String(t.month).padStart(2, '0')}` : '';
    const pmObj = (t.year && t.month) ? (t.month === 1 ? { y: t.year - 1, m: 12 } : { y: t.year, m: t.month - 1 }) : null;
    const pm = pmObj ? `${pmObj.y}-${String(pmObj.m).padStart(2, '0')}` : '';
    const monthStartISO = ym ? ym + '-01' : '';
    const isUnpaidVac = k => /무급휴가|가족돌봄|보건|생리/.test(k || '');
    const isMat = k => /출산|유사산/.test(k || '') && !/배우자/.test(k || '');
    const mu = t.matUnpaid;
    let fullG = (t.dutyFlat || 0) + (t.is14 ? 500000 : 0);
    Object.values(연봉).forEach(v => fullG += (+v || 0) / 12);
    const dayRate = Math.round(fullG / 30);
    // 당월 데이터는 이번달 근무일수(일할) 계산일 뿐 → 감액/추가지급 표기는 '다른 달 것(소급·전월공제)'에만.
    const 휴가 = (t.휴가 || []).map(v => {
      const k = v.종류 || '', s = v.시작일 || '', e = v.종료일 || s, sm = s.slice(0, 7);
      let tag = '유급', aff = false, impact = '', amt = 0;
      if (isMat(k)) {
        const unpaidDay = mu && s >= mu.start && s <= mu.end;
        tag = mu && unpaidDay ? '무급' : (mu && s <= mu.end && e >= mu.start ? '혼재' : '유급');
        if (sm === ym && unpaidDay) aff = true;   // 당월 무급일만 강조(일할 감소). 금액표기 없음(감액 아님).
      } else if (isUnpaidVac(k)) {
        tag = '무급';
        if (sm === pm) { aff = true; impact = '감액'; amt = t.uvac ? -Math.round((t.uvacDeduct || 0) / t.uvac) : 0; }  // 전월분 이번달 공제 = 감액
        else if (sm === ym) impact = '익월공제';    // 당월 무급휴가 = 다음달 공제(이번달 영향 아님)
      }
      return { 종류: k, 시작일: s, 종료일: v.종료일, 일수: v.일수, tag, aff, impact, amt };
    });
    let baselineDate = null;
    (t.발령 || []).forEach(o => { if (monthStartISO && (o.시작일 || '') < monthStartISO) baselineDate = o.시작일; });
    const 발령 = (t.발령 || []).map(o => {
      const sm = (o.시작일 || '').slice(0, 7);
      const aff = (ym && sm === ym) || o.시작일 === baselineDate || ((o.퇴직일 || '').slice(0, 7) === ym);
      return { 구분: o.구분, 시작일: o.시작일, 퇴직일: o.퇴직일, aff };
    });
    // 백데이터 일자 내림차순(최신순) 정렬
    const dcmp = (a, b) => (b.시작일 || '') < (a.시작일 || '') ? -1 : (b.시작일 || '') > (a.시작일 || '') ? 1 : 0;
    발령.sort(dcmp); 휴가.sort(dcmp);
    // 예외 재계산 상세 구성 (alt=당월적용/30−앞단, alt2=후단처리/30−뒷단)
    const buildAlt = a => {
      if (!a) return null;
      const acols = [...new Set([...PV.LEDGER_ITEMS, ...Object.keys(a.pay || {}), ...Object.keys(r.led || {})])].filter(c => ((a.pay && a.pay[c]) || (r.led && r.led[c])));
      const aitems = acols.map(c => ({ col: c, ours: Math.round((a.pay && a.pay[c]) || 0), led: Math.round((r.led && r.led[c]) || 0) }));
      return { total: a.total, status: a.status, items: aitems, notes: a.notes || [], diffCols: (a.diffs || []).map(d => d.col) };
    };
    const alt = buildAlt(r.alt), alt2 = buildAlt(r.alt2), ignore = buildAlt(r.ignore);
    // 전월 지급일 이후 변동 발령(좌측 강조용) 표시 세트
    const prevChg = new Set((r.prevChangeOrders || []).map(o => (o.시작일 || '') + '|' + (o.구분 || '')));
    발령.forEach(o => { o.prevChg = prevChg.has((o.시작일 || '') + '|' + (o.구분 || '')); });
    // 2개월치 항목별 계산(전월 소급 발생 시): 전월(계산/대장) + 이번달(계산/대장)
    let dualItems = null;
    if (r.hasSogeup && r.sogeup) {
      const sg = r.sogeup, curMap = {}; items.forEach(it => curMap[it.col] = it);
      const cols2 = [...new Set([...Object.keys(sg.correct || {}), ...Object.keys(sg.paid || {}), ...items.map(i => i.col)])];
      dualItems = cols2.map(c => ({ col: c, pOurs: Math.round((sg.correct && sg.correct[c]) || 0), pLed: Math.round((sg.paid && sg.paid[c]) || 0), cOurs: curMap[c] ? curMap[c].ours : 0, cLed: curMap[c] ? curMap[c].led : 0 }))
        .filter(x => x.pOurs || x.pLed || x.cOurs || x.cLed);
    }
    const pm2 = (t.year && t.month) ? (t.month === 1 ? { y: t.year - 1, m: 12 } : { y: t.year, m: t.month - 1 }) : null;
    const prevYMlabel = pm2 ? `${pm2.y}-${String(pm2.m).padStart(2, '0')}` : '';
    return { 사번: r.사번, 성명: r.성명, 연봉일자: t.연봉일자, 연봉: 연봉, quarterMonth: t.quarterMonth, ilhal: t.ilhal, segments: t.segments || [], items, extras: t.extras || [], dutyLabel: t.dutyLabel, dutyFlat: t.dutyFlat, uvac: t.uvac, uvacDeduct: t.uvacDeduct, 발령: 발령, 휴가: 휴가, matUnpaid: t.matUnpaid || null, ym, ourTotal: r.ourTotal, ledTotal: r.ledTotal, notes: r.notes || [], alt, alt2, ignore, dayShift: !!r.dayShift, hasSogeup: !!r.hasSogeup, sogeup: r.sogeup || null, prevChangeOrders: r.prevChangeOrders || null, dualItems, prevYMlabel, matTwin: !!r.matTwin };
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
      const diffTags = (r.diffs || []).filter(d => d.col !== '—').map(d => `<span class="tag diff"><b>${esc(d.col)}</b>${d.diff > 0 ? '+' : ''}${won(d.diff)}</span>`).join('');
      const minwage = (r.notes || []).some(n => n.includes('최저임금'));
      const noteTags = (r.notes || []).filter(n => !n.startsWith('불일치')).map(n => `<span class="tag ${n.includes('최저임금') || n.includes('일수 차이') || n.includes('소급') || n.includes('전월') || n.includes('지급일') || n.includes('다태아') ? 'warn' : n.startsWith('일할') ? 'ilhal' : 'sp'}">${esc(n)}</span>`).join('');
      const cls0 = r.status === 'bad' ? 'rbad' : '';
      const tags0 = (diffTags || noteTags)
        ? `<div class="vgrp">${diffTags ? '<div class="vg vg-d">' + diffTags + '</div>' : ''}${noteTags ? '<div class="vg vg-n">' + noteTags + '</div>' : ''}</div>`
        : (r.status === 'ok' ? '<span class="pill ok">일치</span>' : '');
      return { cls: cls0, _cls0: cls0, _tags0: tags0, vals: { no: i + 1, 사번: r.사번, 성명: r.성명, 소속: r.소속, ourTotal: r.ourTotal, ledTotal: r.ledTotal, diff, 상태: r.status === 'ok' ? '일치' : '불일치', 비고: ((r.diffs || []).map(d => d.col).join(' ') + ' ' + (r.notes || []).join(' ')) },
        tagsHtml: tags0, flags: { bad: r.status === 'bad', ok: r.status === 'ok', warn: !!r.warn, minwage, dayshift: !!r.dayShift, error: false, sogeup: !!r.hasSogeup, postpay: !!r.currentPostPay, mattwin: !!r.matTwin },
        detail: buildDetail(r) };
    });
    const chips = [{ k: 'all', label: '전체' }, { k: 'bad', label: '불일치', flag: 'bad' }, { k: 'ok', label: '일치', flag: 'ok' }, { k: 'error', label: '⚑오류', flag: 'error' }, { k: 'postpay', label: '⚠당월변동', flag: 'postpay' }, { k: 'sogeup', label: '⚠전월변동/소급', flag: 'sogeup' }, { k: 'warn', label: '점검', flag: 'warn' }, { k: 'minwage', label: '⚠최저보전', flag: 'minwage' }, { k: 'dayshift', label: '⚠익월권장', flag: 'dayshift' }, { k: 'mattwin', label: '⚠다태아유급', flag: 'mattwin' }];
    const sumHTML = `<div class="sum"><div class="sc"><div class="k">대상</div><div class="v">${res.summary.total}</div></div><div class="sc"><div class="k" style="color:var(--ok)">일치</div><div class="v" style="color:var(--ok)">${res.summary.ok}</div></div><div class="sc"><div class="k" style="color:var(--bad)">불일치</div><div class="v" style="color:var(--bad)">${res.summary.bad}</div></div></div>`;
    openSearchWin(`검증결과 ${ym}`, `${ym} · 계산 vs 급여대장(세전)`, columns, rows, chips, sumHTML, ym, { saveVerify: true });
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

  /* ================= 탭 전환 ================= */
  $$('.tab').forEach(t => t.onclick = () => {
    $$('.tab').forEach(x => x.classList.toggle('on', x === t));
    const v = t.dataset.view;
    $('#view-payroll').classList.toggle('hidden', v !== 'payroll');
    $('#view-pension').classList.toggle('hidden', v !== 'pension');
  });

  /* ================= 퇴직연금 계산기 ================= */
  const pf = { sal: [], excl: [], orders: [], vac: [], shift: null };
  let pnLast = null;
  const pnum = v => { if (v == null) return 0; const n = Number(String(v).replace(/[^0-9.-]/g, '')); return isNaN(n) ? 0 : n; };
  const pwon = n => Math.round(n).toLocaleString('ko-KR');

  function renderSalRows() {
    const box = $('#pn-sal-list'); box.innerHTML = '';
    if (!pf.sal.length) box.innerHTML = '<div class="pf-h" style="padding:4px 0">계약 없음 — 불러오기 또는 계약 추가</div>';
    pf.sal.forEach((s, i) => {
      const r = el('div', 'pf-line');
      r.innerHTML = `<input type="date" data-k="연봉일자" style="width:130px" value="${esc(s.연봉일자 || '')}">
        <input type="number" data-k="기본급" placeholder="기본급" style="width:92px" value="${s.기본급 || ''}">
        <input type="number" data-k="실적급" placeholder="능력급" style="width:82px" value="${s.실적급 || ''}">
        <input type="number" data-k="성과급" placeholder="성과급" style="width:82px" value="${s.성과급 || ''}">
        <input type="number" data-k="성과가급" placeholder="성과가급" style="width:82px" value="${s.성과가급 || ''}">
        <input type="number" data-k="변동역량1" placeholder="변동1" style="width:74px" value="${s.변동역량1 || ''}">
        <input type="number" data-k="변동역량2" placeholder="변동2" style="width:74px" value="${s.변동역량2 || ''}">
        <button class="pf-del" title="삭제">✕</button>`;
      r.querySelectorAll('input').forEach(inp => inp.onchange = () => { s[inp.dataset.k] = inp.dataset.k === '연봉일자' ? inp.value : pnum(inp.value); });
      r.querySelector('.pf-del').onclick = () => { pf.sal.splice(i, 1); renderSalRows(); };
      box.appendChild(r);
    });
  }
  function renderExclRows() {
    const box = $('#pn-excl-list'); box.innerHTML = '';
    if (!pf.excl.length) box.innerHTML = '<div class="pf-h" style="padding:4px 0">제외기간 없음</div>';
    pf.excl.forEach((e, i) => {
      const r = el('div', 'pf-line');
      r.innerHTML = `<input type="date" data-k="시작" style="width:135px" value="${esc(e.시작 || '')}"> ~
        <input type="date" data-k="종료" style="width:135px" value="${esc(e.종료 || '')}">
        <button class="pf-del" title="삭제">✕</button>`;
      r.querySelectorAll('input').forEach(inp => inp.onchange = () => { e[inp.dataset.k] = inp.value; });
      r.querySelector('.pf-del').onclick = () => { pf.excl.splice(i, 1); renderExclRows(); };
      box.appendChild(r);
    });
  }
  { const b = $('#pn-add-sal'); if (b) b.onclick = () => { pf.sal.push({ 연봉일자: '', 기본급: 0, 실적급: 0, 성과급: 0, 성과가급: 0, 변동역량1: 0, 변동역량2: 0 }); renderSalRows(); }; }
  { const b = $('#pn-add-excl'); if (b) b.onclick = () => { pf.excl.push({ 시작: '', 종료: '' }); renderExclRows(); }; }
  { const b = $('#pn-load'); if (b) b.onclick = () => {
    const sabun = $('#pn-sabun').value.trim();
    if (!sabun) { toast('사번을 입력하세요', 'bad'); return; }
    const a = PV.pensionAutofill && PV.pensionAutofill(store, sabun);
    if (!a || !a.연봉계약.length) { toast('연결된 데이터에 해당 사번의 연봉내역이 없습니다', 'bad'); return; }
    if (a.성명) $('#pn-name').value = a.성명;
    if (a.입사일 && !$('#pn-join').value) $('#pn-join').value = a.입사일;
    if (a.연차수당) $('#pn-annual').value = a.연차수당;
    if (a.고정역량월) $('#pn-duty').value = a.고정역량월;
    pf.sal = a.연봉계약.map(s => ({ ...s })); renderSalRows();
    pf.orders = a.발령 || []; pf.vac = a.휴가 || [];
    applyAvgEnd();
    toast(`불러옴 · 연봉 ${a.연봉계약.length}건 · 발령 ${pf.orders.length}건`, 'ok');
  }; }

  // 퇴직 직전 급여변동(육아휴직 등) 감지 → 평균임금 종료일 자동 이동
  function applyAvgEnd() {
    const 퇴직일 = $('#pn-leave').value;
    const note = $('#pn-avgend-note');
    pf.shift = null;
    if (!퇴직일 || !PV.pensionSuggestAvgEnd || (!pf.orders.length && !pf.vac.length)) { if (note) note.textContent = ''; return; }
    const s = PV.pensionSuggestAvgEnd(pf.orders, pf.vac, 퇴직일);
    if (s.shifted) {
      $('#pn-avgend').value = s.종료일; pf.shift = s;
      if (note) note.innerHTML = `⚠ 급여변동 감지: <b>${esc(s.사유)}</b> ${s.시작일}~ → 평균임금 종료일 <b>${s.종료일}</b>로 자동 이동 (수정 가능)`;
    } else if (note) note.textContent = '';
  }
  { const lv = $('#pn-leave'); if (lv) lv.onchange = applyAvgEnd; }

  { const b = $('#pn-calc'); if (b) b.onclick = () => {
    try {
      const 입사일 = $('#pn-join').value, 퇴직일 = $('#pn-leave').value;
      if (!입사일 || !퇴직일) { toast('입사일·퇴직일은 필수입니다', 'bad'); return; }
      if (입사일 >= 퇴직일) { toast('퇴직일이 입사일보다 뒤여야 합니다', 'bad'); return; }
      if (!pf.sal.length) { toast('연봉내역을 불러오거나 추가하세요', 'bad'); return; }
      const input = {
        사번: $('#pn-sabun').value.trim(), 성명: $('#pn-name').value.trim(), 제도: $('#pn-type').value,
        입사일, 퇴직일, 평균임금종료일: $('#pn-avgend').value || null, 중간정산일: $('#pn-mid').value || null,
        연차수당: pnum($('#pn-annual').value), 고정역량월: pnum($('#pn-duty').value),
        연봉계약: pf.sal, 제외기간: pf.excl.filter(e => e.시작 && e.종료),
        발령: pf.orders, 휴가: pf.vac, shift: pf.shift,
      };
      pnLast = PV.computeSeverance(input); renderPensionResult(pnLast);
    } catch (e) { console.error(e); toast('계산 오류: ' + e.message, 'bad'); }
  }; }

  function renderPensionResult(r) {
    const box = $('#pn-result');
    const i = r.info, sv = r.service, tx = r.tax;
    const ws = k => r.window.rows.reduce((a, x) => a + x[k], 0);
    const winRows = r.window.rows.map(x => `<tr><td class="l">${x.기간}</td><td>${x.일수}</td><td>${pwon(x.급여)}</td><td>${pwon(x.능력급)}</td><td>${pwon(x.성과급)}</td><td>${pwon(x.기타)}</td></tr>`).join('');
    const avgRows = r.avg.rows.map(x => `<tr><td class="l">${x.구분}</td><td>${pwon(x.지급총액)}</td><td>${pwon(x.평균임금)}</td></tr>`).join('');
    box.innerHTML = `
      <div class="pn-card">
        <h3>기본정보 ${i.제도 === 'DC' ? '<span class="pn-badge">DC</span>' : '<span class="pn-badge">DB</span>'}<span class="pn-exp" id="pn-export" title="계산근거·백데이터를 텍스트 파일로 저장">⬇ 내보내기</span><span class="pn-exp" id="pn-back" title="고려한 발령·휴가·연봉계약 백데이터 보기">🗂 백데이터</span></h3>
        <div class="pn-kv">
          <div class="k">사번 · 성명</div><div class="v">${esc(i.사번 || '-')} · ${esc(i.성명 || '-')}</div>
          <div class="k">입사일 → 퇴직일</div><div class="v">${i.입사일} → ${i.퇴직일}</div>
          <div class="k">평균임금 산정 종료일</div><div class="v">${i.endISO}${r.back && r.back.shift ? ` <span style="color:var(--warn)">(급여변동 이동: ${esc(r.back.shift.사유 || '')})</span>` : ''}</div>
          ${i.중간정산일 ? `<div class="k">중간정산일</div><div class="v">${i.중간정산일}</div>` : ''}
        </div>
      </div>

      <div class="pn-card">
        <h3>직전 3개월 임금총액</h3>
        <table class="pn-tbl"><thead><tr><th class="l">기간</th><th>일수</th><th>급여</th><th>능력급</th><th>성과급</th><th>기타</th></tr></thead>
        <tbody>${winRows}</tbody>
        <tfoot><tr><td class="l">합계 ${r.window.totalDays}일</td><td>${r.window.totalDays}</td><td>${pwon(ws('급여'))}</td><td>${pwon(ws('능력급'))}</td><td>${pwon(ws('성과급'))}</td><td>${pwon(ws('기타'))}</td></tr></tfoot></table>
        <div class="pn-mut">연봉내역 ÷12 기반 · 부분월 일할 · 성과가급 12분할 · 고정역량가급은 급여대장/수기</div>
      </div>

      <div class="pn-card">
        <h3>평균임금 산출내역</h3>
        <table class="pn-tbl"><thead><tr><th class="l">구분</th><th>지급총액</th><th>평균임금(30일분)</th></tr></thead>
        <tbody>${avgRows}</tbody>
        <tfoot><tr><td class="l">합계</td><td>${pwon(r.avg.합계지급총액)}</td><td>${pwon(r.avg.평균임금30)}</td></tr></tfoot></table>
        <div class="pn-mut">평균임금 = 지급총액 ÷ ${r.window.totalDays}일 × 30 · <b>연차수당은 표기=전액(${pwon(r.avg.연차전액)}), 계산=3개월분(×3/12=${pwon(r.avg.연차반영)})</b></div>
      </div>

      <div class="pn-card">
        <h3>재직연수 · 지급계수</h3>
        <div class="pn-kv">
          <div class="k">일수법</div><div class="v">${sv.산입일수.toLocaleString()}일 ÷ 365 = ${sv.일수계수}</div>
          <div class="k">월력법</div><div class="v">${sv.합_Y}년 ${sv.합_M}개월 ${sv.합_D}일 → ${sv.총개월}개월 ÷ 12 = ${sv.월력계수}</div>
          <div class="k">채택 계수</div><div class="v" style="color:var(--brand)">${sv.계수} <b>(${sv.method})</b></div>
        </div>
      </div>

      <div class="pn-card">
        <h3>퇴직소득세 산출내역</h3>
        <div class="pn-kv">
          <div class="k">① 세전 퇴직급여</div><div class="v">${pwon(r.퇴직급여)}</div>
          <div class="k">② 근속연수</div><div class="v">${tx.근속연수}년</div>
          <div class="k">③ 근속연수공제</div><div class="v">${pwon(tx.근속연수공제)}</div>
          <div class="k">④ 환산급여</div><div class="v">${pwon(tx.환산급여)}</div>
          <div class="k">⑤ 환산급여공제</div><div class="v">${pwon(tx.환산급여공제)}</div>
          <div class="k">⑥ 과세표준</div><div class="v">${pwon(tx.과세표준)}</div>
          <div class="k">　└ 적용세율</div><div class="v" style="color:var(--brand)">${(tx.세율 * 100).toFixed(0)}% <span style="color:var(--text-3);font-weight:600">(누진공제 ${pwon(tx.누진공제)})</span></div>
          <div class="k">⑦ 환산산출세액</div><div class="v">${pwon(tx.환산산출세액)}</div>
          <div class="k">⑧ 산출세액(소득세)</div><div class="v">${pwon(tx.산출세액)}</div>
          <div class="k">⑨ 지방소득세</div><div class="v">${pwon(tx.지방소득세)}</div>
          <div class="k">세액 합계</div><div class="v" style="color:var(--bad)">− ${pwon(tx.세액계)}</div>
        </div>
        <div class="pn-final"><span>실지급액 (세후)</span><span>${pwon(r.실지급액)} 원</span></div>
        ${r.dc ? `<div class="pn-mut">DC 제도 — 동일 산식으로 산출. 회사 부담은 미적립 기간분만 지급(미적립금은 별도 확인).</div>` : ''}
      </div>`;
    const eb = $('#pn-export'); if (eb) eb.onclick = () => exportPension(r);
    const bb = $('#pn-back'); if (bb) bb.onclick = () => openPensionBackdata(r);
  }

  function openPensionBackdata(r) {
    const ov = el('div', 'pn-modal-ov');
    ov.innerHTML = `<div class="pn-modal"><div class="pn-modal-h"><b>고려한 백데이터</b> <span class="pf-h">${esc(r.info.사번 || '')} ${esc(r.info.성명 || '')}</span><span class="pn-modal-x">✕</span></div><div class="pn-modal-b">${backdataHtml(r.back)}</div></div>`;
    ov.onclick = e => { if (e.target === ov) ov.remove(); };
    ov.querySelector('.pn-modal-x').onclick = () => ov.remove();
    document.body.appendChild(ov);
  }

  function backdataHtml(b) {
    if (!b) return '<div class="pn-mut">없음</div>';
    const sal = (b.연봉계약 || []).map(s => `<tr><td class="l">${esc(s.연봉일자 || '-')}</td><td>${pwon(s.기본급)}</td><td>${pwon(s.실적급)}</td><td>${pwon(s.성과급)}</td><td>${pwon(s.성과가급)}</td><td>${pwon(s.변동역량1)}</td><td>${pwon(s.변동역량2)}</td></tr>`).join('');
    const ord = (b.발령 || []).slice().sort((a, c) => (c.발령시작일 || '') < (a.발령시작일 || '') ? -1 : 1).map(o => `<div class="pn-bd-li">📋 ${esc(o.발령시작일 || '')} ${esc(o.발령구분 || '')}${o.퇴직일 ? ' (퇴직일 ' + esc(o.퇴직일) + ')' : ''}</div>`).join('');
    const vac = (b.휴가 || []).slice().sort((a, c) => (c.시작일 || '') < (a.시작일 || '') ? -1 : 1).slice(0, 40).map(v => `<div class="pn-bd-li">🏖 ${esc(v.시작일 || '')}${v.종료일 && v.종료일 !== v.시작일 ? '~' + esc(v.종료일) : ''} ${esc(v.종류 || '')} ${esc(v.일수 != null ? v.일수 + '일' : '')}</div>`).join('');
    const exc = (b.제외기간 || []).map(e => `<div class="pn-bd-li">⛔ ${esc(e.시작)} ~ ${esc(e.종료)} (근속 제외)</div>`).join('');
    return `
      <div class="pn-bd-sub">연봉계약 (÷12 반영)</div>
      <table class="pn-tbl"><thead><tr><th class="l">연봉일자</th><th>기본급</th><th>능력급</th><th>성과급</th><th>성과가급</th><th>변동1</th><th>변동2</th></tr></thead><tbody>${sal || '<tr><td colspan="7" class="l">없음</td></tr>'}</tbody></table>
      ${b.shift ? `<div class="pn-mut" style="color:var(--warn);margin-top:8px">⚠ 급여변동(${esc(b.shift.사유 || '')} ${esc(b.shift.시작일 || '')}~) 감지 → 평균임금 종료일 ${esc(b.shift.종료일 || '')}로 이동</div>` : ''}
      ${exc ? `<div class="pn-bd-sub">근속 제외기간</div>${exc}` : ''}
      <div class="pn-bd-sub">발령 이력</div>${ord || '<div class="pn-mut">없음</div>'}
      ${vac ? `<div class="pn-bd-sub">휴가 (최근 40건)</div>${vac}` : ''}`;
  }

  function exportPension(r) {
    const i = r.info, sv = r.service, tx = r.tax, nf = n => Math.round(n || 0).toLocaleString('ko-KR');
    const L = [];
    L.push(`[퇴직급여 계산근거]  ${i.사번 || ''} ${i.성명 || ''}  (${i.제도})`);
    L.push('='.repeat(46));
    L.push(`입사일 ${i.입사일} → 퇴직일 ${i.퇴직일}`);
    L.push(`평균임금 산정 종료일 ${i.endISO}${r.back && r.back.shift ? ` (급여변동 이동: ${r.back.shift.사유})` : ''}`);
    if (i.중간정산일) L.push(`중간정산일 ${i.중간정산일}`);
    L.push('');
    L.push('[직전 3개월 임금총액]  기간 | 일수 | 급여 | 능력급 | 성과급 | 기타');
    r.window.rows.forEach(x => L.push(`  ${x.기간} | ${x.일수} | ${nf(x.급여)} | ${nf(x.능력급)} | ${nf(x.성과급)} | ${nf(x.기타)}`));
    L.push(`  합계 ${r.window.totalDays}일`);
    L.push('');
    L.push('[평균임금 산출]  구분 | 지급총액 | 평균임금(30일분)');
    r.avg.rows.forEach(x => L.push(`  ${x.구분} | ${nf(x.지급총액)} | ${nf(x.평균임금)}`));
    L.push(`  합계 | ${nf(r.avg.합계지급총액)} | ${nf(r.avg.평균임금30)}`);
    L.push(`  ※ 연차수당 표기=전액 ${nf(r.avg.연차전액)}, 계산=3개월분 ${nf(r.avg.연차반영)}`);
    L.push('');
    L.push('[재직연수·지급계수]');
    L.push(`  일수법 ${sv.산입일수}일 ÷ 365 = ${sv.일수계수}`);
    L.push(`  월력법 ${sv.합_Y}년 ${sv.합_M}개월 ${sv.합_D}일 → ${sv.총개월}개월 ÷ 12 = ${sv.월력계수}`);
    L.push(`  채택 ${sv.계수} (${sv.method})`);
    L.push('');
    L.push('[퇴직소득세]');
    L.push(`  세전 퇴직급여 ${nf(r.퇴직급여)}`);
    L.push(`  근속연수 ${tx.근속연수}년 · 근속연수공제 ${nf(tx.근속연수공제)}`);
    L.push(`  환산급여 ${nf(tx.환산급여)} · 환산급여공제 ${nf(tx.환산급여공제)}`);
    L.push(`  과세표준 ${nf(tx.과세표준)} · 적용세율 ${(tx.세율 * 100).toFixed(0)}% (누진공제 ${nf(tx.누진공제)})`);
    L.push(`  산출세액 ${nf(tx.산출세액)} · 지방소득세 ${nf(tx.지방소득세)} · 세액계 ${nf(tx.세액계)}`);
    L.push(`  ★ 실지급액(세후) ${nf(r.실지급액)}`);
    L.push('');
    L.push('[고려한 백데이터]');
    L.push(' 연봉계약: ' + (r.back.연봉계약 || []).map(s => `${s.연봉일자}(기본${nf(s.기본급)}/성과${nf(s.성과급)}/성과가${nf(s.성과가급)}/변동1 ${nf(s.변동역량1)}/변동2 ${nf(s.변동역량2)})`).join(' · '));
    (r.back.제외기간 || []).forEach(e => L.push(`  제외 ${e.시작}~${e.종료}`));
    (r.back.발령 || []).slice().sort((a, c) => (a.발령시작일 || '') < (c.발령시작일 || '') ? 1 : -1).forEach(o => L.push(`  발령 ${o.발령시작일} ${o.발령구분}${o.퇴직일 ? ' (퇴직일 ' + o.퇴직일 + ')' : ''}`));
    (r.back.휴가 || []).slice().sort((a, c) => (a.시작일 || '') < (c.시작일 || '') ? 1 : -1).forEach(v => L.push(`  휴가 ${v.시작일}${v.종료일 && v.종료일 !== v.시작일 ? '~' + v.종료일 : ''} ${v.종류 || ''} ${v.일수 != null ? v.일수 + '일' : ''}`));
    dlText(`퇴직급여_${i.사번 || ''}_${i.성명 || ''}.txt`, L.join('\n'));
    toast('계산근거 텍스트 저장', 'ok');
  }

  renderSalRows(); renderExclRows();
})(window.PV);
