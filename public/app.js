'use strict';

/* ── constants ── */
const DAYS  = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
const DKOR  = ['일','월','화','수','목','금','토'];
const TAG_LABELS = { ct:'토익', cv:'단어', cs:'토스', cc:'코테', cj:'자소서', cn:'NCS', cg:'기타' };
const QUOTES = [
  '오늘 한 문제가 석 달 뒤 합격을 만든다.',
  '완벽보다 꾸준함. 매일 조금씩.',
  '어제의 나보다 딱 한 줄 더.',
  '지금의 집중이 결과가 된다.',
  '느려도 멈추지만 않으면 도착한다.',
  '할 수 있는 만큼, 대신 매일.',
  '작은 루틴이 큰 합격을 만든다.',
  '커밋은 작게, 자주.',
  '오늘 치 분량만. 그거면 충분.',
];

const DEFAULT_T = {};

/* ── state ── */
let state     = {};
let templates = {};
let overrides = {};
let selCal    = null;
let calM      = null;
let calMode   = 'month';
let modalCtx  = null;
let activeView = 'today';
let TODAY;

/* ── localStorage keys ── */
const LS_STATE     = 'hajogi_v2_state';
const LS_TEMPLATES = 'hajogi_v2_templates';
const LS_OVERRIDES = 'hajogi_v3_overrides';
const LS_SYNC_KEY  = 'hajogi_sync_key';

