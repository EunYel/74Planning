'use strict';
/* ── Onboarding / Planner Wizard ── */

const OB_DONE_KEY  = '74plan_onboarding_done';
const OB_SLOTS_KEY = '74plan_timetable';
const OB_GOALS_KEY = '74plan_goals';

const OB_DAYS_KO = ['월','화','수','목','금','토','일'];
const OB_TIMES   = [];
for (let h = 7; h <= 23; h++) {
  OB_TIMES.push({ label: `${String(h).padStart(2,'0')}:00`, isHour: true });
  OB_TIMES.push({ label: `${String(h).padStart(2,'0')}:30`, isHour: false });
}
OB_TIMES.push({ label: '00:00', isHour: true });
// 35 slots: 07:00 ~ 00:00

let obS = {
  step:  1,
  slots: Array.from({length:7}, () => new Array(35).fill(false)),
  goals: [],
  pendingPlan: null,
};

/* ── localStorage ── */
function obSaveSlots() { try { localStorage.setItem(OB_SLOTS_KEY, JSON.stringify(obS.slots)); } catch(e){} }
function obSaveGoals() { try { localStorage.setItem(OB_GOALS_KEY, JSON.stringify(obS.goals)); } catch(e){} }
function obLoadSlots() { try { const r=localStorage.getItem(OB_SLOTS_KEY); return r?JSON.parse(r):null; } catch(e){return null;} }
function obLoadGoals() { try { const r=localStorage.getItem(OB_GOALS_KEY); return r?JSON.parse(r):null; } catch(e){return null;} }

/* ── preset tasks per goal keyword ── */
const OB_PRESETS = {
  '토익': { code:'ct', tasks:['LC 파트3·4 10문제 풀기','RC 파트7 지문 2개 (타이머)','단어 30개 암기','오답 분석 + 단어 저장','파트5·6 문법 문제 10개'] },
  '토스': { code:'cs', tasks:['파트5 템플릿 소리내어 5회 반복','실전 문제 답변 녹음 후 셀프 체크','파트2·3 즉흥 답변 연습 3문제'] },
  '코테': { code:'cc', tasks:['알고리즘·자료구조 개념 1개 정리','관련 문제 2개 풀기','못 푼 문제 풀이 확인','실전 모의 문제 1개 (타이머)'] },
  '자소서': { code:'cj', tasks:['STAR 소재 1개 발굴·정리','문항 초안 200자 작성','퇴고 및 글자수 맞추기','첨삭 반영 후 재작성'] },
  'NCS': { code:'cn', tasks:['유형별 문제 20개','오답 분석','약점 유형 집중 학습','최신 기출 1세트'] },
  '자격증': { code:'cg', tasks:['이론 1챕터 학습','기출 문제 10개','오답 정리','핵심 개념 요약 노트'] },
  '단어': { code:'cv', tasks:['단어 30개 암기','전날 틀린 단어 재암기','예문으로 문맥 확인'] },
};

function obGetPreset(name) {
  for (const [k, v] of Object.entries(OB_PRESETS)) {
    if (name.includes(k)) return v;
  }
  return { code:'cg', tasks:[`${name} 학습`, `${name} 정리`, `${name} 복습`, `${name} 문제 풀기`] };
}

/* ── plan generation ── */
function obGeneratePlan() {
  // obS.slots[obIdx]: 0=월,1=화,...,6=일
  // templates key:     0=일,1=월,...,6=토
  const dayMap    = [1, 2, 3, 4, 5, 6, 0];
  const dailyHrs  = obS.slots.map(day => day.filter(Boolean).length * 0.5);
  const totalHrs  = dailyHrs.reduce((a, b) => a + b, 0);
  const result    = {};

  for (let di = 0; di < 7; di++) {
    const dayNum = dayMap[di];
    const avail  = dailyHrs[di];
    if (avail === 0) { result[dayNum] = []; continue; }

    const tasks  = [];
    let   budget = avail;

    const sharePerGoal = obS.goals.length > 0 ? avail / obS.goals.length : 0;
    for (const goal of obS.goals) {
      if (budget < 0.3) break;
      const hours = Math.min(sharePerGoal, budget);
      if (hours < 0.25) continue;

      const preset = obGetPreset(goal.name);
      const n      = Math.max(1, Math.round(hours * 2));
      preset.tasks.slice(0, n).forEach(t => tasks.push({ s: goal.name, t }));
      budget -= hours;
    }

    tasks.push({ s: '기타', t: '채용 공고 확인 (10분)' });
    result[dayNum] = tasks;
  }
  return result;
}

