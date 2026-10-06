/* ============================================================
   pomodoro.js — таймер учёбы «Помодоро»
   Работа → перерыв → снова работа; длинный отдых каждые N раундов.
   Настройки и состояние переживают перезагрузку страницы.
   ============================================================ */
const Pomodoro = (() => {
  const DEF = { work: 25, short: 5, long: 15, rounds: 4 };
  const LIMITS = { work: [1, 120], short: [1, 30], long: [1, 60], rounds: [1, 8] };
  const LABEL = { work: 'РАБОТА', short: 'КОРОТКИЙ ОТДЫХ', long: 'ДЛИННЫЙ ОТДЫХ' };
  const NOTE = {
    work: 'Глубокая работа без отвлечений. По завершении — сигнал и перерыв.',
    short: 'Короткий перерыв: вода, разминка, глаза в окно.',
    long: 'Длинный перерыв после полного цикла. Отдыхай по-настоящему.'
  };
  const TITLE0 = document.title;

  let settings = Object.assign({}, DEF);
  let state = { mode: 'work', remaining: DEF.work * 60, running: false, endAt: 0, cyclesDone: 0 };
  let lastTick = Date.now();
  let sinceSave = 0;
  let audioCtx = null;
  let interval = null;

  const $ = id => document.getElementById(id);
  const pad = n => String(n).padStart(2, '0');
  const mmss = s => { s = Math.max(0, Math.ceil(s)); return pad(Math.floor(s / 60)) + ':' + pad(s % 60); };
  const clamp = (v, k) => Math.min(LIMITS[k][1], Math.max(LIMITS[k][0], Math.round(v)));

  const durationFor = mode =>
    (mode === 'work' ? settings.work : mode === 'short' ? settings.short : settings.long) * 60;

  /* ---------------- звуковой сигнал (WebAudio, без файлов) ---------------- */
  function beep() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtx) audioCtx = new Ctx();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const t = audioCtx.currentTime;
      [0, 0.28].forEach(offset => {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(880, t + offset);
        g.gain.setValueAtTime(0.0001, t + offset);
        g.gain.exponentialRampToValueAtTime(0.18, t + offset + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + offset + 0.22);
        o.connect(g); g.connect(audioCtx.destination);
        o.start(t + offset); o.stop(t + offset + 0.25);
      });
    } catch (e) { /* звук не обязателен */ }
  }

  /* ---------------- состояние и сохранение ---------------- */
  function load() {
    const s = Store.state.settings && Store.state.settings.pomodoro;
    if (s && typeof s === 'object') {
      Object.keys(DEF).forEach(k => {
        const v = Number(s[k]);
        if (v >= LIMITS[k][0] && v <= LIMITS[k][1]) settings[k] = Math.round(v);
      });
    }
    const ps = Store.state.pomodoro;
    if (ps && typeof ps === 'object' && LABEL[ps.mode]) {
      state.mode = ps.mode;
      state.cyclesDone = Number(ps.cyclesDone) || 0;
      state.remaining = Number(ps.remaining);
      if (!(state.remaining > 0)) state.remaining = durationFor(state.mode);
      const alive = ps.running && Number(ps.endAt) > Date.now();
      state.running = !!alive;
      state.endAt = alive ? Number(ps.endAt) : 0;
      if (alive) state.remaining = (state.endAt - Date.now()) / 1000;
    }
    lastTick = Date.now();
  }

  function persist() {
    Store.state.settings.pomodoro = Object.assign({}, settings);
    Store.state.pomodoro = {
      mode: state.mode,
      remaining: state.running ? Math.max(0, (state.endAt - Date.now()) / 1000) : state.remaining,
      running: state.running,
      endAt: state.endAt,
      cyclesDone: state.cyclesDone
    };
    Store.save();
  }

  /* ---------------- управление ---------------- */
  function start() {
    if (state.running) return;
    if (!(state.remaining > 0)) state.remaining = durationFor(state.mode);
    state.running = true;
    lastTick = Date.now();
    state.endAt = lastTick + state.remaining * 1000;
    beep();
    persist(); render();
  }

  function pause() {
    if (!state.running) return;
    state.running = false;
    state.remaining = Math.max(0, (state.endAt - Date.now()) / 1000);
    state.endAt = 0;
    persist(); render();
  }

  function toggle() { state.running ? pause() : start(); }

  function reset() {
    state.running = false;
    state.endAt = 0;
    state.remaining = durationFor(state.mode);
    persist(); render();
  }

  function nextPhase(completed) {
    if (state.mode === 'work') {
      if (completed) {
        state.cyclesDone++;
        const day = Progress.ensureDay().day;
        day.pomodoros = (day.pomodoros || 0) + 1;
      }
      const longBreak = completed && state.cyclesDone > 0 && state.cyclesDone % settings.rounds === 0;
      state.mode = longBreak ? 'long' : 'short';
      state.running = true;                       // перерыв идёт сам
    } else {
      state.mode = 'work';
      state.running = false;                      // работу начинаем осознанно
    }
    state.remaining = durationFor(state.mode);
    state.endAt = state.running ? Date.now() + state.remaining * 1000 : 0;
    lastTick = Date.now();
  }

  function skip() {
    state.running = false;
    nextPhase(false);
    persist(); render();
  }

  function completePhase() {
    beep();
    nextPhase(true);
    persist(); render();
  }

  /* ---------------- такт ---------------- */
  function tick() {
    const now = Date.now();
    const dt = Math.min(Math.max(0, now - lastTick) / 1000, 300);
    lastTick = now;
    if (!state.running) return;

    const leftAfter = (state.endAt - now) / 1000;
    if (state.mode === 'work') {
      // в фокус засчитывается только реально отработанное время работы
      const credited = Math.min(dt, Math.max(0, leftAfter + dt));
      if (credited > 0) {
        const day = Progress.ensureDay().day;
        day.focus = (day.focus || 0) + credited;
      }
    }
    if (leftAfter <= 0) { completePhase(); return; }

    update();
    sinceSave += dt;
    if (sinceSave >= 5) { sinceSave = 0; persist(); }
  }

  /* ---------------- настройки ---------------- */
  function setSetting(key, value) {
    if (!(key in LIMITS)) return;
    settings[key] = clamp(Number(value), key);
    if (!state.running && state.mode === 'work') state.remaining = durationFor('work');
    if (state.mode !== 'work' && !state.running) state.remaining = durationFor(state.mode);
    persist(); render();
  }

  /* ---------------- отрисовка ---------------- */
  function roundInfo() {
    const current = (state.cyclesDone % settings.rounds) + 1;
    const doneInSet = state.mode === 'long' ? settings.rounds : state.cyclesDone % settings.rounds;
    return { current, doneInSet };
  }

  function render() {
    const root = $('pomodoroRoot');
    if (!root) return;
    const day = Progress.ensureDay().day;
    const { current, doneInSet } = roundInfo();
    const sub = state.mode === 'work'
      ? `РАУНД ${current} ИЗ ${settings.rounds}`
      : `СЛЕДОМ РАУНД ${current} ИЗ ${settings.rounds}`;

    const steps = [
      ['work', 'Работа', 'мин'],
      ['short', 'Короткий отдых', 'мин'],
      ['long', 'Длинный отдых', 'мин'],
      ['rounds', 'Раундов до длинного', '']
    ];

    root.innerHTML = `
      <div class="pomo-stage ${state.mode === 'work' ? 'is-work' : 'is-break'}" id="pomoStage">
        <div class="pomo-mode" id="pomoMode">${LABEL[state.mode]} · ${sub}</div>
        <div class="pomo-time" id="pomoTime" role="timer" aria-live="off">--:--</div>
        <div class="pomo-hint" id="pomoHint">${NOTE[state.mode]}</div>
        <div class="bar bar-lg pomo-bar"><i id="pomoBar" style="width:0%"></i></div>
        <div class="pomo-dots" aria-hidden="true">
          ${Array.from({ length: settings.rounds }, (_, i) =>
            `<span class="pomo-dot ${i < doneInSet ? 'done' : ''} ${state.mode === 'work' && i === doneInSet ? 'now' : ''}"></span>`
          ).join('')}
        </div>
        <div class="pomo-controls">
          <button class="btn btn-primary btn-lg" id="pomoToggle">▶ СТАРТ</button>
          <button class="btn btn-ghost btn-lg" id="pomoReset">↻ СБРОС ФАЗЫ</button>
          <button class="btn btn-ghost btn-lg" id="pomoSkip">→ ПРОПУСТИТЬ</button>
        </div>
        <div class="kbd-help"><span class="kbd">Пробел</span> — старт / пауза</div>
      </div>

      <div class="grid-2">
        <div class="panel">
          <h2 class="panel-title">НАСТРОЙКИ ЦИКЛА</h2>
          <div class="pomo-settings">
            ${steps.map(([k, label, unit]) => `
              <div class="ps-row">
                <span class="ps-label">${label}</span>
                <div class="stepper">
                  <button data-pomo-key="${k}" data-pomo-act="dec" aria-label="Уменьшить: ${label}">−</button>
                  <span class="ps-val" id="psVal_${k}">${settings[k]}</span>
                  <span class="ps-unit">${unit}</span>
                  <button data-pomo-key="${k}" data-pomo-act="inc" aria-label="Увеличить: ${label}">+</button>
                </div>
              </div>`).join('')}
          </div>
          <p class="pomo-note">Настройки сохраняются сразу; текущая фаза подстроится после сброса. Диапазоны: работа 1–120, отдых 1–30/1–60, раунды 1–8.</p>
        </div>

        <div class="panel">
          <h2 class="panel-title">СЕГОДНЯ</h2>
          <div class="today-stats">
            <div class="ts-row"><span class="ts-ico" style="color:var(--warn)">⏱</span><b id="pomoFocus">${Math.round((day.focus || 0) / 60)}</b> мин в фокусе</div>
            <div class="ts-row"><span class="ts-ico" style="color:var(--ok)">✓</span><b id="pomoToday">${day.pomodoros || 0}</b> помодоро завершено</div>
            <div class="ts-row"><span class="ts-ico">◷</span><b id="pomoCycles">${state.cyclesDone}</b> всего циклов за всё время</div>
          </div>
          <p class="pomo-note">Минуты фокуса попадают в блок «Сегодня» на обзоре и не считаются во время перерывов.</p>
        </div>
      </div>`;

    root.querySelector('#pomoToggle').onclick = toggle;
    root.querySelector('#pomoReset').onclick = reset;
    root.querySelector('#pomoSkip').onclick = skip;
    root.querySelectorAll('[data-pomo-key]').forEach(b => {
      b.onclick = () => {
        const k = b.dataset.pomoKey;
        const delta = b.dataset.pomoAct === 'inc' ? 1 : -1;
        setSetting(k, settings[k] + delta);
      };
    });
    update();
  }

  function update() {
    const time = $('pomoTime');
    if (!time) return;
    const left = state.running ? (state.endAt - Date.now()) / 1000 : state.remaining;
    time.textContent = mmss(left);

    const total = durationFor(state.mode);
    const bar = $('pomoBar');
    if (bar) bar.style.width = Math.min(100, Math.max(0, (1 - left / total) * 100)) + '%';

    const stage = $('pomoStage');
    if (stage) stage.classList.toggle('is-break', state.mode !== 'work');

    const toggleBtn = $('pomoToggle');
    if (toggleBtn) toggleBtn.textContent = state.running ? '⏸ ПАУЗА' : '▶ СТАРТ';

    document.title = state.running
      ? mmss(left) + ' · ' + LABEL[state.mode] + ' — ' + TITLE0
      : TITLE0;
  }

  /* ---------------- клавиатура ---------------- */
  document.addEventListener('keydown', e => {
    if (e.code !== 'Space' && e.key !== ' ') return;
    const page = document.getElementById('page-pomodoro');
    if (!page || !page.classList.contains('is-active')) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'button') return;
    if (typeof Nav !== 'undefined' && Nav.modalOpen()) return;
    e.preventDefault();
    toggle();
  });

  function init() {
    load();
    lastTick = Date.now();
    if (interval) clearInterval(interval);
    interval = setInterval(tick, 250);
  }

  return {
    init, render, start, pause, toggle, reset, skip, setSetting,
    get _state() { return state; },
    get _settings() { return settings; }
  };
})();
