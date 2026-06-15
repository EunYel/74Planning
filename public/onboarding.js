'use strict';
/* ── Onboarding / Planner Wizard ── */

const OB_DONE_KEY  = 'hajogi_onboarding_done';
const OB_SLOTS_KEY = 'hajogi_timetable';
const OB_GOALS_KEY = 'hajogi_goals';

const OB_DAYS_KO = ['월','화','수','목','금','토','일'];
const OB_TIMES   = [];
for (let h = 7; h < 23; h++) {
  OB_TIMES.push({ label: `${String(h).padStart(2,'0')}:00`, isHour: true });
  OB_TIMES.push({ label: `${String(h).padStart(2,'0')}:30`, isHour: false });
}
// 32 slots: 07:00 ~ 22:30

let obS = {
  step:  1,
  slots: Array.from({length:7}, () => new Array(32).fill(false)),
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

    for (const goal of obS.goals) {
      if (budget < 0.3) break;
      const share  = totalHrs > 0 ? (avail / totalHrs) * goal.weeklyHours : 0;
      const hours  = Math.min(share, budget);
      if (hours < 0.25) continue;

      const preset = obGetPreset(goal.name);
      const n      = Math.max(1, Math.round(hours * 2));
      preset.tasks.slice(0, n).forEach(t => tasks.push({ s: goal.name, t, g: preset.code }));
      budget -= hours;
    }

    tasks.push({ s: '기타', t: '채용 공고 확인 (10분)', g: 'cg' });
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
  const hEl = document.getElementById('ob-goal-hours');
  const name  = (nEl.value || '').trim();
  const hours = parseFloat(hEl.value) || 0;
  if (!name)      { nEl.focus(); return; }
  if (hours <= 0) { hEl.focus(); return; }
  if (obS.goals.find(g => g.name === name)) { nEl.value = ''; nEl.focus(); return; }
  obS.goals.push({ name, weeklyHours: hours });
  nEl.value = ''; hEl.value = '';
  nEl.focus();
  obRenderGoals();
}
function obRemoveGoal(i) { obS.goals.splice(i, 1); obRenderGoals(); }
function obQuickAdd(name, hours) {
  if (obS.goals.find(g => g.name === name)) return;
  obS.goals.push({ name, weeklyHours: hours });
  obRenderGoals();
}
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
      <span class="ob-goal-hrs">${g.weeklyHours}h/주</span>
      <button onclick="obRemoveGoal(${i})" class="ob-goal-del" title="삭제">×</button>
    </div>`).join('');
}

/* ── step renders ── */
function obRender() {
  const bg = document.getElementById('obBg');
  if (!bg) return;

  if (obS.step === 1) {
    const existingKey = (typeof getSyncKey === 'function') ? (getSyncKey() || '') : '';
    bg.innerHTML = `
      <div class="ob-panel">
        <div class="ob-brand">// 74Planning</div>
        <h1 class="ob-h1">시작하기</h1>
        <p class="ob-p">동기화 키를 설정하면 노트북과 폰에서 데이터를 공유할 수 있어요.<br>나만 아는 단어나 문구를 사용해주세요.</p>
        <label class="ob-label">동기화 키 (비밀번호)</label>
        <input id="ob-key" type="text" class="ob-input" placeholder="4자 이상 입력..." autocomplete="off" spellcheck="false" value="${existingKey}">
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
        <p class="ob-p">어떤 공부를 얼마나 할 계획인가요? 빠른 추가를 쓰거나 직접 입력해주세요.</p>

        <div class="ob-quick-row">
          <button onclick="obQuickAdd('토익',8)"   class="ob-quick">토익</button>
          <button onclick="obQuickAdd('토스',3)"   class="ob-quick">토스</button>
          <button onclick="obQuickAdd('코테',5)"   class="ob-quick">코테</button>
          <button onclick="obQuickAdd('자소서',3)" class="ob-quick">자소서</button>
          <button onclick="obQuickAdd('NCS',4)"    class="ob-quick">NCS</button>
          <button onclick="obQuickAdd('자격증',5)" class="ob-quick">자격증</button>
        </div>

        <div class="ob-add-row">
          <input id="ob-goal-name"  type="text"   class="ob-input ob-flex" placeholder="목표 이름 (예: 정보처리기사)">
          <input id="ob-goal-hours" type="number" class="ob-input ob-sm"   placeholder="h/주" min="0.5" max="80" step="0.5">
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
    const hEl = document.getElementById('ob-goal-hours');
    nEl.addEventListener('keydown', e => { if (e.key === 'Enter') hEl.focus(); });
    hEl.addEventListener('keydown', e => { if (e.key === 'Enter') obAddGoal(); });

  } else if (obS.step === 4) {
    obRenderStep4();
  }
}