/* ── timetable ── */
function obBuildTimetable() {
  const wrap = document.getElementById('ob-timetable');
  if (!wrap) return;

  let html = '<div class="ob-tt">';
  html += '<div class="ob-tt-row ob-tt-head"><div class="ob-tt-tc"></div>';
  OB_DAYS_KO.forEach(d => html += `<div class="ob-tt-dh">${d}</div>`);
  html += '</div>';

  OB_TIMES.forEach((t, si) => {
    html += `<div class="ob-tt-row${t.isHour ? ' ob-hr' : ' ob-hf'}">`;
    html += `<div class="ob-tt-tc">${t.isHour ? t.label : ''}</div>`;
    for (let di = 0; di < 7; di++) {
      html += `<div class="ob-tt-cell${obS.slots[di][si] ? ' on' : ''}" data-ob="${di}-${si}"></div>`;
    }
    html += '</div>';
  });
  html += '</div>';
  wrap.innerHTML = html;

  // Drag logic
  let dragging = false, dragVal = true;

  function applyCell(el) {
    if (!el || !el.dataset.ob) return;
    const [di, si] = el.dataset.ob.split('-').map(Number);
    obS.slots[di][si] = dragVal;
    el.classList.toggle('on', dragVal);
    obUpdateHours();
  }

  wrap.addEventListener('mousedown', e => {
    const cell = e.target.closest('.ob-tt-cell');
    if (!cell) return;
    e.preventDefault();
    const [di, si] = cell.dataset.ob.split('-').map(Number);
    dragVal  = !obS.slots[di][si];
    dragging = true;
    applyCell(cell);
  });
  wrap.addEventListener('mouseover', e => {
    if (!dragging) return;
    applyCell(e.target.closest('.ob-tt-cell'));
  });
  document.addEventListener('mouseup', () => { dragging = false; });

  wrap.addEventListener('touchstart', e => {
    const cell = e.target.closest('.ob-tt-cell');
    if (!cell) return;
    e.preventDefault();
    const [di, si] = cell.dataset.ob.split('-').map(Number);
    dragVal  = !obS.slots[di][si];
    dragging = true;
    applyCell(cell);
  }, { passive: false });
  wrap.addEventListener('touchmove', e => {
    if (!dragging) return;
    e.preventDefault();
    const touch = e.touches[0];
    const el    = document.elementFromPoint(touch.clientX, touch.clientY);
    if (el) applyCell(el.closest('.ob-tt-cell'));
  }, { passive: false });
  document.addEventListener('touchend', () => { dragging = false; });
}

function obUpdateHours() {
  const h  = obS.slots.reduce((t, d) => t + d.filter(Boolean).length * 0.5, 0);
  const el = document.getElementById('ob-hours-val');
  if (el) el.textContent = h + '시간/주';
}

/* ── goals ── */
function obAddGoal() {
  const nEl = document.getElementById('ob-goal-name');
  const name = (nEl.value || '').trim();
  if (!name) { nEl.focus(); return; }
  if (obS.goals.find(g => g.name === name)) { nEl.value = ''; nEl.focus(); return; }
  obS.goals.push({ name });
  nEl.value = '';
  nEl.focus();
  obRenderGoals();
}
function obRemoveGoal(i) { obS.goals.splice(i, 1); obRenderGoals(); }
function obRenderGoals() {
  const el = document.getElementById('ob-goal-list');
  if (!el) return;
  if (!obS.goals.length) {
    el.innerHTML = '<div class="ob-hint-empty">// 아직 목표가 없어요</div>';
    return;
  }
  el.innerHTML = obS.goals.map((g, i) => `
    <div class="ob-goal-row">
      <span class="ob-goal-name">${g.name}</span>
      <button onclick="obRemoveGoal(${i})" class="ob-goal-del" title="삭제">×</button>
    </div>`).join('');
}