/* ── helpers ── */
function dk(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function keyToDate(key) {
  const p = key.split('-').map(Number);
  return new Date(p[0], p[1]-1, p[2]);
}
function sameDay(a, b) {
  return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
}
function fd(d) { return `${d.getMonth()+1}/${d.getDate()}`; }
function stripT(d) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function startOfWeek(d) { const x = stripT(d); x.setDate(x.getDate()-x.getDay()); return x; }
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function listFor(date) {
  const key = dk(date);
  if (overrides[key]) return overrides[key];
  return templates[date.getDay()] || [];
}
function ensureOverride(key) {
  if (!overrides[key]) {
    const d = keyToDate(key);
    overrides[key] = clone(templates[d.getDay()] || []);
  }
  return overrides[key];
}
function gc(key, i) { return !!(state[key] && state[key][i]); }
function tc(key, i) {
  if (!state[key]) state[key] = {};
  state[key][i] = !state[key][i];
  saveState();
}
function esc(s) {
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;');
}
function prog(d) {
  const ts = listFor(d);
  if (!ts.length) return { done:0, total:0, pct:0 };
  const key  = dk(d);
  const done = ts.filter((_,i) => gc(key, i)).length;
  return { done, total: ts.length, pct: Math.round(done / ts.length * 100) };
}

/* ── persistence ── */
function saveState()     { try { localStorage.setItem(LS_STATE,     JSON.stringify(state));     } catch(e){} scheduleAutoPush(); }
function saveTemplates() { try { localStorage.setItem(LS_TEMPLATES, JSON.stringify(templates)); } catch(e){} scheduleAutoPush(); }
function saveOverrides() { try { localStorage.setItem(LS_OVERRIDES, JSON.stringify(overrides)); } catch(e){} scheduleAutoPush(); }

/* ── sync ── */
let syncTimer  = null;
let lastSyncAt = null;

function getSyncKey() { return localStorage.getItem(LS_SYNC_KEY) || ''; }
function setSyncKey(k) {
  if (k) localStorage.setItem(LS_SYNC_KEY, k);
  else   localStorage.removeItem(LS_SYNC_KEY);
}

function allData() {
  return { checks: state, templates: templates, overrides: overrides };
}

function setSyncMsg(msg, color) {
  const el = document.getElementById('sync-status');
  if (!el) return;
  el.textContent = msg;
  el.style.color = color || '';
}

async function syncPull() {
  const key = getSyncKey();
  if (!key) return;
  setSyncMsg('// 받아오는 중…');
  try {
    const r    = await fetch(`/api/data?key=${encodeURIComponent(key)}`);
    if (!r.ok) throw new Error(r.status);
    const data = (await r.json()).data;
    if (data) {
      state     = data.checks    || {};
      templates = data.templates || clone(DEFAULT_T);
      overrides = data.overrides || {};
      localStorage.setItem(LS_STATE,     JSON.stringify(state));
      localStorage.setItem(LS_TEMPLATES, JSON.stringify(templates));
      localStorage.setItem(LS_OVERRIDES, JSON.stringify(overrides));
      lastSyncAt = new Date();
      setSyncMsg(`// 받기 완료 · ${lastSyncAt.toLocaleTimeString()}`, 'var(--pt)');
      rerenderActive(); updateChrome();
      toast('서버에서 데이터를 받아왔어요');
    } else {
      setSyncMsg('// 서버에 저장된 데이터가 없어요 — ↑ 올리기로 먼저 업로드하세요', 'var(--mut)');
    }
  } catch(e) {
    setSyncMsg('// 연결 오류 — 키를 확인하거나 잠시 후 다시 시도해주세요', '#e07b7b');
    toast('연동 오류가 발생했어요');
  }
}

async function syncPush() {
  const key = getSyncKey();
  if (!key) return;
  setSyncMsg('// 올리는 중…');
  try {
    const r = await fetch(`/api/data?key=${encodeURIComponent(key)}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(allData()),
    });
    if (!r.ok) throw new Error(r.status);
    lastSyncAt = new Date();
    setSyncMsg(`// 올리기 완료 · ${lastSyncAt.toLocaleTimeString()}`, 'var(--pt)');
  } catch(e) {
    setSyncMsg('// 업로드 오류 — 잠시 후 다시 시도해주세요', '#e07b7b');
  }
}

function scheduleAutoPush() {
  if (!getSyncKey()) return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    try {
      const key = getSyncKey();
      if (!key) return;
      await fetch(`/api/data?key=${encodeURIComponent(key)}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(allData()),
      });
      lastSyncAt = new Date();
      setSyncMsg(`// 자동 저장 완료 · ${lastSyncAt.toLocaleTimeString()}`, 'var(--pt)');
    } catch(e) {}
  }, 3000);
}

function connectSync() {
  const input = document.getElementById('sync-key-input');
  if (!input) return;
  const key = input.value.trim();
  if (key.length < 4) { toast('키는 4자 이상이어야 해요'); return; }
  setSyncKey(key);
  rData();
  syncPull();
}

function disconnectSync() {
  if (!confirm('연동을 해제할까요?\n로컬 데이터는 유지됩니다.')) return;
  setSyncKey('');
  rData();
  toast('연동이 해제됐어요');
}

/* ── streak + jandi ── */
function dayAchieved(d) {
  const p = prog(d);
  return p.total > 0 && p.pct >= 60;
}
function computeStreak() {
  let cur = new Date(TODAY);
  if (!dayAchieved(cur)) cur.setDate(cur.getDate()-1);
  let s = 0, guard = 0;
  while (dayAchieved(cur) && guard < 400) { s++; cur.setDate(cur.getDate()-1); guard++; }
  return s;
}
function cellColor(d) {
  const p = prog(d);
  if (p.total === 0 || p.pct === 0) return 'var(--cell)';
  if (p.pct <= 40) return '#27613f';
  if (p.pct <= 70) return '#2f8f63';
  if (p.pct <= 99) return '#3bb079';
  return '#46c98a';
}
function jandiGridHTML(weeks) {
  weeks = weeks || 13;
  const start = new Date(TODAY);
  start.setDate(start.getDate() - TODAY.getDay() - (weeks-1)*7);
  let cols = '';
  for (let c = 0; c < weeks; c++) {
    let col = '';
    for (let r = 0; r < 7; r++) {
      const d = new Date(start);
      d.setDate(d.getDate() + c*7 + r);
      if (d > TODAY) {
        col += `<i class="empty"></i>`;
      } else {
        col += `<i class="${sameDay(d,TODAY)?'today':''}" style="background:${cellColor(d)}" title="${fd(d)} · ${prog(d).pct}%"></i>`;
      }
    }
    cols += `<div class="jweek">${col}</div>`;
  }
  return `<div class="jwrap">
    <div class="jlabel">최근 ${weeks}주 기록 · 매일의 잔디</div>
    <div class="jgridbig">${cols}</div>
    <div class="jlegend">
      <span>적음</span>
      <i style="background:var(--cell)"></i>
      <i style="background:#27613f"></i>
      <i style="background:#2f8f63"></i>
      <i style="background:#3bb079"></i>
      <i style="background:#46c98a"></i>
      <span>많음</span>
    </div>
  </div>`;
}

function quoteOfDay(d) {
  const start = new Date(d.getFullYear(), 0, 0);
  const doy   = Math.floor((d - start) / 86400000);
  return QUOTES[doy % QUOTES.length];
}
function asciiBar(pct, len) {
  len = len || 18;
  const f = Math.round(pct / 100 * len);
  return `<span class="f">${'█'.repeat(f)}</span><span class="e">${'░'.repeat(len-f)}</span>`;
}

/* ── UI helpers ── */
function toast(m) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = m;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}
function updateChrome() {
  const st = document.getElementById('streakTop');
  if (st) st.textContent = '🔥 ' + computeStreak() + '일';
  const bd = document.getElementById('brandDate');
  if (bd) bd.textContent =
    `${TODAY.getFullYear()}.${String(TODAY.getMonth()+1).padStart(2,'0')}.${String(TODAY.getDate()).padStart(2,'0')} (${DKOR[TODAY.getDay()]})`;
}
function rerenderActive() {
  if (activeView === 'today')      rToday();
  else if (activeView === 'cal')   rCal();
  else if (activeView === 'data')  rData();
  else if (activeView === 'board') rBoard();
}