function obGoTo(step) { obS.step = step; obRender(); }

/* ── step 4: plan preview & edit ── */
function obEsc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function obRenderStep4() {
  const bg = document.getElementById('obBg');
  if (!bg) return;

  const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
  const DAY_NAMES_FULL = ['일요일','월요일','화요일','수요일','목요일','금요일','토요일'];

  let daysHtml = '';
  for (const dk of DAY_ORDER) {
    const tasks = obS.pendingPlan && Array.isArray(obS.pendingPlan[dk]) ? obS.pendingPlan[dk] : [];
    if (!tasks.length) continue;

    let tasksHtml = tasks.map((task, idx) => `
      <div class="ob-plan-task">
        <span class="ob-plan-s">${obEsc(task.s)}</span>
        <div class="ob-plan-t" contenteditable="true" data-day="${dk}" data-idx="${idx}">${obEsc(task.t)}</div>
        <button class="ob-plan-del" onclick="obPlanRemoveTask(${dk},${idx})">×</button>
      </div>`).join('');

    daysHtml += `
      <div class="ob-plan-day">
        <div class="ob-plan-day-hd">
          <span>${DAY_NAMES_FULL[dk]}</span>
          <span class="ob-plan-cnt">${tasks.length}개</span>
        </div>
        <div class="ob-plan-tasks">${tasksHtml}</div>
        <button class="ob-plan-add" onclick="obPlanAddTask(${dk})">+ 태스크 추가</button>
      </div>`;
  }

  bg.innerHTML = `
    <div class="ob-panel ob-wide">
      <div class="ob-dots"><span class="on"></span><span class="on"></span><span class="on"></span><span class="on"></span></div>
      <h1 class="ob-h1">플래너 미리보기</h1>
      <p class="ob-p">태스크를 클릭해서 수정하거나 × 로 삭제할 수 있어요. 하루에 태스크를 직접 추가할 수도 있어요.</p>
      <div class="ob-plan-days">${daysHtml}</div>
      <div class="ob-footer" style="margin-top:20px">
        <button onclick="obGoTo(3)" class="ob-btn ob-ghost">← 이전</button>
        <button onclick="obConfirm()" class="ob-btn ob-pri">확정하기 →</button>
      </div>
    </div>`;
}

function obFlushPlan() {
  document.querySelectorAll('.ob-plan-t[contenteditable]').forEach(el => {
    const dk  = parseInt(el.dataset.day);
    const idx = parseInt(el.dataset.idx);
    if (obS.pendingPlan && Array.isArray(obS.pendingPlan[dk]) && obS.pendingPlan[dk][idx]) {
      const val = el.textContent.trim();
      if (val) obS.pendingPlan[dk][idx].t = val;
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
  obS.pendingPlan[dk].push({ s: '기타', t: '새 태스크', g: 'cg' });
  obRenderStep4();
  setTimeout(() => {
    const dayTasks = document.querySelectorAll(`.ob-plan-t[data-day="${dk}"]`);
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
  if (typeof initApp === 'function') initApp();
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
      <div style="font-family:var(--mono);font-size:13px;color:var(--mut);margin-top:20px">// GPT가 플래너를 생성하고 있어요...</div>
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
  if (!confirm('플래너 설정을 처음부터 다시 할까요?\n\n✓ 유지되는 것: 체크 기록, 달력, 생각 기록\n✗ 새로 설정: 목표, 시간표, 플래너')) return;
  try { localStorage.removeItem(OB_DONE_KEY); } catch(e){}
  obS = { step:1, slots:Array.from({length:7}, () => new Array(32).fill(false)), goals:[] };
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