/* ── step renders ── */
function obRender() {
  const bg = document.getElementById('obBg');
  if (!bg) return;

  if (obS.step === 1) {
    const existingKey = (typeof getSyncKey === 'function') ? (getSyncKey() || '') : '';
    // 이미 키가 있으면 step 1 건너뛰고 바로 step 2로
    if (existingKey) { obGoTo(2); return; }
    bg.innerHTML = `
      <div class="ob-panel">
        <div class="ob-brand">// 74Planning</div>
        <h1 class="ob-h1">시작하기</h1>
        <p class="ob-p">동기화 키를 설정하면 노트북과 폰에서 데이터를 공유할 수 있어요.<br>나만 아는 단어나 문구를 사용해주세요.</p>
        <label class="ob-label">동기화 키 (비밀번호)</label>
        <input id="ob-key" type="text" class="ob-input" placeholder="4자 이상 입력..." autocomplete="off" spellcheck="false">
        <span class="ob-hint">// 이 키는 나만 알고 있어야 해요. 같은 키를 여러 기기에서 입력하면 데이터가 공유됩니다.</span>
        <div class="ob-footer">
          <button onclick="obSkip()" class="ob-btn ob-ghost">건너뛰기</button>
          <button onclick="obStep1Next()" class="ob-btn ob-pri">다음 →</button>
        </div>
      </div>`;
    const inp = document.getElementById('ob-key');
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') obStep1Next(); });
    setTimeout(() => inp.focus(), 50);

  } else if (obS.step === 2) {
    const h = obS.slots.reduce((t, d) => t + d.filter(Boolean).length * 0.5, 0);
    bg.innerHTML = `
      <div class="ob-panel ob-wide">
        <div class="ob-dots"><span class="on"></span><span class="on"></span><span></span><span></span></div>
        <h1 class="ob-h1">언제 공부할 수 있어요?</h1>
        <p class="ob-p">드래그(또는 터치)해서 공부 가능한 시간대를 선택해주세요.
          &nbsp;<b id="ob-hours-val" style="color:var(--pt)">${h}시간/주</b></p>
        <div id="ob-timetable" style="overflow-x:auto;-webkit-overflow-scrolling:touch;margin-bottom:4px"></div>
        <div class="ob-footer" style="margin-top:20px">
          <button onclick="obGoTo(1)" class="ob-btn ob-ghost">← 이전</button>
          <button onclick="obStep2Next()" class="ob-btn ob-pri">다음 →</button>
        </div>
      </div>`;
    obBuildTimetable();

  } else if (obS.step === 3) {
    bg.innerHTML = `
      <div class="ob-panel">
        <div class="ob-dots"><span class="on"></span><span class="on"></span><span class="on"></span><span></span></div>
        <h1 class="ob-h1">목표를 설정해요</h1>
        <p class="ob-p">어떤 공부를 할 계획인가요? 시간 배분은 AI가 자동으로 해줘요.</p>

        <div class="ob-add-row">
          <input id="ob-goal-name" type="text" class="ob-input ob-flex" placeholder="목표 이름 (예: 토익, 정보처리기사)">
          <button onclick="obAddGoal()" class="ob-btn ob-pri ob-btn-sm">추가</button>
        </div>

        <div id="ob-goal-list" class="ob-goal-list"></div>

        <div class="ob-footer" style="margin-top:24px">
          <button onclick="obGoTo(2)" class="ob-btn ob-ghost">← 이전</button>
          <button onclick="obFinish()" class="ob-btn ob-pri">플래너 생성 →</button>
        </div>
      </div>`;
    obRenderGoals();
    const nEl = document.getElementById('ob-goal-name');
    nEl.addEventListener('keydown', e => { if (e.key === 'Enter') obAddGoal(); });

  } else if (obS.step === 4) {
    obRenderStep4();
  }
}

function obGoTo(step) { obS.step = step; obRender(); }

/* ── step 4: plan preview & edit ── */
function obEsc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Goal → color mapping for chips
const OB_GOAL_COLORS = [
  '#4f8ef7','#6ec96e','#e89a3a','#b57cf7','#3cc4c4','#e07070','#f7c44f',
];
function obGoalColor(sectionName) {
  const idx = obS.goals.findIndex(g => g.name === sectionName);
  if (idx >= 0) return OB_GOAL_COLORS[idx % OB_GOAL_COLORS.length];
  return '#4a5068'; // 기타
}