/* ── today view ── */
function rToday() {
  const d   = new Date(TODAY);
  const key = dk(d);
  const ts  = listFor(d);
  const p   = prog(d);
  const L   = [];
  const ln = (cls, html) => L.push(`<div class="ln ${cls}"><div class="lc">${html}</div></div>`);
  const lnTask = (cls, html, cb) =>
    L.push(`<div class="ln task ${cls}" ${cb}><div class="lc">${html}</div></div>`);

  ln('cmt', `# ${key} <span style="color:var(--mut)">(${DKOR[d.getDay()]}) · ${DAYS[d.getDay()]}</span>`);
  ln('blank', '');
  ln('cmt', `/* ${esc(quoteOfDay(d))} */`);
  ln('blank', '');

  if (!ts.length) {
    ln('cmt', '// 등록된 항목이 없습니다 — 달력 탭에서 추가하세요');
    document.getElementById('v-today').innerHTML = `<div class="code">${L.join('')}</div>`;
    return;
  }

  ln('', `<span class="bar">${asciiBar(p.pct)}<span class="pct">${p.pct}%</span><span class="frac">${p.done}/${p.total}</span></span>`);
  ln('blank', '');

  const secs = {};
  ts.forEach((t, i) => { if (!secs[t.s]) secs[t.s] = []; secs[t.s].push({...t, i}); });
  Object.entries(secs).forEach(([s, items]) => {
    ln('sec', `<span class="hash">## </span>${esc(s)}`);
    items.forEach(t => {
      const on = gc(key, t.i);
      lnTask(
        on ? 'on' : '',
        `<span class="cbx">[${on?'x':' '}]</span><span class="ttxt">${esc(t.t)}</span><span class="thash">#${TAG_LABELS[t.g]||t.g}</span>`,
        `onclick="toggleCheck('${key}',${t.i})"`
      );
    });
  });

  document.getElementById('v-today').innerHTML =
    `<div class="code">${L.join('')}</div>`;
}

