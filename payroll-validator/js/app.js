/* ============================================================
   app.js — UI 오케스트레이션
   흐름: 입력 → [급여계산](새 창 명세서) → 급여대장 업로드 → [검증](새 창 결과)
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
    files: {}, uploads: { annual: new Map(), prod: new Map(), etc: new Map() },
    discipline: [], carry: new Map(),
  };
  let payrollResult = null, verifyResult = null;

  /* ---------- theme ---------- */
  const THEME_KEY = 'pv-theme';
  function curTheme() { return document.documentElement.getAttribute('data-theme') || 'light'; }
  function setTheme(t) { document.documentElement.setAttribute('data-theme', t); try { localStorage.setItem(THEME_KEY, t); } catch (e) {} }
  (function () { let t = 'light'; try { t = localStorage.getItem(THEME_KEY) || 'light'; } catch (e) {} setTheme(t); })();
  $('#themeBtn').onclick = () => setTheme(curTheme() === 'dark' ? 'light' : 'dark');

  /* ---------- toast ---------- */
  function toast(msg, kind) {
    const t = el('div', 'toast' + (kind ? ' ' + kind : ''), `<span>${esc(msg)}</span>`);
    $('#toasts').appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(10px)'; setTimeout(() => t.remove(), 300); }, 2600);
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

  /* ---------- folder ---------- */
  $('#folderInput').onchange = async (e) => {
    const files = [...e.target.files].filter(f => /\.x(lsx|ls)$/i.test(f.name));
    if (!files.length) { toast('엑셀 파일이 없습니다', 'bad'); return; }
    let ok = 0;
    for (const f of files) {
      try {
        const res = PV.readWorkbook(await readFile(f), f.name);
        if (res.type === 'unknown' || !res.data) continue;
        if (res.type === 'ledger') { store.ledger = res.data; store.files.ledger = f.name; markLedger(); continue; }
        store[res.type] = res.data; store.files[res.type] = f.name; ok++;
      } catch (err) { console.error(f.name, err); }
    }
    $('#folderBadge').textContent = '연결됨'; $('#folderBadge').className = 'badge g';
    renderFolder(); detectCarry(); updatePayday(); refresh();
    toast(`폴더 인식 완료 · ${ok}개 기준 파일`, 'ok');
  };
  function renderFolder() {
    const wrap = $('#folderFiles'); wrap.innerHTML = '';
    ['salary', 'roster', 'order', 'vacation', 'holiday'].forEach(type => {
      const lab = PV.FILE_LABELS[type], loaded = store[type] != null;
      const cnt = type === 'holiday' ? (store.holiday || []).length : (store[type] ? store[type].length : 0);
      const it = el('div', 'fileitem ' + (loaded ? 'ok' : 'miss'));
      it.innerHTML = `<span class="dot"></span>
        <div><div class="fi-name">${lab.name}</div><div class="fi-sub">${lab.sub}</div></div>
        <div class="fi-meta">${loaded ? `<span class="badge g">${cnt}${type === 'holiday' ? '일' : '건'}</span>` : '<span class="badge n">미인식</span>'}
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

  /* ---------- 이월 휴직 감지 ---------- */
  function detectCarry() {
    if (!store.roster) return;
    const orderBy = new Map(); (store.order || []).forEach(o => { if (!orderBy.has(o.사번)) orderBy.set(o.사번, []); orderBy.get(o.사번).push(o); });
    const cands = store.roster.filter(r => (r.직무 || '').includes('(휴직)') && !(orderBy.get(r.사번) || []).some(o => /휴직/.test(o.발령구분 || '')));
    const box = $('#carryList'); box.innerHTML = '';
    $('#carryBadge').textContent = cands.length; $('#carryBadge').className = 'badge ' + (cands.length ? 'g' : 'n');
    if (!cands.length) { box.innerHTML = '<div class="empty">이월 휴직 대상자가 없습니다</div>'; return; }
    const t = el('table', 'mini');
    t.innerHTML = '<thead><tr><th>사번</th><th>성명</th><th>휴직시작일</th><th>종류</th></tr></thead>';
    const tb = el('tbody');
    cands.forEach(r => {
      const cur = store.carry.get(r.사번) || {};
      const tr = el('tr');
      tr.innerHTML = `<td>${esc(r.사번)}</td><td>${esc(r.성명)}</td>
        <td><input type="date" data-k="시작일" value="${cur.시작일 || ''}"></td>
        <td><select class="inp" data-k="종류"><option value="">선택</option>
          ${['육아휴직', '무급휴직', '가족돌봄휴직', '난임휴직', '의병휴직'].map(x => `<option ${cur.종류 === x ? 'selected' : ''}>${x}</option>`).join('')}
        </select></td>`;
      tr.querySelectorAll('[data-k]').forEach(inp => inp.onchange = () => { const o = store.carry.get(r.사번) || {}; o[inp.dataset.k] = inp.value; store.carry.set(r.사번, o); });
      tb.appendChild(tr);
    });
    t.appendChild(tb); box.appendChild(t);
  }

  /* ---------- enable buttons ---------- */
  function refresh() {
    $('#calcBtn').disabled = !(store.salary && store.roster && store.order);
    $('#verifyBtn').disabled = !(payrollResult && !payrollResult.blocked && store.ledger);
  }

  function storeForEngine() {
    return { salary: store.salary, roster: store.roster, order: store.order, vacation: store.vacation, holiday: store.holiday, ledger: store.ledger, uploads: store.uploads, discipline: store.discipline, carry: store.carry };
  }

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
      const d = el('div', 'alert ' + a.level);
      d.innerHTML = `<div class="a-ic"><svg viewBox="0 0 24 24">${ALERT_ICON[a.level] || ALERT_ICON.info}</svg></div>
        <div><div class="a-t">${esc(a.title)}</div><div class="a-d">${esc(a.desc || '')}</div></div>`;
      box.appendChild(d);
    });
  }

  /* ---------- STEP A: 급여계산 ---------- */
  $('#calcBtn').onclick = () => {
    try {
      const res = PV.computePayroll(storeForEngine(), target());
      payrollResult = res; verifyResult = null;
      $('#calcTiles').classList.remove('hidden');
      $('#tiTotal').textContent = res.summary.total; $('#tiIlhal').textContent = res.summary.ilhal;
      $('#tiSpecial').textContent = res.summary.special; $('#tiWarn').textContent = res.summary.warn;
      $('#tiBlock').textContent = res.summary.block;
      renderAlerts($('#calcAlerts'), res.alerts);
      $('#calcActions').classList.toggle('hidden', res.blocked);
      ensureExtraButtons();
      refresh();
      if (res.blocked) { toast('연봉 미입력 — 전체 계산 차단', 'bad'); }
      else { openPayrollWindow(); toast(`급여계산 완료 · ${res.summary.total}명`, 'ok'); }
    } catch (err) { console.error(err); toast('오류: ' + err.message, 'bad'); }
  };
  $('#openCalcBtn').onclick = openPayrollWindow;

  /* ---------- STEP B: 검증 ---------- */
  $('#verifyBtn').onclick = () => {
    if (!payrollResult) { toast('먼저 급여계산을 실행하세요', 'bad'); return; }
    try {
      const res = PV.compareLedger(payrollResult, storeForEngine());
      verifyResult = res;
      $('#verifyTiles').classList.remove('hidden');
      $('#tiOk').textContent = res.summary.ok; $('#tiBad').textContent = res.summary.bad;
      renderAlerts($('#verifyAlerts'), res.alerts);
      $('#verifyActions').classList.remove('hidden');
      ensureExtraButtons();
      openVerifyWindow();
      toast(res.summary.bad ? `검증 완료 · 불일치 ${res.summary.bad}명` : '전원 완전일치', res.summary.bad ? '' : 'ok');
    } catch (err) { console.error(err); toast('오류: ' + err.message, 'bad'); }
  };
  $('#openVerifyBtn').onclick = openVerifyWindow;

  // 엑셀 버튼 동적 추가
  function ensureExtraButtons() {
    if (!$('#calcExcel') && payrollResult && !payrollResult.blocked) {
      const b = el('button', 'btn btn-ghost btn-block', '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg> 급여명세 엑셀');
      b.id = 'calcExcel'; b.style.marginTop = '8px'; b.onclick = exportPayroll; $('#calcActions').appendChild(b);
    }
    if (!$('#verifyExcel') && verifyResult) {
      const b = el('button', 'btn btn-ghost btn-block', '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg> 검증결과 엑셀');
      b.id = 'verifyExcel'; b.style.marginTop = '8px'; b.onclick = exportVerify; $('#verifyActions').appendChild(b);
    }
  }

  /* ================= 새 창 렌더 ================= */
  const WIN_CSS = `
  *{box-sizing:border-box}body{margin:0;font-family:-apple-system,"Segoe UI","Apple SD Gothic Neo","Noto Sans KR",sans-serif;background:var(--bg);color:var(--tx);font-size:12.5px}
  :root{--bg:#eef1f7;--su:#fff;--su2:#f5f8fd;--bd:#e2e8f2;--tx:#1c2436;--tx2:#5a6579;--tx3:#8a94a8;--br:#4f6bff;--ok:#12b76a;--bad:#f04438;--warn:#f79009;--info:#2e90fa;--oks:#e5f7ee;--bads:#fdeceb;--warns:#fdf1df}
  [data-theme=dark]{--bg:#0c0f17;--su:#161b28;--su2:#1b2130;--bd:#252c3c;--tx:#eef2fb;--tx2:#a4afc4;--tx3:#6f7a91;--br:#6d84ff;--ok:#3ddc90;--bad:#ff6b60;--warn:#ffb454;--info:#5aa9ff;--oks:#123123;--bads:#331715;--warns:#33260f}
  .top{background:var(--su);border-bottom:1px solid var(--bd);padding:14px 22px;display:flex;align-items:center;gap:14px}
  .top h1{font-size:16px;margin:0;font-weight:800}.top .m{color:var(--tx3);font-size:12px;font-weight:600}
  .top .sp{flex:1}
  .top button{font-family:inherit;font-weight:700;font-size:12px;border:1px solid var(--bd);background:var(--su2);color:var(--tx2);border-radius:9px;padding:8px 14px;cursor:pointer}
  .top button:hover{border-color:var(--br);color:var(--br)}
  .wrap{padding:18px 22px 60px}
  .tbl{border:1px solid var(--bd);border-radius:12px;overflow:hidden}
  table{width:100%;border-collapse:collapse;background:var(--su)}
  th{background:var(--su2);color:var(--tx3);font-size:10.5px;text-transform:uppercase;letter-spacing:.03em;padding:10px 10px;text-align:right;position:sticky;top:0;z-index:2;border-bottom:1px solid var(--bd);white-space:nowrap}
  th.l{text-align:left}
  td{padding:9px 10px;border-bottom:1px solid var(--bd);text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
  td.l{text-align:left}tr:last-child td{border-bottom:none}
  tbody tr:hover{background:var(--su2)}
  .rbad{background:var(--bads)}.rbad:hover{background:var(--bads)}
  .tot{font-weight:800}
  .note{color:var(--tx2);font-size:11px;text-align:left;white-space:normal;max-width:320px;line-height:1.45}
  .tag{display:inline-block;padding:1px 7px;border-radius:20px;font-size:10px;font-weight:800;margin:1px 2px 1px 0}
  .tag.ilhal{background:var(--warns);color:var(--warn)}.tag.sp{background:#eef;color:var(--br)}
  .tag.warn{background:var(--warns);color:var(--warn)}.tag.diff{background:var(--bads);color:var(--bad)}
  .pill{padding:2px 9px;border-radius:20px;font-size:11px;font-weight:800}
  .pill.ok{background:var(--oks);color:var(--ok)}.pill.bad{background:var(--bads);color:var(--bad)}
  .sum{display:flex;gap:14px;margin-bottom:14px;flex-wrap:wrap}
  .sc{background:var(--su);border:1px solid var(--bd);border-radius:10px;padding:10px 16px}
  .sc .k{font-size:10.5px;color:var(--tx3);font-weight:700}.sc .v{font-size:20px;font-weight:850}
  .dpos{color:var(--bad);font-weight:800}.dneg{color:var(--info);font-weight:800}
  @media print{.top button{display:none}.top{position:static}}
  `;
  function openWin(title, bodyHTML) {
    const w = window.open('', '_blank');
    if (!w) { toast('팝업이 차단되었습니다. 팝업 허용 후 다시 시도하세요.', 'bad'); return; }
    w.document.write(`<!DOCTYPE html><html data-theme="${curTheme()}"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${WIN_CSS}</style></head><body>${bodyHTML}</body></html>`);
    w.document.close();
  }

  function usedItemCols(rows) {
    const set = new Set();
    rows.forEach(r => Object.keys(r.pay || r.ours || {}).forEach(k => { const v = (r.pay || r.ours)[k]; if (v) set.add(k); }));
    const order = PV.LEDGER_ITEMS.slice();
    const cols = order.filter(c => set.has(c));
    [...set].forEach(c => { if (!cols.includes(c)) cols.push(c); });
    return cols;
  }

  function openPayrollWindow() {
    const res = payrollResult; if (!res) { toast('먼저 급여계산을 실행하세요', 'bad'); return; }
    if (res.blocked) { openWin('급여계산 차단', `<div class="top"><h1>급여계산 차단</h1></div><div class="wrap"><table><thead><tr><th class="l">사번</th><th class="l">사유</th><th class="l">필요 연봉일자</th></tr></thead><tbody>${res.block.map(b => `<tr class="rbad"><td class="l">${esc(b.사번)}</td><td class="l">${esc(b.reason)}</td><td class="l">${esc(b.일자)}</td></tr>`).join('')}</tbody></table></div>`); return; }
    const cols = usedItemCols(res.rows);
    const ym = `${res.target.y}-${String(res.target.m).padStart(2, '0')}`;
    const head = `<tr><th class="l">No</th><th class="l">사번</th><th class="l">성명</th><th class="l">소속</th>${cols.map(c => `<th>${esc(c)}</th>`).join('')}<th>총액</th><th class="l">비고</th></tr>`;
    const body = res.rows.map((r, i) => {
      const tags = (r.notes || []).map(n => `<span class="tag ${n.startsWith('일할') ? 'ilhal' : n.includes('확인') ? 'warn' : 'sp'}">${esc(n)}</span>`).join('');
      return `<tr><td class="l">${i + 1}</td><td class="l">${esc(r.사번)}</td><td class="l">${esc(r.성명)}</td><td class="l">${esc(r.소속)}</td>
        ${cols.map(c => `<td>${r.pay[c] ? won(r.pay[c]) : '<span style="color:var(--tx3)">·</span>'}</td>`).join('')}
        <td class="tot">${won(r.total)}</td><td class="note">${tags || '<span style="color:var(--tx3)">—</span>'}</td></tr>`;
    }).join('');
    const sum = `<div class="sum">
      <div class="sc"><div class="k">대상 인원</div><div class="v">${res.summary.total}</div></div>
      <div class="sc"><div class="k">일할</div><div class="v">${res.summary.ilhal}</div></div>
      <div class="sc"><div class="k">특이</div><div class="v">${res.summary.special}</div></div>
      <div class="sc"><div class="k">점검</div><div class="v">${res.summary.warn}</div></div></div>`;
    openWin(`급여명세 ${ym}`, `<div class="top"><h1>급여명세 리스트</h1><span class="m">${ym} · 지급일 ${res.payday}</span><span class="sp"></span><button onclick="window.print()">인쇄 / PDF</button></div><div class="wrap">${sum}<div class="tbl"><table><thead>${head}</thead><tbody>${body}</tbody></table></div></div>`);
  }

  function openVerifyWindow() {
    const res = verifyResult; if (!res) { toast('먼저 검증을 실행하세요', 'bad'); return; }
    const ym = `${res.target.y}-${String(res.target.m).padStart(2, '0')}`;
    const body = res.rows.map((r, i) => {
      const diff = r.ourTotal - r.ledTotal;
      const diffTags = (r.diffs || []).filter(d => d.col !== '—').map(d => `<span class="tag diff">${esc(d.col)} ${d.diff > 0 ? '+' : ''}${won(d.diff)}</span>`).join('');
      const noteTags = (r.notes || []).filter(n => !n.startsWith('불일치')).map(n => `<span class="tag ${n.startsWith('일할') ? 'ilhal' : 'sp'}">${esc(n)}</span>`).join('');
      return `<tr class="${r.status === 'bad' ? 'rbad' : ''}"><td class="l">${i + 1}</td><td class="l">${esc(r.사번)}</td><td class="l">${esc(r.성명)}</td><td class="l">${esc(r.소속)}</td>
        <td>${won(r.ourTotal)}</td><td>${won(r.ledTotal)}</td>
        <td class="${diff > 0 ? 'dpos' : diff < 0 ? 'dneg' : ''}">${diff === 0 ? '0' : (diff > 0 ? '+' : '') + won(diff)}</td>
        <td class="l"><span class="pill ${r.status}">${r.status === 'ok' ? '일치' : '불일치'}</span></td>
        <td class="note">${diffTags}${noteTags || (r.status === 'ok' && !diffTags ? '<span style="color:var(--tx3)">—</span>' : '')}</td></tr>`;
    }).join('');
    const sum = `<div class="sum">
      <div class="sc"><div class="k">대상</div><div class="v">${res.summary.total}</div></div>
      <div class="sc"><div class="k" style="color:var(--ok)">일치</div><div class="v" style="color:var(--ok)">${res.summary.ok}</div></div>
      <div class="sc"><div class="k" style="color:var(--bad)">불일치</div><div class="v" style="color:var(--bad)">${res.summary.bad}</div></div></div>`;
    openWin(`검증결과 ${ym}`, `<div class="top"><h1>검증 결과</h1><span class="m">${ym} · 계산 vs 급여대장(세전)</span><span class="sp"></span><button onclick="window.print()">인쇄 / PDF</button></div><div class="wrap">${sum}<div class="tbl"><table><thead><tr><th class="l">No</th><th class="l">사번</th><th class="l">성명</th><th class="l">소속</th><th>계산총액</th><th>대장총액</th><th>차이</th><th class="l">상태</th><th class="l">비고 (특이/불일치)</th></tr></thead><tbody>${body}</tbody></table></div></div>`);
  }

  /* ================= 엑셀 export ================= */
  function exportPayroll() {
    const res = payrollResult; if (!res || res.blocked) return;
    const cols = usedItemCols(res.rows), wb = XLSX.utils.book_new();
    const ym = `${res.target.y}-${String(res.target.m).padStart(2, '0')}`;
    const aoa = [['No', '사번', '성명', '소속', ...cols, '총액', '비고']];
    res.rows.forEach((r, i) => aoa.push([i + 1, r.사번, r.성명, r.소속, ...cols.map(c => r.pay[c] || 0), r.total, (r.notes || []).join(' / ')]));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), '급여명세');
    const alr = [['구분', '제목', '내용']]; const lv = { block: '차단', warn: '점검', info: '내역', ok: '정상', bad: '불일치' };
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