function obRenderStep4() {
  const bg = document.getElementById('obBg');
  if (!bg) return;

  // obIdx 0=월…6=일 → plan key 1=월…0=일
  const dayMap   = [1, 2, 3, 4, 5, 6, 0];
  const DAY_KO   = ['월','화','수','목','금','토','일'];
  const SLOT_H   = 18; // px per 30-min slot
  const TOTAL_H  = OB_TIMES.length * SLOT_H; // 35 × 18 = 630px

  // Column header height (day name row) — ticks must be offset to align with body
  const HDR_H = 28;

  // Time axis tick marks (every hour) — offset by HDR_H so they align with column body
  let timeAxis = '';
  OB_TIMES.forEach((t, si) => {
    if (t.isHour) timeAxis += `<div class="ob-pv-tick" style="top:${HDR_H + si * SLOT_H}px">${t.label}</div>`;
  });

  // Horizontal hour lines inside each column
  let hrLines = '';
  OB_TIMES.forEach((t, si) => {
    if (t.isHour) hrLines += `<div class="ob-pv-hline" style="top:${si * SLOT_H}px"></div>`;
  });

  let colsHtml = '';
  for (let di = 0; di < 7; di++) {
    const dk    = dayMap[di];
    const tasks = (obS.pendingPlan && Array.isArray(obS.pendingPlan[dk])) ? obS.pendingPlan[dk] : [];

    // Find continuous selected sessions for this day
    const sessions = [];
    let sesStart = -1;
    obS.slots[di].forEach((on, si) => {
      if (on  && sesStart === -1) sesStart = si;
      if (!on && sesStart !== -1) { sessions.push({ start: sesStart, end: si }); sesStart = -1; }
    });
    if (sesStart !== -1) sessions.push({ start: sesStart, end: OB_TIMES.length });

    // Distribute tasks proportionally across sessions
    const totalSlots = sessions.reduce((s, ses) => s + ses.end - ses.start, 0);
    let tIdx = 0;
    const sesWithTasks = sessions.map(ses => {
      const slots  = ses.end - ses.start;
      const ratio  = totalSlots > 0 ? slots / totalSlots : 0;
      const nTasks = Math.round(tasks.length * ratio);
      const indices = [];
      for (let i = tIdx; i < tIdx + nTasks && i < tasks.length; i++) indices.push(i);
      tIdx += nTasks;
      return { ...ses, indices };
    });
    // Assign any leftover tasks to last session
    if (tIdx < tasks.length && sesWithTasks.length) {
      for (let i = tIdx; i < tasks.length; i++) sesWithTasks[sesWithTasks.length - 1].indices.push(i);
    }

    // Handle tasks on days with no timetable slots
    const extraTasks = sessions.length === 0 && tasks.length
      ? tasks.map((_, i) => i)
      : [];

    // Build session blocks
    let sesHtml = sesWithTasks.map(ses => {
      const top    = ses.start * SLOT_H;
      const height = (ses.end - ses.start) * SLOT_H;
      if (height === 0) return '';
      const chipPx   = 22;
      const maxChips = Math.max(1, Math.floor((height - 6) / (chipPx + 2)));
      const visible  = ses.indices.slice(0, maxChips);
      const overflow = ses.indices.length - visible.length;

      const chipsHtml = visible.map(idx => {
        const task  = tasks[idx];
        const color = obGoalColor(task.s);
        return `<div class="ob-pv-chip" style="border-left-color:${color}" onclick="event.stopPropagation()">
          <span class="ob-pv-chip-s" style="color:${color}">${obEsc(task.s)}</span>
          <div class="ob-pv-chip-t" contenteditable="true" data-day="${dk}" data-idx="${idx}">${obEsc(task.t)}</div>
          <button class="ob-pv-chip-del" onclick="event.stopPropagation();obPlanRemoveTask(${dk},${idx})">×</button>
        </div>`;
      }).join('');

      const moreHtml   = overflow > 0 ? `<div class="ob-pv-more">+${overflow}개 더</div>` : '';
      const addHint    = ses.indices.length === 0
        ? `<div class="ob-pv-ses-add">+ 추가</div>`
        : '';

      return `<div class="ob-pv-session" style="top:${top}px;height:${height}px"
                   onclick="obPlanAddTask(${dk})">
        ${chipsHtml}${moreHtml}${addHint}
      </div>`;
    }).join('');

    // Extra tasks (no timetable for this day) shown as floating chips at top
    if (extraTasks.length) {
      sesHtml += extraTasks.map(idx => {
        const task  = tasks[idx];
        const color = obGoalColor(task.s);
        return `<div class="ob-pv-chip" style="border-left-color:${color};position:relative;margin:2px 1px">
          <span class="ob-pv-chip-s" style="color:${color}">${obEsc(task.s)}</span>
          <div class="ob-pv-chip-t" contenteditable="true" data-day="${dk}" data-idx="${idx}">${obEsc(task.t)}</div>
          <button class="ob-pv-chip-del" onclick="event.stopPropagation();obPlanRemoveTask(${dk},${idx})">×</button>
        </div>`;
      }).join('');
    }

    colsHtml += `<div class="ob-pv-col">
      <div class="ob-pv-col-hd">${DAY_KO[di]}</div>
      <div class="ob-pv-col-body" style="height:${TOTAL_H}px">
        ${hrLines}${sesHtml}
      </div>
    </div>`;
  }

  bg.innerHTML = `
    <div class="ob-panel ob-wide" style="max-width:780px">
      <div class="ob-dots"><span class="on"></span><span class="on"></span><span class="on"></span><span class="on"></span></div>
      <h1 class="ob-h1">플래너 미리보기</h1>
      <p class="ob-p">선택한 시간대에 태스크가 배치됐어요. 태스크 텍스트를 눌러 수정하거나 × 로 삭제, 빈 시간대를 눌러 추가할 수 있어요.</p>
      <div class="ob-pv-wrap">
        <div class="ob-pv-grid">
          <div class="ob-pv-time" style="height:${TOTAL_H + HDR_H}px">${timeAxis}</div>
          <div class="ob-pv-cols">${colsHtml}</div>
        </div>
      </div>
      <div class="ob-footer" style="margin-top:14px">
        <button onclick="obGoTo(3)" class="ob-btn ob-ghost">← 이전</button>
        <button onclick="obConfirm()" class="ob-btn ob-pri">확정하기 →</button>
      </div>
    </div>`;
}