function toggleCheck(k, i) { tc(k, i); rerenderActive(); updateChrome(); }

/* ── calendar view ── */
function rCal() {
  if (calMode === 'week') { rCalWeek(); return; }
  const y = calM.getFullYear(), m = calM.getMonth();
  const first = new Date(y, m, 1).getDay();
  const dim   = new Date(y, m+1, 0).getDate();

  let h = `<div class="calbar">
    <div class="cm">${y}.${String(m+1).padStart(2,'0')}<span class="cms">${m+1}월</span></div>
    <button class="wbtn" onclick="chMonth(-1)" title="이전 달">‹</button>
    <button class="wbtn" onclick="chMonth(1)"  title="다음 달">›</button>
    <button class="todaybtn" onclick="goToday()">오늘</button>
  </div>
  <div class="cal-dow">${DKOR.map(x=>`<span>${x}</span>`).join('')}</div>
  <div class="cal-grid">`;

  for (let i = 0; i < first; i++) h += `<div class="cday empty"></div>`;
  for (let day = 1; day <= dim; day++) {
    const date = new Date(y, m, day);
    const p    = prog(date);
    const tod  = sameDay(date, TODAY);
    let cls    = 'cday' + (tod ? ' tod' : '');
    h += `<div class="${cls}" onclick="openWeek(${y},${m},${day})">
      <span class="cd-n">${day}</span>
      <span class="cd-bar"><i style="width:${p.pct}%"></i></span>
    </div>`;
  }
  h += `</div><div class="note" style="padding-top:14px">// 날짜를 누르면 그 주가 펼쳐집니다</div>`;
  document.getElementById('v-cal').innerHTML = h;
}

function rCalWeek() {
  const ws = startOfWeek(selCal);
  const we = new Date(ws); we.setDate(we.getDate()+6);
  let td = 0, tt = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(ws); d.setDate(d.getDate()+i);
    const p = prog(d); td += p.done; tt += p.total;
  }
  const wp = tt ? Math.round(td/tt*100) : 0;

  let h = `<div class="calbar">
    <button class="todaybtn" onclick="backToMonth()" title="달력으로 돌아가기">‹ 달력</button>
    <div class="cm">${fd(ws)} – ${fd(we)}<span class="cms">${wp}% · ${td}/${tt}</span></div>
    <button class="wbtn" onclick="chWeek(-1)" title="이전 주">«</button>
    <button class="wbtn" onclick="chWeek(1)"  title="다음 주">»</button>
  </div>
  <div class="cal-dow">${DKOR.map(x=>`<span>${x}</span>`).join('')}</div>
  <div class="cal-grid">`;

  for (let i = 0; i < 7; i++) {
    const d   = new Date(ws); d.setDate(d.getDate()+i);
    const p   = prog(d);
    const tod = sameDay(d, TODAY);
    const sel = selCal && sameDay(d, selCal);
    let cls   = 'cday' + (tod?' tod':'') + (sel?' sel':'');
    h += `<div class="${cls}" onclick="pickWeekDay(${d.getFullYear()},${d.getMonth()},${d.getDate()})">
      <span class="cd-n">${d.getDate()}</span>
      <span class="cd-bar"><i style="width:${p.pct}%"></i></span>
    </div>`;
  }
  h += `</div>`;
  if (selCal) h += detailHTML(dk(selCal));
  document.getElementById('v-cal').innerHTML = h;
}

function openWeek(y, m, d)  { selCal = new Date(y,m,d); calMode = 'week'; rCal(); }
function backToMonth()       { if (selCal) calM = new Date(selCal.getFullYear(), selCal.getMonth(), 1); calMode = 'month'; rCal(); }
function chWeek(n)           { if (!selCal) selCal = new Date(TODAY); selCal = new Date(selCal); selCal.setDate(selCal.getDate()+n*7); rCal(); }
function pickWeekDay(y,m,d)  { selCal = new Date(y,m,d); rCal(); }
function chMonth(n)          { calM = new Date(calM.getFullYear(), calM.getMonth()+n, 1); rCal(); }
function goToday()           { calMode = 'month'; calM = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1); rCal(); }

