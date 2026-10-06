/* ============================================================
   commission.js — симуляция устной экзаменационной комиссии
   ============================================================ */
const Commission = (() => {
  let setup = { count: 10, difficulty: 'normal' };
  let session = null;
  let timerId = null;
  let keyHandler = null;

  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const DIFF = {
    base:   { label:'БАЗОВАЯ',  time:120, desc:'Много времени, базовые типы вопросов' },
    normal: { label:'ОБЫЧНАЯ',  time:90,  desc:'Реалистичный темп комиссии' },
    hard:   { label:'ЖЁСТКАЯ',  time:60,  desc:'Мало времени, акцент на сравнения и причины' }
  };

  const shuffle = a => a.slice().sort(() => Math.random() - 0.5);

  /* Подбор вопросов с чередованием типов */
  function pickQuestions(count, difficulty) {
    const byType = {};
    COMMISSION.forEach(q => { (byType[q.type] = byType[q.type] || []).push(q); });
    let keys = Object.keys(byType);
    if (difficulty === 'base') keys = keys.filter(k => !['Неожиданный вопрос','Сравнение'].includes(k));
    if (difficulty === 'hard') keys.sort((a, b) => (['Сравнение','Неожиданный вопрос','Следствие','Причина'].includes(a) ? -1 : 1) - (['Сравнение','Неожиданный вопрос','Следствие','Причина'].includes(b) ? -1 : 1));
    keys.forEach(k => { byType[k] = shuffle(byType[k]); });

    const out = [];
    let i = 0;
    while (out.length < count) {
      const k = keys[i % keys.length];
      const q = byType[k].pop();
      if (q) out.push(q);
      else {
        // пул типов исчерпан — добираем из общего списка
        const rest = shuffle(COMMISSION.filter(x => !out.includes(x)));
        if (!rest.length) break;
        out.push(rest[0]);
      }
      i++;
      if (i > 500) break;
    }
    return out;
  }

  const root = () => document.getElementById('commissionRoot');

  /* ---------------- SETUP ---------------- */
  function renderSetup() {
    clearTimer();
    session = null;
    const runs = (Store.state.commission && Store.state.commission.runs) || [];
    const last = runs[0];
    root().innerHTML = `
      <div class="commission-hero">
        <h1>🎤 КОМИССИЯ</h1>
        <p>Тебя уже не спасёт узнавание ответа.<br>Теперь нужно его воспроизвести вслух.</p>
      </div>

      <div class="setup-grid">
        <div class="setup-box">
          <h3>КОЛИЧЕСТВО ВОПРОСОВ</h3>
          <div class="opt-row" id="countRow">
            ${[10,15,20].map(n => `<button class="opt ${setup.count === n ? 'is-active' : ''}" data-count="${n}">${n}</button>`).join('')}
          </div>
        </div>
        <div class="setup-box">
          <h3>СЛОЖНОСТЬ</h3>
          <div class="opt-row" id="diffRow">
            ${Object.keys(DIFF).map(k => `
              <button class="opt ${setup.difficulty === k ? 'is-active' : ''}" data-diff="${k}">
                ${DIFF[k].label}<span class="o-s">${DIFF[k].desc}</span>
              </button>`).join('')}
          </div>
        </div>
      </div>

      <div class="setup-start">
        <button class="btn btn-primary btn-lg" id="startComm">НАЧАТЬ СИМУЛЯЦИЮ →</button>
        <div class="kbd-help" style="text-align:left;margin-top:12px">
          В процессе: <span class="kbd">Enter</span> — я ответил / далее · <span class="kbd">1</span><span class="kbd">2</span><span class="kbd">3</span> — самооценка · <span class="kbd">Esc</span> — выход
        </div>
      </div>

      ${last ? `
      <div class="panel">
        <h2 class="panel-title">ПОСЛЕДНИЕ ПРОХОДЫ</h2>
        <div class="recent-runs">
          ${runs.slice(0, 5).map(r => `
            <div class="run-row">
              <span>${esc(r.date)} · ${r.total} вопросов</span>
              <span>уверенно ${r.good} · частично ${r.partial} · провал ${r.bad}</span>
              <span class="rr-a">${r.accuracy}%</span>
            </div>`).join('')}
        </div>
      </div>` : ''}`;

    root().querySelectorAll('[data-count]').forEach(b => {
      b.onclick = () => { setup.count = Number(b.dataset.count); renderSetup(); };
    });
    root().querySelectorAll('[data-diff]').forEach(b => {
      b.onclick = () => { setup.difficulty = b.dataset.diff; renderSetup(); };
    });
    root().querySelector('#startComm').onclick = () => begin();
    bindKeys();
  }

  /* ---------------- ВОПРОС ---------------- */
  function begin() {
    const qs = pickQuestions(setup.count, setup.difficulty);
    if (!qs.length) return;
    session = {
      questions: qs, idx: 0, results: [],
      limit: DIFF[setup.difficulty].time,
      left: DIFF[setup.difficulty].time,
      revealed: false
    };
    renderQuestion();
  }

  function renderQuestion() {
    const s = session;
    if (!s) return;
    if (s.idx >= s.questions.length) return renderFinal();
    s.revealed = false;
    s.left = s.limit;
    const q = s.questions[s.idx];
    const pct = Math.round(s.idx / s.questions.length * 100);

    root().innerHTML = `
      <div class="stage-top">
        <button class="btn btn-ghost" id="commExit">← ВЫЙТИ</button>
        <div class="stage-meta">
          <span>КОМИССИЯ · ${DIFF[setup.difficulty].label}</span>
          <span>${s.idx + 1} / ${s.questions.length}</span>
        </div>
      </div>
      <div class="bar bar-sm stage-progress"><i style="width:${pct}%"></i></div>

      <div class="comm-q-head">
        <span class="comm-q-type">${esc(q.type)}</span>
        <span class="comm-progress">ВОПРОС ${s.idx + 1} ИЗ ${s.questions.length}</span>
      </div>

      <div class="comm-timer" id="commTimer" aria-live="off">${fmt(s.left)}</div>
      <div class="comm-progress">ОТВЕЧАЙ ВСЛУХ</div>

      <div class="comm-question">
        <div class="cq-l">ВОПРОС</div>
        <div class="cq-t">${esc(q.q)}</div>
        <div class="comm-actions">
          <button class="btn btn-primary btn-lg" id="answeredBtn">Я ОТВЕТИЛ</button>
        </div>
      </div>`;

    root().querySelector('#commExit').onclick = confirmExit;
    root().querySelector('#answeredBtn').onclick = reveal;
    startTimer();
    bindKeys();
  }

  function reveal() {
    if (!session || session.revealed) return;
    session.revealed = true;
    clearTimer();
    const q = session.questions[session.idx];
    const box = root().querySelector('.comm-question');
    if (!box) return;
    box.insertAdjacentHTML('afterend', `
      <div class="etalon" id="etalonBox">
        <h3>ЭТАЛОННЫЙ ОТВЕТ</h3>
        <div class="et-a">${esc(q.answer)}</div>
        <div class="et-min"><b>Минимум для зачёта — что обязательно упомянуть:</b>
          <ul class="check-list">${q.must.map(m => `<li><span class="ck">✓</span>${esc(m)}</li>`).join('')}</ul>
        </div>
        <div class="rate-q" style="margin-top:22px">КАК ТЫ ОТВЕТИЛ?</div>
        <div class="self-rate">
          <button class="self-btn s-bad" data-rate="0">❌ ПЛОХО</button>
          <button class="self-btn s-part" data-rate="1">🟡 ЧАСТИЧНО</button>
          <button class="self-btn s-good" data-rate="2">🟢 ХОРОШО</button>
        </div>
        <div class="kbd-help"><span class="kbd">1</span> плохо · <span class="kbd">2</span> частично · <span class="kbd">3</span> хорошо</div>
      </div>`);
    const actions = root().querySelector('.comm-actions');
    if (actions) actions.remove();

    root().querySelectorAll('[data-rate]').forEach(b => {
      b.onclick = () => rate(Number(b.dataset.rate));
    });
    bindKeys();
    const et = root().querySelector('#etalonBox');
    if (et && et.scrollIntoView) et.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function rate(r) {
    const s = session;
    const q = s.questions[s.idx];
    s.results.push({ q, r });
    if (r === 0) Progress.markErrorByRef(q.ref);
    s.idx++;
    renderQuestion();
  }

  /* ---------------- ФИНАЛ ---------------- */
  function renderFinal() {
    clearTimer();
    const s = session;
    const total = s.results.length;
    const good = s.results.filter(x => x.r === 2).length;
    const partial = s.results.filter(x => x.r === 1).length;
    const bad = s.results.filter(x => x.r === 0).length;
    const accuracy = total ? Math.round(good / total * 100) : 0;
    const gapTopics = {};
    s.results.filter(x => x.r < 2).forEach(x => {
      const t = TOPICS.find(t => t.id === x.q.t);
      if (t) gapTopics[t.short] = (gapTopics[t.short] || 0) + 1;
    });
    const gaps = Object.keys(gapTopics).sort((a, b) => gapTopics[b] - gapTopics[a]);

    Progress.logCommissionRun({ total, good, partial, bad, accuracy, gaps });

    root().innerHTML = `
      <div class="comm-final">
        <div class="cf-title">КОМИССИЯ ЗАВЕРШЕНА</div>
        <div class="cf-grid">
          <div><span>ВОПРОСОВ</span><b>${total}</b></div>
          <div><span>УВЕРЕННЫХ</span><b>${good}</b></div>
          <div><span>ЧАСТИЧНЫХ</span><b>${partial}</b></div>
          <div><span>ПРОВАЛОВ</span><b>${bad}</b></div>
        </div>
        <div class="cf-l" style="font-size:11px;letter-spacing:.2em;color:var(--muted)">ТОЧНОСТЬ</div>
        <div class="cf-acc">${accuracy}%</div>

        ${gaps.length ? `
          <div class="cf-gaps">
            <h4>ОСНОВНЫЕ ПРОБЕЛЫ НАХОДЯТСЯ В ТЕМАХ</h4>
            <ul>${gaps.map(g => `<li>${esc(g)} — ${gapTopics[g]}</li>`).join('')}</ul>
          </div>` : `
          <div class="cf-gaps" style="border-color:rgba(111,175,114,.35);background:rgba(111,175,114,.07)">
            <h4 style="color:#a9dfac">СЛАБЫХ ТЕМ НЕ ОБНАРУЖЕНО</h4>
            <ul><li>Пройди ещё один раунд на «жёсткой» сложности</li></ul>
          </div>`}

        <div id="wrongWrap">
          <div class="cf-actions">
            <button class="btn btn-red" id="reviewWrong">РАЗОБРАТЬ ОШИБКИ</button>
            <button class="btn btn-primary" id="finAgain">ЕЩЁ РАУНД</button>
            <button class="btn btn-ghost" id="finBack">В ОБЗОР</button>
          </div>
        </div>
        <div id="wrongList" class="cf-wrong" hidden></div>
      </div>`;

    root().querySelector('#reviewWrong').onclick = () => showWrong(s.results.filter(x => x.r < 2));
    root().querySelector('#finAgain').onclick = renderSetup;
    root().querySelector('#finBack').onclick = () => Nav.go('dashboard');
    bindKeys();
    if (typeof App !== 'undefined' && App.refreshChrome) App.refreshChrome();
  }

  function showWrong(items) {
    const list = root().querySelector('#wrongList');
    const actions = root().querySelector('#reviewWrong');
    if (!items.length) {
      list.hidden = false;
      list.innerHTML = '<div class="w-item"><div class="w-q">Разбирать нечего — ошибок нет.</div></div>';
      return;
    }
    if (actions) { actions.disabled = true; actions.textContent = 'ОШИБКИ НИЖЕ'; }
    list.hidden = false;
    list.innerHTML = items.map(x => `
      <div class="w-item">
        <div class="w-q">${esc(x.q.q)}</div>
        <div class="w-a">${esc(x.q.answer)}</div>
        <div class="w-m">Обязательно: ${esc(x.q.must.join(' · '))}</div>
      </div>`).join('');
    if (list && list.scrollIntoView) list.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ---------------- таймер ---------------- */
  function fmt(sec) {
    const s = Math.max(0, sec);
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }
  function startTimer() {
    clearTimer();
    timerId = setInterval(() => {
      if (!session) return clearTimer();
      session.left--;
      const el = document.getElementById('commTimer');
      if (el) {
        el.textContent = fmt(session.left);
        el.classList.toggle('warn', session.left <= 30 && session.left > 10);
        el.classList.toggle('crit', session.left <= 10);
      }
      if (session.left <= 0) clearTimer();
    }, 1000);
  }
  function clearTimer() { if (timerId) { clearInterval(timerId); timerId = null; } }

  function confirmExit() {
    clearTimer();
    if (session && session.results.length > 0 &&
        !confirm('Симуляция не завершена. Выйти без результата?')) {
      startTimer();
      return;
    }
    renderSetup();
  }

  function destroy() { clearTimer(); session = null; if (keyHandler) { document.removeEventListener('keydown', keyHandler); keyHandler = null; } }

  /* ---------------- клавиатура ---------------- */
  function bindKeys() {
    if (keyHandler) document.removeEventListener('keydown', keyHandler);
    keyHandler = e => {
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      if (!document.getElementById('page-commission').classList.contains('is-active')) return;

      if (e.key === 'Escape') { e.preventDefault(); if (session) confirmExit(); return; }
      if (session && !session.revealed && e.key === 'Enter') {
        e.preventDefault(); reveal(); return;
      }
      if (session && session.revealed && ['1','2','3'].includes(e.key)) {
        e.preventDefault(); rate(Number(e.key) - 1); return;
      }
      if (session && session.idx >= session.questions.length) {
        if (e.key === 'Enter') { e.preventDefault(); renderSetup(); }
      }
    };
    document.addEventListener('keydown', keyHandler);
  }

  return {
    renderSetup, destroy,
    get session() { return session; },
    start: (opts) => { if (opts && opts.count) setup.count = opts.count; renderSetup(); begin(); }
  };
})();