function obFlushPlan() {
  document.querySelectorAll('[contenteditable][data-day][data-idx]').forEach(el => {
    const d   = parseInt(el.dataset.day);
    const idx = parseInt(el.dataset.idx);
    if (obS.pendingPlan && Array.isArray(obS.pendingPlan[d]) && obS.pendingPlan[d][idx]) {
      const val = el.textContent.trim();
      if (val) obS.pendingPlan[d][idx].t = val;
    }
  });
}

function obPlanRemoveTask(dk, idx) {
  obFlushPlan();
  if (obS.pendingPlan && Array.isArray(obS.pendingPlan[dk])) {
    obS.pendingPlan[dk].splice(idx, 1);
  }
  obRenderStep4();
}

function obPlanAddTask(dk) {
  obFlushPlan();
  if (!obS.pendingPlan) obS.pendingPlan = {};
  if (!Array.isArray(obS.pendingPlan[dk])) obS.pendingPlan[dk] = [];
  obS.pendingPlan[dk].push({ s: '기타', t: '새 태스크' });
  obRenderStep4();
  setTimeout(() => {
    const dayTasks = document.querySelectorAll(`[contenteditable][data-day="${dk}"]`);
    if (dayTasks.length) {
      const el = dayTasks[dayTasks.length - 1];
      el.focus();
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }, 50);
}

function obConfirm() {
  obFlushPlan();
  if (!obS.pendingPlan) return;
  obSaveSlots();
  obSaveGoals();
  try { localStorage.setItem(LS_TEMPLATES, JSON.stringify(obS.pendingPlan)); } catch(e){}
  try { localStorage.setItem(OB_DONE_KEY, '1'); } catch(e){}
  const bg = document.getElementById('obBg');
  if (bg) { bg.style.display = 'none'; bg.innerHTML = ''; }
  // 인메모리 templates 직접 갱신 — syncPull이 비동기로 새 플랜을 덮어쓰는 것을 방지
  try { if (typeof templates !== 'undefined') templates = JSON.parse(JSON.stringify(obS.pendingPlan)); } catch(e) {}
  if (typeof rerenderActive === 'function') rerenderActive();
  if (typeof updateChrome === 'function') updateChrome();
  // pull 대신 push — 서버 구데이터가 새 플랜을 덮어쓰지 않도록
  if (typeof getSyncKey === 'function' && getSyncKey() && typeof syncPush === 'function') syncPush();
  setTimeout(() => { if (typeof toast === 'function') toast('플래너가 생성됐어요 🎉'); }, 100);
}

/* ── step handlers ── */
function obStep1Next() {
  const key = (document.getElementById('ob-key').value || '').trim();
  if (key && key.length < 4) {
    const inp = document.getElementById('ob-key');
    inp.style.borderColor = '#e07b7b';
    inp.focus(); return;
  }
  if (key && typeof setSyncKey === 'function') setSyncKey(key);
  obGoTo(2);
}

function obStep2Next() {
  const h = obS.slots.reduce((t, d) => t + d.filter(Boolean).length * 0.5, 0);
  if (h < 1) {
    const el = document.getElementById('ob-hours-val');
    if (el) { el.textContent = '최소 1시간 이상 선택해주세요'; el.style.color = '#e07b7b'; }
    return;
  }
  obGoTo(3);
}

async function obFinish() {
  if (!obS.goals.length) {
    const el = document.getElementById('ob-goal-list');
    if (el) el.innerHTML = '<div class="ob-hint-empty" style="color:#e07b7b">// 목표를 1개 이상 추가해주세요</div>';
    return;
  }

  // 로딩 화면
  const bg = document.getElementById('obBg');
  if (bg) bg.innerHTML = `
    <div class="ob-panel" style="text-align:center;padding:52px 28px">
      <div class="ob-spinner"></div>
      <div style="font-family:var(--mono);font-size:13px;color:var(--mut);margin-top:20px">// 플래너를 생성하고 있어요...</div>
      <div style="font-family:var(--mono);font-size:11px;color:var(--cmt);margin-top:8px">목표와 시간표를 분석 중</div>
    </div>`;

  let plan;
  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goals: obS.goals, slots: obS.slots }),
    });
    if (!res.ok) throw new Error('status ' + res.status);
    const data = await res.json();
    if (!data.plan) throw new Error('no plan');
    plan = data.plan;
  } catch (err) {
    console.warn('GPT fallback:', err.message);
    plan = obGeneratePlan();
    setTimeout(() => { if (typeof toast === 'function') toast('AI 연결 실패 — 기본 로직으로 생성했어요'); }, 200);
  }

  obS.pendingPlan = plan;
  obS.step = 4;
  obRender();
}