function detailHTML(key) {
  const date   = keyToDate(key);
  const dow    = date.getDay();
  const ts     = listFor(date);
  const p      = prog(date);
  const edited = !!overrides[key];

  let h = `<div class="dhead">
    ${fd(date)} (${DKOR[dow]}) ${DAYS[dow]}${sameDay(date,TODAY)?' · 오늘':''}
    <span class="dpct">${p.done}/${p.total} · ${p.pct}%${edited?' · 수정됨':''}</span>
  </div>`;

  if (!ts.length) {
    h += `<div class="note">// 등록된 항목이 없습니다</div>`;
  } else {
    const secs = {};
    ts.forEach((t, i) => { if (!secs[t.s]) secs[t.s]=[]; secs[t.s].push({...t, i}); });
    Object.entries(secs).forEach(([s, items]) => {
      h += `<div class="sectitle">${esc(s)}</div>`;
      items.forEach(t => {
        const on = gc(key, t.i);
        h += `<div class="erow ${on?'on':''}">
          <span class="cbx" style="color:${on?'var(--pt)':'var(--mut)'}" onclick="toggleCheck('${key}',${t.i})">[${on?'x':' '}]</span>
          <span class="ttxt" onclick="toggleCheck('${key}',${t.i})" style="cursor:pointer">${esc(t.t)}</span>
          <span class="thash">#${TAG_LABELS[t.g]||t.g}</span>
          <span class="eact">
            <button class="ebtn" onclick="openEditModal('${key}',${t.i})" title="수정">✎</button>
            <button class="ebtn del" onclick="deleteTask('${key}',${t.i})" title="삭제">✕</button>
          </span>
        </div>`;
      });
    });
  }

  h += `<div class="addbox">
    <div class="addflex">
      <input type="text" id="add-section" placeholder="section (예: 저녁 — 토익)">
      <select id="add-tag">
        <option value="ct">토익</option><option value="cv">단어</option>
        <option value="cs">토스</option><option value="cc">코테</option>
        <option value="cj">자소서</option><option value="cn">NCS</option>
        <option value="cg">기타</option>
      </select>
    </div>
    <div class="addflex">
      <input type="text" id="add-text" placeholder="+ 이 날짜에 새 항목">
      <button class="btn pri sm" onclick="addTask('${key}')">add</button>
    </div>
  </div>`;
  return h;
}

/* ── task CRUD ── */
function reindexDate(key, delIdx) {
  const old = state[key] || {};
  const nw  = {};
  Object.keys(old).forEach(k => {
    const idx = parseInt(k, 10);
    if (idx === delIdx) return;
    nw[idx > delIdx ? idx-1 : idx] = old[idx];
  });
  state[key] = nw;
  saveState();
}

function addTask(key) {
  const se = document.getElementById('add-section');
  const te = document.getElementById('add-text');
  const ge = document.getElementById('add-tag');
  const section = se.value.trim() || '기타';
  const text    = te.value.trim();
  if (!text) { toast('내용을 입력해주세요'); return; }
  ensureOverride(key).push({ s: section, t: text, g: ge.value });
  saveOverrides();
  te.value = '';
  toast('이 날짜에 항목을 추가했어요');
  rerenderActive(); updateChrome();
}

function deleteTask(key, idx) {
  if (!confirm('이 항목을 삭제할까요?\n(이 날짜에서만 삭제됩니다)')) return;
  const list = ensureOverride(key);
  list.splice(idx, 1);
  saveOverrides();
  reindexDate(key, idx);
  toast('삭제됐어요');
  rerenderActive(); updateChrome();
}

