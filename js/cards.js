/* ============================================================
   cards.js — колода, сборка карточек и тренажёр активного вспоминания
   ============================================================ */
const Cards = (() => {
  let all = [], byId = {};
  let session = null;   // {queue, idx, revealed, results, config}
  let keyHandler = null;

  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /* ---------------- сборка колоды из учебных данных ---------------- */
  function build() {
    const list = [];
    const add = o => { o.id = o.id || ('c' + list.length); list.push(o); };

    DATES.forEach(d => {
      add({ id: d.id + '_a', src: d.id, topic: d.t, type: 'date2event', typeLabel: 'ДАТА → СОБЫТИЕ',
        frontLabel: 'ДАТА', front: d.y, frontDate: true, prompt: 'Что произошло?',
        backLabel: 'ОТВЕТ', back: d.title, why: d.why, key: d.y });
      add({ id: d.id + '_b', src: d.id, topic: d.t, type: 'event2date', typeLabel: 'СОБЫТИЕ → ДАТА',
        frontLabel: 'СОБЫТИЕ', front: d.title, prompt: 'Когда это было?',
        backLabel: 'КОГДА?', back: d.y, why: d.why, key: d.title });
    });

    PERSONS.forEach(p => {
      add({ id: p.id + '_role', src: p.id, topic: p.t, type: 'person', typeLabel: 'ПЕРСОНА → РОЛЬ',
        frontLabel: 'ПЕРСОНА', front: p.name, frontText: true, prompt: 'Кто это и что сделал?',
        backLabel: 'КТО ЭТО', back: p.role, why: p.facts.join(' '), key: p.name });
    });

    EVENTS.forEach(e => {
      add({ id: e.id + '_why', src: e.id, topic: e.t, type: 'eventWhy', typeLabel: 'СОБЫТИЕ → ЗНАЧЕНИЕ',
        frontLabel: 'СОБЫТИЕ', front: e.name, frontText: true, prompt: 'Почему это важно?',
        backLabel: 'ПОЧЕМУ ВАЖНО', back: e.significance, why: 'Ход: ' + e.course, key: e.name });
      add({ id: e.id + '_date', src: e.id, topic: e.t, type: 'event2date', typeLabel: 'СОБЫТИЕ → ДАТА',
        frontLabel: 'СОБЫТИЕ', front: e.name, frontText: true, prompt: 'Назови дату.',
        backLabel: 'ДАТА', back: e.year, why: e.significance, key: e.year });
    });

    CAUSES.forEach(c => {
      add({ id: c.id + '_x', src: c.id, topic: c.t, type: 'cause', typeLabel: 'ПРИЧИНА → СЛЕДСТВИЕ',
        frontLabel: 'ПРИЧИНА / ВОПРОС', front: c.q, frontText: true, prompt: 'Попробуй объяснить вслух.',
        backLabel: 'ОТВЕТ', back: c.a, why: '', key: c.q });
    });

    ORAL.forEach(o => {
      add({ id: o.id + '_o', src: o.id, topic: o.t, type: 'oral', typeLabel: 'УСТНЫЙ ВОПРОС',
        frontLabel: 'ВОПРОС КОМИССИИ', front: o.q, frontText: true, prompt: 'Ответь голосом, затем проверь.',
        backLabel: 'ЭТАЛОННЫЙ ОТВЕТ', back: o.answer, why: 'Обязательно упомянуть: ' + o.must.join(' • '), key: o.q });
    });

    COMPARISONS.forEach(cp => {
      add({ id: cp.id + '_m', src: cp.id, topic: cp.t, type: 'comparison', typeLabel: 'СРАВНЕНИЕ',
        frontLabel: 'СРАВНИ', front: cp.q, frontText: true, prompt: 'Назови различия и сходства.',
        backLabel: 'СРАВНЕНИЕ', back: cp.title, cmp: cp, why: '', key: cp.title });
    });

    all = list;
    byId = {};
    all.forEach(c => { byId[c.id] = c; });
    return all;
  }

  const topicName = id => (TOPICS.find(t => t.id === id) || {}).short || '';

  /* ---------------- формирование очереди ---------------- */
  function makeQueue(config) {
    const now = Date.now();
    let ids = [];
    const limit = config.limit || 40;

    if (config.mode === 'review') {
      ids = Progress.dueCards(now).slice(0, limit);
    } else if (config.mode === 'new') {
      ids = Progress.newCards(limit);
    } else if (config.mode === 'redzone') {
      ids = Progress.weakCards().slice(0, limit);
    } else if (config.mode === 'topic') {
      const pool = Progress.topicCards(config.topicId);
      const due = pool.filter(c => {
        const s = Store.state.cards[c.id];
        return s && s.next > 0 && s.next <= now;
      }).map(c => c.id);
      const fresh = pool.filter(c => !Store.state.cards[c.id]).map(c => c.id);
      ids = due.concat(fresh).slice(0, limit);
    } else { // mixed
      const due = Progress.dueCards(now);
      const fresh = Progress.newCards(limit);
      ids = due.concat(fresh).slice(0, limit);
      ids.sort(() => Math.random() - 0.5);
    }
    return ids;
  }

  const MODE_TITLE = {
    review: 'ПОВТОРЕНИЕ', new: 'НОВЫЕ КАРТОЧКИ', redzone: 'RED ZONE',
    topic: 'ТРЕНИРОВКА ПО ТЕМЕ', mixed: 'СМЕШАННАЯ ТРЕНИРОВКА'
  };

  /* ---------------- запуск сессии ---------------- */
  function release() {
    session = null;
    unbindKeys();
  }

  function start(config) {
    config = config || { mode: 'mixed' };
    if (typeof Quiz !== 'undefined' && Quiz.active) Quiz.release();
    const queue = makeQueue(config);
    document.getElementById('cardsIdle').hidden = true;
    document.getElementById('cardsStage').hidden = false;

    if (!queue.length) {
      session = { queue: [], idx: 0, config, results: [] };
      renderEmpty(config);
      return;
    }
    session = { queue, idx: 0, revealed: false, config, results: [] };
    Store.state.lastSession = { mode: config.mode, topicId: config.topicId || null };
    Store.save();
    renderCard();
    bindKeys();
  }

  function renderEmpty(config) {
    const stage = document.getElementById('cardsStage');
    const msg = config.mode === 'redzone'
      ? 'RED ZONE пуста. Отличная работа — но проверь раздел ещё раз после тренировок.'
      : config.mode === 'review'
        ? 'Сейчас нет карточек к повторению. Пройди новые карточки или загляни позже.'
        : 'Карточки в этой категории закончились.';
    stage.innerHTML = `
      <div class="stage-done">
        <div class="sd-title">ПУСТО</div>
        <p class="page-sub" style="margin:14px auto 0">${esc(msg)}</p>
        <div class="sd-actions" style="margin-top:26px">
          <button class="btn btn-primary" id="emptyMixed">СМЕШАННЫЕ КАРТОЧКИ</button>
          <button class="btn btn-ghost" id="emptyBack">ВЫЙТИ</button>
        </div>
      </div>`;
    stage.querySelector('#emptyMixed').onclick = () => start({ mode: 'mixed' });
    stage.querySelector('#emptyBack').onclick = showIdle;
  }

  /* ---------------- отрисовка ---------------- */
  function renderCard() {
    const s = session;
    if (!s || s.idx >= s.queue.length) return finish();
    const card = byId[s.queue[s.idx]];
    if (!card) { s.idx++; return renderCard(); }
    s.revealed = false;
    const stage = document.getElementById('cardsStage');
    const total = s.queue.length, n = s.idx + 1;
    const pct = Math.round((s.idx / total) * 100);
    const modeTitle = MODE_TITLE[s.config.mode] || 'КАРТОЧКИ';
    const topic = card.topic ? topicName(card.topic) : '';

    stage.innerHTML = `
      <div class="stage-top">
        <button class="btn btn-ghost" id="cardExit">← ВЫЙТИ</button>
        <div class="stage-meta">
          <span>${esc(modeTitle)}${topic ? ' · ' + esc(topic) : ''}</span>
          <span>${n} / ${total}</span>
          <span>🔥 ${Store.state.streak}</span>
        </div>
      </div>
      <div class="bar bar-sm stage-progress"><i style="width:${pct}%"></i></div>

      <div class="flip-card" id="flipCard" role="button" tabindex="0"
           aria-label="Карточка. Нажми, чтобы показать ответ">
        <div class="flip-inner">
          <div class="face front">
            <div class="face-type">
              <span class="badge">${esc(card.typeLabel)}</span>
              <span class="badge">STATUS: ${esc(Progress.STATUS_LABEL[statStatus(card.id)])}</span>
            </div>
            <div class="face-label" style="margin-top:18px">${esc(card.frontLabel)}</div>
            <div class="face-q ${card.frontDate ? '' : 'text'}">${esc(card.front)}</div>
            <div class="face-prompt">${esc(card.prompt || '')}</div>
          </div>
          <div class="face back">
            <div class="face-type"><span class="badge b-know">${esc(card.backLabel)}</span></div>
            ${card.cmp ? cmpHtml(card.cmp) : `
              <div class="back-answer ${card.type === 'cause' || card.type === 'oral' || card.type === 'eventWhy' ? 'text' : ''}">${esc(card.back)}</div>
              ${card.why ? `<div class="why-box">
                <div class="wb-l">${card.type === 'oral' ? 'ЧТО ОБЯЗАТЕЛЬНО УПОМЯНУТЬ' : 'ПОЧЕМУ ЭТО ВАЖНО'}</div>
                <div class="wb-t">${esc(card.why)}</div>
              </div>` : ''}
            `}
          </div>
        </div>
      </div>

      <div id="actionZone">
        <button class="btn btn-primary btn-lg btn-block" id="revealBtn" style="max-width:640px;margin-top:20px">ПОКАЗАТЬ ОТВЕТ</button>
        <div class="reveal-hint">ПРОБЕЛ — ПОКАЗАТЬ ОТВЕТ</div>
      </div>`;

    stage.querySelector('#cardExit').onclick = showIdle;
    stage.querySelector('#flipCard').onclick = reveal;
    stage.querySelector('#flipCard').onkeydown = e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); reveal(); }
    };
    stage.querySelector('#revealBtn').onclick = e => { e.stopPropagation(); reveal(); };
    addSwipe(stage.querySelector('#flipCard'));
  }

  function statStatus(id) {
    const c = Store.state.cards[id];
    return c ? c.status : 'none';
  }

  function cmpHtml(cp) {
    const li = a => a.map(x => `<li>${esc(x)}</li>`).join('');
    return `<div class="back-answer text" style="font-size:22px">${esc(cp.title)}</div>
      <div class="ev-grid" style="margin-top:16px">
        <div class="ev-cell"><div class="ec-l">${esc(cp.title.split(' vs ')[0] || 'A')}</div>
          <ul class="key-points">${li(cp.a)}</ul></div>
        <div class="ev-cell"><div class="ec-l">${esc(cp.title.split(' vs ')[1] || 'B')}</div>
          <ul class="key-points">${li(cp.b)}</ul></div>
      </div>`;
  }

  function reveal() {
    if (!session || session.revealed) return;
    session.revealed = true;
    const cardEl = document.getElementById('flipCard');
    if (cardEl) cardEl.classList.add('revealed');

    const zone = document.getElementById('actionZone');
    if (!zone) return;
    zone.innerHTML = `
      <div class="rate-block">
        <div class="rate-q">НАСКОЛЬКО ХОРОШО ТЫ ЭТО ВСПОМНИЛ?</div>
        <div class="rate-grid">
          ${Progress.RATING.map((r, i) => `
            <button class="rate-btn r${i}" data-rate="${i}">
              <span class="rb-ico">${r.ico}</span>${r.label}
            </button>`).join('')}
        </div>
        <div class="kbd-help"><span class="kbd">1</span>–<span class="kbd">4</span> — оценка · <span class="kbd">Enter</span> — далее · <span class="kbd">Esc</span> — выход</div>
      </div>`;
    zone.querySelectorAll('[data-rate]').forEach(btn => {
      btn.onclick = e => { e.stopPropagation(); rate(Number(btn.dataset.rate)); };
    });
    const card = byId[session.queue[session.idx]];
    if (card && card.cmp) { /* сравнение читается колонками */ }
  }

  function rate(r) {
    if (!session || !session.revealed) return;
    const cardId = session.queue[session.idx];
    const card = byId[cardId];
    Progress.rateCard(cardId, r);
    session.results.push({ id: cardId, r, topic: card ? card.topic : null });

    const cardEl = document.getElementById('flipCard');
    if (cardEl) {
      cardEl.classList.add(r === 0 ? 'flash-bad' : 'flash-ok');
    }
    setTimeout(() => {
      session.idx++;
      renderCard();
      if (typeof App !== 'undefined' && App.refreshChrome) App.refreshChrome();
    }, 340);
  }

  function finish() {
    const s = session;
    const total = s.results.length;
    const good = s.results.filter(x => x.r >= 1).length;
    const hard = s.results.filter(x => x.r === 0).length;
    const acc = total ? Math.round(good / total * 100) : 0;
    const weakTopics = {};
    s.results.filter(x => x.r === 0).forEach(x => {
      if (x.topic) weakTopics[x.topic] = (weakTopics[x.topic] || 0) + 1;
    });
    const gaps = Object.keys(weakTopics)
      .sort((a, b) => weakTopics[b] - weakTopics[a])
      .map(t => topicName(t));

    const stage = document.getElementById('cardsStage');
    stage.innerHTML = `
      <div class="stage-done">
        <div class="sd-title">ТРЕНИРОВКА ЗАВЕРШЕНА</div>
        <div class="sd-stats">
          <div><span>КАРТОЧЕК</span><b>${total}</b></div>
          <div><span>ВСПОМНИЛ</span><b>${good}</b></div>
          <div><span>ПРОВАЛИЛ</span><b>${hard}</b></div>
          <div><span>ТОЧНОСТЬ</span><b>${acc}%</b></div>
        </div>
        ${gaps.length ? `<p class="page-sub" style="margin:0 auto">Основные пробелы: ${esc(gaps.join(', '))}</p>` : ''}
        <div class="sd-actions" style="margin-top:26px">
          <button class="btn btn-primary" id="againBtn">ЕЩЁ РАЗ</button>
          <button class="btn btn-ghost" id="toCommBtn">МЕДЛЕННО К КОМИССИИ →</button>
          <button class="btn btn-ghost" id="doneBack">В ОБЗОР</button>
        </div>
        <div class="kbd-help"><span class="kbd">Enter</span> — повторить</div>
      </div>`;
    stage.querySelector('#againBtn').onclick = restartSame;
    stage.querySelector('#toCommBtn').onclick = () => Nav.go('commission');
    stage.querySelector('#doneBack').onclick = () => Nav.go('dashboard');
    bindKeys();
    if (typeof App !== 'undefined' && App.refreshChrome) App.refreshChrome();
  }

  /* Повтор той же выборки (после завершения) */
  function restartSame() {
    if (!session) return;
    const cfg = session.config, queue = session.queue;
    document.getElementById('cardsIdle').hidden = true;
    document.getElementById('cardsStage').hidden = false;
    session = { queue, idx: 0, revealed: false, config: cfg, results: [] };
    renderCard();
    bindKeys();
  }

  /* ---------------- idle ---------------- */
  function showIdle() {
    session = null;
    unbindKeys();
    document.getElementById('cardsStage').hidden = true;
    document.getElementById('cardsStage').innerHTML = '';
    document.getElementById('cardsIdle').hidden = false;
    renderIdle();
    if (typeof App !== 'undefined' && App.refreshChrome) App.refreshChrome();
  }

  function renderIdle() {
    const due = Progress.dueCards().length;
    const fresh = Progress.newCards().length;
    const weak = Progress.weakCards().length;
    const actions = document.getElementById('idleActions');

    actions.innerHTML = `
      <button class="idle-card" data-mode="mixed">
        <div class="ic-t">🔥 СМЕШАННЫЕ КАРТОЧКИ</div>
        <div class="ic-s">Повторения + новые карточки вперемешку</div>
        <div class="ic-n">${due + fresh}</div>
      </button>
      <button class="idle-card" data-mode="review">
        <div class="ic-t">◷ ПОВТОРЕНИЕ</div>
        <div class="ic-s">Только то, что пора вспомнить сейчас</div>
        <div class="ic-n">${due}</div>
      </button>
      <button class="idle-card" data-mode="new">
        <div class="ic-t">▣ НОВЫЕ КАРТОЧКИ</div>
        <div class="ic-s">Ни разу не встреченные карточки</div>
        <div class="ic-n">${fresh}</div>
      </button>
      <button class="idle-card" data-mode="redzone">
        <div class="ic-t">🔴 RED ZONE</div>
        <div class="ic-s">Карточки, которые ты стабильно ломаешь</div>
        <div class="ic-n">${weak}</div>
      </button>`;
    actions.querySelectorAll('[data-mode]').forEach(b => {
      b.onclick = () => start({ mode: b.dataset.mode, limit: b.dataset.mode === 'redzone' ? 25 : 40 });
    });

    const topics = document.getElementById('idleTopics');
    topics.innerHTML = TOPICS.map(t => {
      const s = Progress.topicStats(t.id);
      return `<button class="idle-topic" data-topic="${t.id}">
        <div class="it-t">${esc(t.short)}</div>
        <div class="it-s">${s.seen} / ${s.total} карточек · ${s.percent}%</div>
      </button>`;
    }).join('');
    topics.querySelectorAll('[data-topic]').forEach(b => {
      b.onclick = () => start({ mode: 'topic', topicId: b.dataset.topic, limit: 40 });
    });
  }

  /* ---------------- клавиатура ---------------- */
  function bindKeys() {
    unbindKeys();
    keyHandler = e => {
      if (!session) return;
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      if (document.getElementById('page-cards').classList.contains('is-active') === false) return;

      if (e.code === 'Space') { e.preventDefault(); if (!session.revealed) reveal(); return; }
      if (['1','2','3','4'].includes(e.key)) {
        const idx = Number(e.key) - 1;
        if (session.revealed) { e.preventDefault(); rate(idx); }
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (session.queue.length && session.idx >= session.queue.length) start(session.config);
        else if (!session.revealed) reveal();
        return;
      }
      if (e.key === 'Escape') { e.preventDefault(); showIdle(); }
    };
    document.addEventListener('keydown', keyHandler);
  }
  function unbindKeys() {
    if (keyHandler) document.removeEventListener('keydown', keyHandler);
    keyHandler = null;
  }

  /* свайп вверх — показать ответ (удобно с телефона) */
  function addSwipe(el) {
    if (!el) return;
    let y0 = null;
    el.addEventListener('touchstart', e => { y0 = e.touches[0].clientY; }, { passive: true });
    el.addEventListener('touchend', e => {
      if (y0 === null) return;
      const dy = y0 - e.changedTouches[0].clientY;
      if (dy > 55) reveal();
      y0 = null;
    }, { passive: true });
  }

  /* Случайная карточка по источнику (для кнопок «проверить себя») */
  function cardsFor(srcId) { return all.filter(c => c.src === srcId); }

  function practice(srcId) {
    const ids = cardsFor(srcId).map(c => c.id);
    if (!ids.length) return false;
    if (typeof Quiz !== 'undefined' && Quiz.active) Quiz.release();
    Nav.go('cards');
    document.getElementById('cardsIdle').hidden = true;
    document.getElementById('cardsStage').hidden = false;
    session = { queue: ids, idx: 0, revealed: false, config: { mode: 'mixed' }, results: [] };
    renderCard();
    bindKeys();
    return true;
  }

  return {
    get all() { return all; },
    get byId() { return byId; },
    get session() { return session; },
    build, start, showIdle, renderIdle, practice, cardsFor, release
  };
})();
