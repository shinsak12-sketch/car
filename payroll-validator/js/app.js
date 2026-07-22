/* ============================================================
   app.js — UI 오케스트레이션 / 파일 처리 / 렌더 / 엑셀 export
   ============================================================ */
(function (PV) {
  'use strict';
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const won = n => (n == null ? '' : Math.round(n).toLocaleString('ko-KR'));
  const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };

  const store = {
    salary: null, roster: null, order: null, vacation: null, holiday: [], ledger: null,
    files: {}, // type → filename
    uploads: { annual: new Map(), prod: new Map(), etc: new Map() },
    discipline: [], carry: new Map(),
  };
  let lastResult = null;

  /* ---------- theme ---------- */
  const THEME_KEY = 'pv-theme';
  function setTheme(t) { document.documentElement.setAttribute('data-theme', t); try { localStorage.setItem(THEME_KEY, t); } catch (e) {} }
  (function initTheme() { let t = 'light'; try { t = localStorage.getItem(THEME_KEY) || 'light'; } catch (e) {} setTheme(t); })();
  $('#themeBtn').onclick = () => setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');

  /* ---------- toast ---------- */
  function toast(msg, kind) {
    const t = el('div', 'toast' + (kind ? ' ' + kind : ''), `<span>${msg}</span>`);
    $('#toasts').appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(10px)'; setTimeout(() => t.remove(), 300); }, 2600);
  }

  /* ---------- period ---------- */
  (function initPeriod() {
    const sy = $('#selYear'), sm = $('#selMonth');
    const now = new Date();
    for (let y = now.getFullYear() + 1; y >= 2023; y--) { const o = el('option'); o.value = y; o.textContent = y + '년'; sy.appendChild(o); }
    for (let m = 1; m <= 12; m++) { const o = el('option'); o.value = m; o.textContent = m + '월'; sm.appendChild(o); }
    sy.value = now.getFullYear(); sm.value = now.getMonth() + 1;
    sy.onchange = sm.onchange = updatePayday;
    updatePayday();
  })();
  function target() { return { y: +$('#selYear').value, m: +$('#selMonth').value }; }
  function updatePayday() {
    const { y, m } = target();
    const pd = PV.payday(y, m, new Set(store.holiday || []));
    $('#payDate').textContent = pd.slice(5).replace('-', '.');
  }

  /* ---------- file read ---------- */
  async function readFile(file) { return await file.arrayBuffer(); }

  /* ---------- folder ---------- */
  $('#folderInput').onchange = async (e) => {
    const files = [...e.target.files].filter(f => /\.x(lsx|ls)$/i.test(f.name));
    if (!files.length) { toast('엑셀 파일이 없습니다', 'bad'); return; }
    let ok = 0;
    for (const f of files) {
      try {
        const buf = await readFile(f);
        const res = PV.readWorkbook(buf, f.name);
        if (res.type === 'unknown' || !res.data) continue;
        if (res.type === 'ledger') { store.ledger = res.data; store.files.ledger = f.name; markLedger(); continue; }
        store[res.type] = res.data; store.files[res.type] = f.name; ok++;
      } catch (err) { console.error(f.name, err); }
    }
    $('#folderBadge').textContent = '연결됨'; $('#folderBadge').className = 'badge g';
    renderFolder(); detectCarry(); updatePayday(); refreshRun();
    toast(`폴더 인식 완료 · ${ok}개 기준 파일`, 'ok');
  };

  function renderFolder() {
    const wrap = $('#folderFiles'); wrap.innerHTML = '';
    ['salary', 'roster', 'order', 'vacation', 'holiday'].forEach(type => {
      const lab = PV.FILE_LABELS[type];
      const loaded = store[type] != null;
      const cnt = type === 'holiday' ? (store.holiday || []).length : (store[type] ? store[type].length : 0);
      const it = el('div', 'fileitem ' + (loaded ? 'ok' : 'miss'));
      it.innerHTML = `<span class="dot"></span>
        <div><div class="fi-name">${lab.name}</div><div class="fi-sub">${lab.sub}</div></div>
        <div class="fi-meta">${loaded ? `<span class="badge g">${cnt}${type === 'holiday' ? '일' : '건'}</span>` : '<span class="badge n">미인식</span>'}
        <div class="fi-file">${store.files[type] || ''}</div></div>`;
      wrap.appendChild(it);
    });
  }

  /* ---------- ledger ---------- */
  $('#ledgerInput').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { const res = PV.readWorkbook(await readFile(f), f.name);
      if (res.type !== 'ledger') { toast('급여대장 형식이 아닙니다', 'bad'); return; }
      store.ledger = res.data; store.files.ledger = f.name; markLedger(); refreshRun(); toast('급여대장 첨부 완료', 'ok');
    } catch (err) { toast('읽기 실패', 'bad'); console.error(err); }
  };
  function markLedger() {
    const n = store.ledger ? store.ledger.length : 0;
    $('#ledgerBadge').textContent = n ? `${n}행` : '미첨부';
    $('#ledgerBadge').className = 'badge ' + (n ? 'g' : 'n');
    const dz = $('#ledgerDrop'); if (n) dz.querySelector('.dz-t').textContent = store.files.ledger || '첨부됨';
  }

  /* ---------- variable uploads ---------- */
  $$('.upfile').forEach(inp => inp.onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const kind = inp.dataset.up;
    try {
      const rows = PV.readAmount(await readFile(f), kind === 'etc');
      const map = store.uploads[kind]; map.clear();
      if (kind === 'etc') rows.forEach(r => { if (!map.has(r.사번)) map.set(r.사번, []); map.get(r.사번).push({ 구분: r.구분, 금액: r.금액 }); });
      else rows.forEach(r => map.set(r.사번, r.금액));
      const row = $('#up-' + kind); row.classList.add('loaded');
      $('#sub-' + kind).textContent = `${rows.length}건 · ${f.name}`;
      toast('업로드 완료', 'ok');
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
      tr.innerHTML = `<td><input type="text" value="${d.사번 || ''}" style="width:82px" data-k="사번"></td>
        <td><input type="text" value="${d.성명 || ''}" style="width:64px" data-k="성명"></td>
        <td><select class="inp" data-k="종류"><option ${d.종류 === '감봉' ? 'selected' : ''}>감봉</option><option ${d.종류 === '정직' ? 'selected' : ''}>정직</option></select></td>
        <td style="text-align:right"><input type="number" value="${d.금액 || ''}" style="width:96px;text-align:right" data-k="금액" ${d.종류 === '정직' ? 'disabled placeholder="자동"' : ''}></td>
        <td><span class="rowdel" title="삭제">✕</span></td>`;
      tr.querySelectorAll('[data-k]').forEach(inp => inp.onchange = () => {
        d[inp.dataset.k] = inp.dataset.k === '금액' ? +inp.value : inp.value;
        if (inp.dataset.k === '종류') renderDiscipline();
      });
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
    const cands = [];
    store.roster.forEach(r => {
      if (!(r.직무 || '').includes('(휴직)')) return;
      const os = orderBy.get(r.사번) || [];
      const hasLeaveOrder = os.some(o => /휴직/.test(o.발령구분 || ''));
      if (!hasLeaveOrder) cands.push(r); // 발령에 휴직발령 없음 = 이월 휴직
    });
    const box = $('#carryList'); box.innerHTML = '';
    $('#carryBadge').textContent = cands.length; $('#carryBadge').className = 'badge ' + (cands.length ? 'g' : 'n');
    if (!cands.length) { box.innerHTML = '<div class="empty">이월 휴직 대상자가 없습니다</div>'; return; }
    const t = el('table', 'mini');
    t.innerHTML = '<thead><tr><th>사번</th><th>성명</th><th>휴직시작일</th><th>종류</th></tr></thead>';
    const tb = el('tbody');
    cands.forEach(r => {
      const cur = store.carry.get(r.사번) || {};
      const tr = el('tr');
      tr.innerHTML = `<td>${r.사번}</td><td>${r.성명 || ''}</td>
        <td><input type="date" data-k="시작일" value="${cur.시작일 || ''}"></td>
        <td><select class="inp" data-k="종류">
          <option value="">선택</option>
          <option ${cur.종류 === '육아휴직' ? 'selected' : ''}>육아휴직</option>
          <option ${cur.종류 === '무급휴직' ? 'selected' : ''}>무급휴직</option>
          <option ${cur.종류 === '가족돌봄휴직' ? 'selected' : ''}>가족돌봄휴직</option>
          <option ${cur.종류 === '난임휴직' ? 'selected' : ''}>난임휴직</option>
          <option ${cur.종류 === '의병휴직' ? 'selected' : ''}>의병휴직</option>
        </select></td>`;
      tr.querySelectorAll('[data-k]').forEach(inp => inp.onchange = () => {
        const o = store.carry.get(r.사번) || {}; o[inp.dataset.k] = inp.value; store.carry.set(r.사번, o);
      });
      tb.appendChild(tr);
    });
    t.appendChild(tb); box.appendChild(t);
  }

  /* ---------- run ---------- */
  function refreshRun() {
    const ready = store.salary && store.roster && store.order && store.ledger;
    $('#runBtn').disabled = !ready;
  }
  $('#runBtn').onclick = () => {
    try {
      const res = PV.validate({
        salary: store.salary, roster: store.roster, order: store.order,
        vacation: store.vacation, holiday: store.holiday, ledger: store.ledger,
        uploads: store.uploads, discipline: store.discipline, carry: store.carry,
      }, target());
      lastResult = res; renderResult(res);
      $('#exportBtn').disabled = false;
      toast(res.blocked ? '계산 차단 — 연봉 미입력 확인' : `검증 완료 · 불일치 ${res.summary.bad}명`, res.blocked ? 'bad' : (res.summary.bad ? '' : 'ok'));
    } catch (err) { console.error(err); toast('오류: ' + err.message, 'bad'); }
  };

  /* ---------- render result ---------- */
  const ALERT_ICON = {
    block: '<path d="M12 9v4m0 4h.01M10.3 3.9L2.4 18a2 2 0 001.7 3h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    bad: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M15 9l-6 6M9 9l6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    warn: '<path d="M12 9v4m0 4h.01M10.3 3.9L2.4 18a2 2 0 001.7 3h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    info: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M12 11v5M12 8h.01" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    ok: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M8 12l3 3 5-6" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  };
  let curFilter = 'all', curSearch = '';

  function renderResult(res) {
    const s = res.summary;
    $('#tiTotal').textContent = s.total; $('#tiOk').textContent = s.ok;
    $('#tiBad').textContent = s.bad; $('#tiWarn').textContent = s.warn; $('#tiBlock').textContent = s.block;

    // alerts
    const ab = $('#alerts'); ab.innerHTML = '';
    $('#alertBadge').textContent = res.alerts.length; $('#alertBadge').className = 'badge ' + (res.alerts.length ? 'g' : 'n');
    if (!res.alerts.length) ab.innerHTML = '<div class="empty">특이사항 없음</div>';
    res.alerts.forEach(a => {
      const d = el('div', 'alert ' + a.level);
      d.innerHTML = `<div class="a-ic"><svg viewBox="0 0 24 24">${ALERT_ICON[a.level] || ALERT_ICON.info}</svg></div>
        <div><div class="a-t">${a.title}</div><div class="a-d">${a.desc || ''}</div></div>`;
      ab.appendChild(d);
    });

    $('#resultTools').classList.toggle('hidden', res.blocked || !res.rows.length);
    renderTable();
  }

  function renderTable() {
    const res = lastResult; const area = $('#resultArea');
    if (res.blocked) {
      area.innerHTML = `<div class="placeholder"><svg viewBox="0 0 24 24" fill="none"><path d="M12 9v4m0 4h.01M10.3 3.9L2.4 18a2 2 0 001.7 3h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <div class="ph-t">연봉 미입력으로 전체 계산이 차단되었습니다</div>
        <div class="ph-s">${res.block.map(b => `${b.사번} · ${b.reason}`).join('<br>')}</div></div>`;
      return;
    }
    let rows = res.rows.slice();
    if (curFilter !== 'all') rows = rows.filter(r => r.status === curFilter);
    if (curSearch) { const q = curSearch.toLowerCase(); rows = rows.filter(r => (r.사번 + r.성명).toLowerCase().includes(q)); }
    if (!rows.length) { area.innerHTML = '<div class="placeholder"><div class="ph-t">표시할 항목이 없습니다</div></div>'; return; }

    const wrap = el('div', 'tablewrap');
    const t = el('table', 'result');
    t.innerHTML = `<thead><tr>
      <th class="l">사번</th><th class="l">성명</th><th class="l">소속</th>
      <th>계산 총액</th><th>대장 총액</th><th>차이</th><th style="text-align:center">상태</th></tr></thead>`;
    const tb = el('tbody');
    rows.forEach(r => {
      const diff = r.ourTotal - r.ledTotal;
      const tr = el('tr', r.status === 'bad' ? 'rowbad' : '');
      const statusPill = r.status === 'ok'
        ? '<span class="pill ok">일치</span>'
        : `<span class="pill bad">불일치 ${r.diffs.length}</span>`;
      const warnPill = r.warn ? ' <span class="pill warn">점검</span>' : '';
      tr.innerHTML = `<td class="l">${r.사번}</td><td class="l">${r.성명}</td><td class="l muted">${r.소속 || ''}</td>
        <td>${won(r.ourTotal)}</td><td>${won(r.ledTotal)}</td>
        <td class="${diff > 0 ? 'diffpos' : diff < 0 ? 'diffneg' : 'muted'}">${diff === 0 ? '0' : (diff > 0 ? '+' : '') + won(diff)}</td>
        <td style="text-align:center">${statusPill}${warnPill}</td>`;
      tr.onclick = () => toggleDetail(tr, r);
      tb.appendChild(tr);
    });
    t.appendChild(tb); wrap.appendChild(t); area.innerHTML = ''; area.appendChild(wrap);
  }

  function toggleDetail(tr, r) {
    const nx = tr.nextElementSibling;
    if (nx && nx.classList.contains('detailrow')) { nx.remove(); return; }
    const dr = el('tr', 'detailrow');
    const td = el('td'); td.colSpan = 7;
    const cols = new Set([...PV.LEDGER_ITEMS, ...Object.keys(r.ours).filter(k => r.ours[k]), ...Object.keys(r.led).filter(k => r.led[k])]);
    let grid = '';
    cols.forEach(c => {
      const o = Math.round(r.ours[c] || 0), l = Math.round(r.led[c] || 0);
      if (o === 0 && l === 0) return;
      const diff = o !== l;
      grid += `<div class="ditem ${diff ? 'diff' : ''}"><div class="di-k">${c}${diff ? ' · 차이 ' + won(o - l) : ''}</div>
        <div class="di-vs"><span title="계산">${won(o)}</span><span class="muted" title="대장">${won(l)}</span></div></div>`;
    });
    const notes = (r.notes || []).length ? `<div style="margin-top:10px;font-size:11.5px;color:var(--text-2)">📌 ${r.notes.join(' · ')}</div>` : '';
    td.innerHTML = `<div class="detailbox"><div class="detailgrid">${grid}</div>${notes}
      <div style="margin-top:8px;font-size:10.5px;color:var(--text-3)">좌: 계산값 · 우: 급여대장 · 우리가 가진 항목만 비교</div></div>`;
    dr.appendChild(td); tr.after(dr);
  }

  $$('#filterSeg button').forEach(b => b.onclick = () => { $$('#filterSeg button').forEach(x => x.classList.remove('on')); b.classList.add('on'); curFilter = b.dataset.f; renderTable(); });
  $('#searchInp').oninput = e => { curSearch = e.target.value.trim(); renderTable(); };

  /* ---------- excel export ---------- */
  $('#exportBtn').onclick = () => {
    if (!lastResult) return;
    const res = lastResult, wb = XLSX.utils.book_new();
    const ym = `${res.target.y}-${String(res.target.m).padStart(2, '0')}`;

    // 1) 검증요약
    const sum = [['사번', '성명', '소속', '상태', '계산총액', '대장총액', '차이', '점검', '비고']];
    res.rows.forEach(r => sum.push([r.사번, r.성명, r.소속, r.status === 'ok' ? '일치' : '불일치',
      r.ourTotal, r.ledTotal, r.ourTotal - r.ledTotal, r.warn ? 'Y' : '', (r.notes || []).join(' / ')]));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sum), '검증요약');

    // 2) 불일치상세
    const det = [['사번', '성명', '항목', '계산값', '대장값', '차이']];
    res.rows.filter(r => r.status === 'bad').forEach(r => r.diffs.forEach(d =>
      det.push([r.사번, r.성명, d.col, d.ours, d.led, d.diff])));
    if (det.length === 1) det.push(['—', '불일치 없음', '', '', '', '']);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(det), '불일치상세');

    // 3) 점검·예외
    const alr = [['구분', '제목', '내용']];
    const lv = { block: '계산차단', bad: '불일치', warn: '점검필요', info: '처리내역', ok: '정상' };
    res.alerts.forEach(a => alr.push([lv[a.level] || a.level, a.title, a.desc || '']));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(alr), '점검·예외');

    XLSX.writeFile(wb, `급여검증_${ym}.xlsx`);
    toast('엑셀 다운로드 완료', 'ok');
  };

  renderFolder();
})(window.PV);