function openEditModal(key, idx) {
  modalCtx = { key, idx };
  const t = listFor(keyToDate(key))[idx];
  document.getElementById('m-section').value = t.s;
  document.getElementById('m-text').value    = t.t;
  document.getElementById('m-tag').value     = t.g;
  document.getElementById('modalBg').classList.add('show');
}
function closeModal() {
  document.getElementById('modalBg').classList.remove('show');
  modalCtx = null;
}
function saveModal() {
  if (!modalCtx) return;
  const {key, idx} = modalCtx;
  const section = document.getElementById('m-section').value.trim() || '기타';
  const text    = document.getElementById('m-text').value.trim();
  const tag     = document.getElementById('m-tag').value;
  if (!text) { toast('내용을 입력해주세요'); return; }
  ensureOverride(key)[idx] = { s: section, t: text, g: tag };
  saveOverrides();
  closeModal();
  toast('이 날짜 항목을 수정했어요');
  rerenderActive();
}

/* ── data view ── */
function rData() {
  const activeKey  = getSyncKey();
  const maskedKey  = activeKey
    ? activeKey.slice(0,2) + '●'.repeat(Math.max(0, activeKey.length - 2))
    : '';
  const syncBlock  = activeKey
    ? `<div class="sectitle plain sync-title">// 기기 연동 <span class="sync-badge">🔗 연결됨</span></div>
       <div class="sync-row">
         <span class="sync-key-pill">${maskedKey}</span>
         <button class="btn sm" onclick="syncPull()">↓ 받기</button>
         <button class="btn sm pri" onclick="syncPush()">↑ 올리기</button>
         <button class="btn sm red" onclick="disconnectSync()">연동 해제</button>
       </div>
       <div id="sync-status" class="note sync-note">// 체크·추가·수정 시 3초 후 자동 업로드됩니다</div>`
    : `<div class="sectitle plain">// 기기 연동</div>
       <div class="sync-row">
         <input type="text" id="sync-key-input" class="sync-input" placeholder="동기화 키 입력 (4자 이상, 본인만 아는 단어)">
         <button class="btn sm pri" onclick="connectSync()">연결</button>
       </div>
       <div id="sync-status" class="note sync-note">// 노트북·폰에서 같은 키를 입력하면 데이터가 공유됩니다</div>`;

  const editedDays = Object.keys(overrides).length;
  let h = syncBlock + `<div class="sectitle plain">// 데이터 · 백업</div>
  <div class="btnrow">
    <button class="btn pri" onclick="expJSON()">↓ JSON 내보내기</button>
    <button class="btn" onclick="document.getElementById('fi').click()">↑ 불러오기</button>
    <input type="file" id="fi" accept=".json" style="display:none" onchange="impJSON(event)">
    <button class="btn red" onclick="resetAll()">⟲ 전체 초기화</button>
  </div>
  <div class="note" style="padding:6px 0 14px">
    // 자동 저장 — 체크·추가·수정·삭제 모두 브라우저에 저장됩니다.<br>
    // 항목 편집은 <b style="color:var(--pt)">선택한 그 날짜에만</b> 적용됩니다.<br>
    // 내보내기 — 체크 + 날짜별 수정 + 기본 루틴까지 백업
  </div>
  <div class="sectitle">
    <span>요일별 플래너 항목 수</span>
    <button class="btn sm" onclick="resetTemplatesOnly()">플래너 재설정</button>
  </div>
  <div>`;

  for (let i = 0; i < 7; i++) {
    h += `<div class="drow">
      <span class="dk">${DKOR[i]}요일 <span class="dim">${DAYS[i]}</span></span>
      <span class="dv">${(templates[i]||[]).length} items</span>
    </div>`;
  }
  h += `</div><div class="sectitle">개별 수정된 날짜</div><div>`;

  if (!editedDays) {
    h += `<div class="note">// 아직 개별 수정한 날짜가 없어요 (기본 루틴 사용 중)</div>`;
  } else {
    Object.keys(overrides).sort().forEach(key => {
      const d = keyToDate(key);
      h += `<div class="drow">
        <span class="dk">${key} <span class="dim">${DKOR[d.getDay()]}</span></span>
        <span class="dv">${overrides[key].length} items</span>
      </div>`;
    });
  }

  h += `</div><div class="sectitle">저장된 체크 기록</div><div>`;
  const keys = Object.keys(state)
    .filter(k => Object.values(state[k]||{}).some(Boolean))
    .sort();

  if (!keys.length) {
    h += `<div class="note">// 아직 체크한 항목이 없어요</div>`;
  } else {
    keys.forEach(key => {
      const ch  = Object.values(state[key]||{}).filter(Boolean).length;
      const d   = keyToDate(key);
      const tot = listFor(d).length;
      const pct = tot > 0 ? Math.round(ch/tot*100) : 0;
      h += `<div class="drow">
        <span class="dk">${key} <span class="dim">${DKOR[d.getDay()]}</span></span>
        <span class="dv">${ch}/${tot} · ${pct}%</span>
      </div>`;
    });
  }
  h += `</div>`;
  document.getElementById('v-data').innerHTML = h;
}