function obSkip() {
  try { localStorage.setItem(OB_DONE_KEY, '1'); } catch(e){}
  const bg = document.getElementById('obBg');
  if (bg) { bg.style.display = 'none'; bg.innerHTML = ''; }
}

/* ── public: reset from data tab ── */
function obReset() {
  const hasTemplates = typeof templates !== 'undefined' &&
    Object.keys(templates).some(k => Array.isArray(templates[k]) && templates[k].length > 0);
  if (hasTemplates && !confirm('플래너 설정을 처음부터 다시 할까요?\n\n✓ 유지되는 것: 체크 기록, 달력, 생각 기록\n✗ 새로 설정: 목표, 시간표, 플래너')) return;
  try { localStorage.removeItem(OB_DONE_KEY); } catch(e){}
  obS = { step:1, slots:Array.from({length:7}, () => new Array(35).fill(false)), goals:[] };
  const slots = obLoadSlots(); if (slots) obS.slots = slots;
  const goals = obLoadGoals(); if (goals) obS.goals = goals;
  const bg = document.getElementById('obBg');
  if (bg) { bg.style.display = 'flex'; obRender(); }
}

/* ── init ── */
function checkOnboarding() {
  if (localStorage.getItem(OB_DONE_KEY)) return;
  const slots = obLoadSlots(); if (slots) obS.slots = slots;
  const goals = obLoadGoals(); if (goals) obS.goals = goals;
  const bg = document.getElementById('obBg');
  if (!bg) return;
  bg.style.display = 'flex';
  obRender();
}
