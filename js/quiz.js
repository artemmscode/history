/* ============================================================
   quiz.js — мини-тесты с выбором ответа (проверка знания дат и смыслов)
   ============================================================ */
const Quiz = (() => {
  let state = null;   // {questions, idx, score, results, title, config}
  let keyHandler = null;

  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const shuffle = a => a.slice().sort(() => Math.random() - 0.5);
  const pickN = (a, n) => shuffle(a).slice(0, n);

  function distractors(correct, pool, n, getVal) {
    const seen = new Set([getVal(correct)]);
    const out = [correct];
    for (const item of pool) {
      if (out.length >= n + 1) break;
      const v = getVal(item);
      if (!v || seen.has(v)) continue;
      seen.add(v);
      out.push(item);
    }
    return shuffle(out);
  }

  /* вопрос: «Что произошло в {год}?» */
  function qDateEvent(d, pool) {
    const opts = distractors(d, pool, 3, x => x.title);
    return {
      q: `Что произошло в ${d.y}?`,
      options: opts.map(o => o.title),
      answer: opts.indexOf(d),
      explain: `${d.y} — ${d.title}. ${d.why}`,
      src: d.id
    };
  }

  /* вопрос: «Когда произошло {событие}?» */
  function qEventDate(e, pool) {
    const opts = distractors(e, pool, 3, x => x.year);
    return {
      q: `В каком году произошло: ${e.name}?`,
      options: opts.map(o => o.year),
      answer: opts.indexOf(e),
      explain: `${e.name} — ${e.year}. ${e.significance}`,
      src: e.id
    };
  }

  /* вопрос: «В чём значение события?» */
  function qEventWhy(e, pool) {
    const opts = distractors(e, pool, 3, x => x.significance);
    return {
      q: `Какое значение имеет событие «${e.name}»?`,
      options: opts.map(o => o.significance),
      answer: opts.indexOf(e),
      explain: `${e.name} (${e.year}): ${e.significance}`,
      src: e.id
    };
  }

  function buildTopic(topicId) {
    const dates = DATES.filter(d => d.t === topicId);
    const events = EVENTS.filter(e => e.t === topicId);
    const qs = [];
    if (dates.length >= 1) pickN(dates, 4).forEach(d => qs.push(qDateEvent(d, DATES)));
    if (events.length >= 1) pickN(events, 4).forEach(e => qs.push(
      Math.random() < .5 ? qEventDate(e, EVENTS) : qEventWhy(e, EVENTS)
    ));
    return shuffle(qs).slice(0, 8);
  }

  function buildEvent(eventId) {
    const e = EVENTS.find(x => x.id === eventId);
    if (!e) return [];
    return [
      qEventDate(e, EVENTS),
      qEventWhy(e, EVENTS),
      qDateEvent(DATES.find(d => d.t === e.t && d.title) || { id: e.id, y: e.year, title: e.name, why: e.significance }, DATES)
    ].filter(q => q.options.length >= 2);
  }

  function release() {
    state = null;
    unbindKeys();
  }

  function start(config) {
    const questions = config.topicId ? buildTopic(config.topicId) : buildEvent(config.eventId);
    if (!questions.length) {
      Nav.go('cards');
      return;
    }
    const t = TOPICS.find(x => x.id === config.topicId);
    state = { questions, idx: 0, score: 0, results: [], config,
              title: config.topicId ? 'ТЕСТ · ' + (t ? t.short : '') : 'ТЕСТ · СОБЫТИЕ' };
    Nav.go('cards');
    Cards.release();
    document.getElementById('cardsIdle').hidden = true;
    document.getElementById('cardsStage').hidden = false;
    render();
    bindKeys();
  }

  function render() {
    const stage = document.getElementById('cardsStage');
    const s = state;
    if (s.idx >= s.questions.length) return renderDone();

    const q = s.questions[s.idx];
    const pct = Math.round(s.idx / s.questions.length * 100);
    stage.innerHTML = `
      <div class="stage-top">
        <button class="btn btn-ghost" id="quizExit">← ВЫЙТИ</button>
        <div class="stage-meta"><span>${esc(s.title)}</span><span>${s.idx + 1} / ${s.questions.length}</span><span>✔ ${s.score}</span></div>
      </div>
      <div class="bar bar-sm stage-progress"><i style="width:${pct}%"></i></div>
      <div class="comm-question" style="max-width:640px;width:100%">
        <div class="cq-l">ВОПРОС ${s.idx + 1}</div>
        <div class="cq-t">${esc(q.q)}</div>
        <div style="display:flex;flex-direction:column;gap:10px;margin-top:20px" id="quizOpts">
          ${q.options.map((o, i) => `
            <button class="opt" style="width:100%;text-align:left;padding:14px 16px;line-height:1.5" data-i="${i}">
              <b style="color:var(--accent2)">${'ABCD'[i]}.</b> ${esc(o)}
            </button>`).join('')}
        </div>
        <div id="quizFeedback"></div>
      </div>`;
    stage.querySelector('#quizExit').onclick = stop;
    stage.querySelectorAll('[data-i]').forEach(b => {
      b.onclick = () => answer(Number(b.dataset.i));
    });
  }

  function answer(i) {
    const s = state;
    const q = s.questions[s.idx];
    const ok = i === q.answer;
    s.results.push({ q, i, ok });
    if (ok) s.score++;
    else Progress.markErrorByRef(q.src);

    const buttons = document.querySelectorAll('#quizOpts [data-i]');
    buttons.forEach((b, bi) => {
      b.disabled = true;
      if (bi === q.answer) { b.style.borderColor = 'var(--ok)'; b.style.background = 'rgba(111,175,114,.14)'; }
      else if (bi === i) { b.style.borderColor = 'var(--accent)'; b.style.background = 'rgba(184,58,58,.16)'; }
    });
    const fb = document.getElementById('quizFeedback');
    fb.innerHTML = `
      <div class="etalon" style="margin-top:18px">
        <h3>${ok ? '✔ ВЕРНО' : '✘ НЕВЕРНО'}</h3>
        <div class="et-a">${esc(q.explain)}</div>
        <div class="m-actions"><button class="btn btn-primary" id="quizNext">${s.idx + 1 >= s.questions.length ? 'РЕЗУЛЬТАТ' : 'ДАЛЬШЕ →'}</button></div>
      </div>`;
    fb.querySelector('#quizNext').onclick = next;
    document.getElementById('page-cards').querySelectorAll('#quizOpts button').forEach(b => b.onclick = null);
    bindKeys();
  }

  function next() {
    state.idx++;
    render();
    bindKeys();
  }

  function renderDone() {
    const s = state;
    const total = s.questions.length;
    const pct = total ? Math.round(s.score / total * 100) : 0;
    const wrong = s.results.filter(r => !r.ok);
    const stage = document.getElementById('cardsStage');
    stage.innerHTML = `
      <div class="stage-done">
        <div class="sd-title">ТЕСТ ЗАВЕРШЁН</div>
        <div class="sd-stats">
          <div><span>ВЕРНО</span><b>${s.score}</b></div>
          <div><span>ОШИБОК</span><b>${total - s.score}</b></div>
          <div><span>ТОЧНОСТЬ</span><b>${pct}%</b></div>
        </div>
        ${wrong.length ? `<div style="text-align:left;margin-top:8px">
          <div class="cq-l" style="letter-spacing:.2em;color:var(--muted);font-size:11px">ЧТО РАЗОБРАТЬ</div>
          ${wrong.map(w => `<div class="w-item" style="margin-top:10px"><div class="w-q">${esc(w.q.q)}</div>
            <div class="w-a">${esc(w.q.explain)}</div></div>`).join('')}
        </div>` : '<p class="page-sub" style="margin:0 auto">Ошибок нет. Так держать.</p>'}
        <div class="sd-actions" style="margin-top:24px">
          <button class="btn btn-primary" id="quizAgain">ЕЩЁ РАЗ</button>
          <button class="btn btn-ghost" id="quizBack">К КАРТОЧКАМ</button>
        </div>
      </div>`;
    stage.querySelector('#quizAgain').onclick = () => start(s.config);
    stage.querySelector('#quizBack').onclick = stop;
    bindKeys();
    if (typeof App !== 'undefined' && App.refreshChrome) App.refreshChrome();
  }

  function stop() {
    state = null;
    unbindKeys();
    Cards.showIdle();
  }

  function bindKeys() {
    unbindKeys();
    keyHandler = e => {
      if (!state) return;
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      if (!document.getElementById('page-cards').classList.contains('is-active')) return;
      if (['1','2','3','4'].includes(e.key)) {
        const btn = document.querySelector(`#quizOpts [data-i="${Number(e.key) - 1}"]`);
        if (btn) { e.preventDefault(); btn.click(); }
      } else if (e.key === 'Enter') {
        const n = document.getElementById('quizNext') || document.querySelector('#quizFeedback .btn-primary');
        if (n) { e.preventDefault(); n.click(); }
      } else if (e.key === 'Escape') {
        e.preventDefault(); stop();
      }
    };
    document.addEventListener('keydown', keyHandler);
  }
  function unbindKeys() {
    if (keyHandler) document.removeEventListener('keydown', keyHandler);
    keyHandler = null;
  }

  return { start, stop, release, get active() { return state !== null; } };
})();