function expJSON() {
  const data = {
    exportDate: new Date().toISOString(),
    version: 'v3',
    checks: state,
    templates: templates,
    overrides: overrides,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `hajogi_backup_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('JSON으로 저장됐어요');
}

function impJSON(e) {
  const f = e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = ev => {
    try {
      const d   = JSON.parse(ev.target.result);
      state     = d.checks    || {};
      templates = d.templates || {};
      overrides = d.overrides || {};
      saveState(); saveTemplates(); saveOverrides();
      toast('데이터를 불러왔어요');
      rData(); updateChrome();
    } catch(err) {
      toast('파일 형식이 올바르지 않아요');
    }
  };
  r.readAsText(f);
}

function resetAll() {
  if (!confirm('체크 기록·날짜별 수정·기본 루틴이 모두 초기화됩니다.\n계속할까요?')) return;
  state = {}; templates = {}; overrides = {};
  saveState(); saveTemplates(); saveOverrides();
  toast('초기화 완료');
  rData(); updateChrome();
}

function resetTemplatesOnly() {
  obReset();
}

/* ── view switching ── */
const FNAME = { today:'today.md', cal:'calendar.md', data:'data.json', board:'생각.md' };

function setView(id, btn) {
  activeView = id;
  document.querySelectorAll('.routine-scope .view').forEach(v => v.classList.remove('on'));
  document.querySelectorAll('.routine-scope .tab').forEach(t => t.classList.remove('on'));
  const db = document.getElementById('dataBtn');
  if (db) db.classList.remove('on');
  document.getElementById('v-'+id).classList.add('on');
  if (btn) btn.classList.add('on');
  document.getElementById('fnameTab').textContent = FNAME[id];
  rerenderActive();
}

function openData() {
  setView('data', null);
  const db = document.getElementById('dataBtn');
  if (db) db.classList.add('on');
}

/* ── init ── */
function initApp() {
  TODAY = stripT(new Date());

  try { const d = localStorage.getItem(LS_STATE);     state     = d ? JSON.parse(d) : {}; }             catch(e) { state = {}; }
  try { const t = localStorage.getItem(LS_TEMPLATES); templates = t ? JSON.parse(t) : {}; } catch(e) { templates = {}; }
  try { const o = localStorage.getItem(LS_OVERRIDES); overrides = o ? JSON.parse(o) : {}; }             catch(e) { overrides = {}; }

  calM     = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1);
  selCal   = null;
  calMode  = 'month';
  activeView = 'today';

  const mb = document.getElementById('modalBg');
  if (mb && !mb.__bound) {
    mb.__bound = true;
    mb.addEventListener('click', e => { if (e.target.id === 'modalBg') closeModal(); });
  }

  updateChrome();
  rToday();
  initBoard();

  if (getSyncKey()) syncPull();
  checkOnboarding();
}

document.addEventListener('DOMContentLoaded', initApp);
