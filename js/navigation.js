/* ============================================================
   navigation.js — роутинг страниц, глобальный поиск, модалки
   ============================================================ */
const Nav = (() => {
  const PAGE_IDS = ['dashboard','cards','review','topics','topic','textbook','chapter','dates','persons','events','commission','pomodoro','progress'];
  let current = 'dashboard';

  /* ---------------- модалки ---------------- */
  function openModal(html) {
    const bd = document.getElementById('modalBackdrop');
    document.getElementById('modalBox').innerHTML =
      `<button class="modal-close" id="modalClose" aria-label="Закрыть">✕</button>` + html;
    bd.hidden = false;
    document.body.style.overflow = 'hidden';
    document.getElementById('modalClose').onclick = closeModal;
    bd.onclick = e => { if (e.target === bd) closeModal(); };
    const first = document.querySelector('#modalBox .btn');
    if (first) first.focus();
  }
  function closeModal() {
    document.getElementById('modalBackdrop').hidden = true;
    document.body.style.overflow = '';
  }
  function modalOpen() { return !document.getElementById('modalBackdrop').hidden; }

  /* ---------------- маршрутизация ---------------- */
  function go(page, opts) {
    if (!PAGE_IDS.includes(page)) page = 'dashboard';
    if (page === current && !(opts && opts.force)) { renderHook(page); return; }

    if (current === 'commission' && page !== 'commission') Commission.destroy();
    current = page;

    PAGE_IDS.forEach(p => {
      const el = document.getElementById('page-' + p);
      if (el) el.classList.toggle('is-active', p === page);
    });

    const navPage = page === 'topic' ? 'topics'
      : (page === 'chapter' ? 'textbook' : page);
    document.querySelectorAll('.nav-item').forEach(b =>
      b.classList.toggle('is-active', b.dataset.page === navPage));
    document.querySelectorAll('.bnav-item').forEach(b =>
      b.classList.toggle('is-active', b.dataset.page === navPage));

    closeSearch();
    renderHook(page);
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
    const wrap = document.getElementById('pageWrap');
    if (wrap) wrap.focus({ preventScroll: true });
  }

  function renderHook(page) {
    if (typeof App === 'undefined') return;
    switch (page) {
      case 'dashboard': App.renderDashboard(); break;
      case 'review': App.renderReview(); break;
      case 'topics': App.renderTopics(); break;
      case 'topic': App.renderTopic(App.currentTopic); break;
      case 'textbook': App.renderTextbook(); break;
      case 'chapter': App.renderChapter(App.currentChapter); break;
      case 'dates': App.renderDates(); break;
      case 'persons': App.renderPersons(); break;
      case 'events': App.renderEvents(); break;
      case 'commission': if (!Commission.session) Commission.renderSetup(); break;
      case 'pomodoro': if (typeof Pomodoro !== 'undefined') Pomodoro.render(); break;
      case 'progress': App.renderProgress(); break;
      case 'cards':
        if (!Cards.session && !(typeof Quiz !== 'undefined' && Quiz.active)) Cards.renderIdle();
        break;
    }
  }

  /* ---------------- поиск ---------------- */
  let searchTimer = null;

  function buildResults(query) {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return null;
    const has = s => String(s || '').toLowerCase().includes(q);
    const groups = [];

    const dates = DATES.filter(d => has(d.title) || has(d.y)).slice(0, 6);
    if (dates.length) groups.push({ label: 'ДАТЫ', items: dates.map(d => ({
      k: d.y, t: d.title, s: d.why, go: () => { go('dates'); setTimeout(() => {
        const el = document.getElementById('date-' + d.id);
        if (el) {
          if (el.scrollIntoView) el.scrollIntoView({ behavior:'smooth', block:'center' });
          el.style.borderColor = 'rgba(216,90,90,.8)';
        }
      }, 120); }
    }))});

    const persons = PERSONS.filter(p => has(p.name) || has(p.role) || has(p.years)).slice(0, 6);
    if (persons.length) groups.push({ label: 'ПЕРСОНЫ', items: persons.map(p => ({
      k: '', t: p.name, s: p.role, go: () => App.openPerson(p.id)
    }))});

    const events = EVENTS.filter(e => has(e.name) || has(e.year) || has(e.significance)).slice(0, 6);
    if (events.length) groups.push({ label: 'СОБЫТИЯ', items: events.map(e => ({
      k: e.year, t: e.name, s: e.significance, go: () => App.openEvent(e.id)
    }))});

    const topics = TOPICS.filter(t => has(t.name) || has(t.short) || has(t.desc)).slice(0, 4);
    if (topics.length) groups.push({ label: 'ТЕМЫ', items: topics.map(t => ({
      k: t.n, t: t.name, s: t.desc, go: () => App.openTopic(t.id)
    }))});

    if (typeof TEXTBOOK !== 'undefined') {
      const tbk = TOPICS.filter(t => TEXTBOOK[t.id] &&
        (has(t.name) || has(t.short) || has(TEXTBOOK[t.id].intro))).slice(0, 4);
      if (tbk.length) groups.push({ label: 'ПОДРОБНАЯ ИСТОРИЯ', items: tbk.map(t => ({
        k: t.n, t: t.name, s: TEXTBOOK[t.id].intro, go: () => App.openChapter(t.id)
      }))});
    }

    const oral = ORAL.filter(o => has(o.q)).slice(0, 4);
    if (oral.length) groups.push({ label: 'УСТНЫЕ ВОПРОСЫ', items: oral.map(o => ({
      k: 'устн.', t: o.q, s: o.answer, go: () => App.openQuestion('УСТНЫЙ ВОПРОС', o.q, o.answer, o.must, o.id)
    }))});

    const comm = COMMISSION.filter(c => has(c.q) || has(c.type)).slice(0, 4);
    if (comm.length) groups.push({ label: 'ВОПРОСЫ КОМИССИИ', items: comm.map(c => ({
      k: 'ком.', t: c.q, s: c.answer, go: () => App.openQuestion(c.type, c.q, c.answer, c.must, c.ref)
    }))});

    return groups;
  }

  function renderSearch(query) {
    const box = document.getElementById('searchResults');
    const input = document.getElementById('searchInput');
    const groups = buildResults(query);
    if (groups === null) { closeSearch(); return; }
    if (!groups.length) {
      box.innerHTML = `<div class="sr-empty">Ничего не найдено по запросу «${query}».</div>`;
    } else {
      box.innerHTML = groups.map((g, gi) => `
        <div class="sr-group">${g.label}</div>
        ${g.items.map((it, ii) => `
          <button class="sr-item" data-g="${gi}" data-i="${ii}">
            <span class="sr-k">${it.k}</span>
            <span class="sr-t">${esc(it.t)}</span>
            <span class="sr-s">${esc(it.s)}</span>
          </button>`).join('')}`).join('');
      box.querySelectorAll('.sr-item').forEach(btn => {
        btn.onclick = () => {
          const it = groups[Number(btn.dataset.g)].items[Number(btn.dataset.i)];
          closeSearch();
          input.blur();
          it.go();
        };
      });
    }
    box.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }

  function closeSearch() {
    const box = document.getElementById('searchResults');
    if (box) box.hidden = true;
    const input = document.getElementById('searchInput');
    if (input) input.setAttribute('aria-expanded', 'false');
  }

  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /* ---------------- инициализация ---------------- */
  function init() {
    document.querySelectorAll('.nav-item').forEach(b => {
      b.onclick = () => go(b.dataset.page);
    });
    document.querySelectorAll('.bnav-item[data-page]').forEach(b => {
      b.onclick = () => go(b.dataset.page);
    });
    const more = document.getElementById('moreBtn');
    if (more) more.onclick = openMore;

    const input = document.getElementById('searchInput');
    input.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => renderSearch(input.value), 140);
    });
    input.addEventListener('focus', () => { if (input.value.trim().length >= 2) renderSearch(input.value); });
    document.addEventListener('click', e => {
      if (!e.target.closest('.search-wrap')) closeSearch();
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && modalOpen()) { closeModal(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault(); input.focus(); input.select();
      }
      if (e.key === '/' && document.activeElement !== input &&
          !['INPUT','TEXTAREA'].includes((document.activeElement.tagName || ''))) {
        e.preventDefault(); input.focus();
      }
    });

    document.getElementById('settingsBtn').onclick = App.openSettings;
  }

  function openMore() {
    const items = [
      ['topics','◈ Темы'], ['textbook','📖 Подробная история'], ['dates','◉ Даты'], ['persons','♙ Персоны'],
      ['events','⚔ События'], ['pomodoro','⏱ Помодоро'], ['progress','▥ Прогресс']
    ];
    openModal(`
      <div class="m-title" id="modalTitle">РАЗДЕЛЫ</div>
      <div class="m-actions" style="flex-direction:column;align-items:stretch;gap:10px">
        ${items.map(([id, label]) => `<button class="btn btn-ghost btn-block" data-go="${id}">${label}</button>`).join('')}
        <button class="btn btn-ghost btn-block" id="moreSettings">⚙ Настройки</button>
      </div>`);
    document.querySelectorAll('#modalBox [data-go]').forEach(b => {
      b.onclick = () => { closeModal(); go(b.dataset.go); };
    });
    document.getElementById('moreSettings').onclick = () => { closeModal(); App.openSettings(); };
  }

  return { go, init, openModal, closeModal, modalOpen, get current() { return current; } };
})();
