/* ============================================================
   app.js — dashboard, разделы, модалки, инициализация
   ============================================================ */
const App = (() => {
  let currentTopic = null;
  let currentChapter = null;
  let dateFilter = 'all';

  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const $ = id => document.getElementById(id);

  const pad = n => String(n).padStart(2, '0');
  const plural = (n, a) => {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return a[0];
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return a[1];
    return a[2];
  };

  function relTime(ts) {
    if (!ts) return 'не было';
    const diff = Date.now() - ts;
    if (diff < 60000) return 'только что';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' мин назад';
    if (diff < 86400000) return Math.floor(diff / 3600000) + ' ч назад';
    return Math.floor(diff / 86400000) + ' дн назад';
  }

  /* ================================================================
     DASHBOARD
     ================================================================ */
  function renderDashboard() {
    const cd = Progress.countdown();
    const o = Progress.overall();
    const day = Store.state.day;

    $('dashCountdown').innerHTML = cd.days > 0
      ? `ДО КОМИССИИ: <b>${pad(cd.days)} ${plural(cd.days, ['ДЕНЬ','ДНЯ','ДНЕЙ'])}</b> ${pad(cd.hours)} ЧАС${plural(cd.hours, ['','А','ОВ'])}`
      : `ДО КОМИССИИ: <b>${cd.hours > 0 ? pad(cd.hours) + ' ЧАС.' : 'СЕГОДНЯ'}</b>`;

    $('dashPrepared').textContent = o.percent + '%';
    $('dashBar').style.width = o.percent + '%';
    $('dashBarWrap').setAttribute('aria-valuenow', o.percent);

    renderCta();
    renderToday(day, o);
    renderMission();
    renderRedZone();
    renderQuick();
  }

  /* Рекомендованный следующий блок */
  function chooseTopic() {
    const last = Store.state.lastSession;
    if (last && last.topicId && TOPICS.some(t => t.id === last.topicId)) {
      const s = Progress.topicStats(last.topicId);
      if (s.percent < 95) return last.topicId;
    }
    const weak = TOPICS.map(t => ({ id: t.id, p: Progress.topicStats(t.id).percent }))
      .filter(t => t.p < 95);
    if (!weak.length) return TOPICS[0].id;
    // приоритет — первая непройденная по порядку курса
    return weak[0].id;
  }

  function renderCta() {
    const topicId = chooseTopic();
    const topic = TOPICS.find(t => t.id === topicId) || TOPICS[0];
    const s = Progress.topicStats(topic.id);
    $('ctaTopic').textContent = topic.name;
    $('ctaSub').textContent = `Карточки: ${s.seen} / ${s.total} · освоено ${s.percent}%`;
    $('ctaContinue').dataset.topic = topic.id;
  }

  function renderToday(day, o) {
    const acc = Progress.todayAccuracy();
    const box = $('todayStats');
    if (!day) { box.innerHTML = ''; return; }
    box.innerHTML = `
      <div class="ts-row"><span class="ts-ico">▣</span><b>${day.reviews}</b> карточек пройдено сегодня</div>
      <div class="ts-row"><span class="ts-ico" style="color:var(--accent2)">✕</span><b>${day.wrong}</b> ${plural(day.wrong, ['ошибка','ошибки','ошибок'])}</div>
      <div class="ts-row"><span class="ts-ico" style="color:var(--ok)">✓</span><b>${day.correct}</b> ${plural(day.correct, ['правильный','правильных','правильных'])}</div>
      <div class="ts-row"><span class="ts-ico" style="color:var(--warn)">⏱</span><b>${Math.round((day.focus || 0) / 60)}</b> мин фокуса · <b>${day.pomodoros || 0}</b> ${plural(day.pomodoros || 0, ['помодоро','помодоро','помодоро'])}</div>
      <div class="ts-row"><span class="ts-ico" style="color:var(--warn)">◷</span><b>${o.due}</b> к повторению сейчас · <b>${o.fresh}</b> новых</div>
      <div class="ts-meta">
        <div><span>ТОЧНОСТЬ</span><b>${acc}%</b></div>
        <div><span>СЕРИЯ</span><b>${Store.state.streak}</b></div>
        <div><span>ЛУЧШАЯ СЕРИЯ</span><b>${Store.state.bestStreak}</b></div>
      </div>`;
  }

  function renderMission() {
    const m = Progress.mission();
    $('missionList').innerHTML = m.map(x => `
      <div class="mission-item ${x.done ? 'done' : ''}">
        <span class="m-box">${x.done ? '✓' : ''}</span>
        <span>${esc(x.text)}</span>
        <span class="m-count">${Math.min(x.cur, x.target)} / ${x.target}</span>
      </div>`).join('');
    const pct = Progress.missionPercent();
    $('missionBar').style.width = pct + '%';
    $('missionBarWrap').setAttribute('aria-valuenow', pct);
    $('missionPct').textContent = pct + '%';
  }

  function cardLabel(card) {
    if (!card) return '—';
    if (card.frontDate) return card.front + ' — ' + card.back;
    if (card.type === 'cause' || card.type === 'oral') return card.front;
    return card.front + ' → ' + (card.cmp ? card.cmp.title : card.back);
  }

  function renderRedZone() {
    const ids = Progress.weakCards().slice(0, 6);
    const box = $('redZoneList');
    if (!ids.length) {
      box.innerHTML = `<div class="red-empty">RED ZONE пуста: карточек с провалами нет. Продолжай тренировку — сюда попадают все твои ошибки.</div>`;
      $('redZoneBtn').textContent = 'RED ZONE ПУСТА';
      $('redZoneBtn').disabled = true;
      $('redZoneBtn').onclick = null;
      return;
    }
    $('redZoneBtn').disabled = false;
    box.innerHTML = ids.map(id => {
      const card = Cards.byId[id];
      const s = Store.state.cards[id];
      if (!card) return '';
      return `<div class="red-item">
        <div class="red-main">
          <div class="red-key">${esc(cardLabel(card))}</div>
          <div class="red-meta">
            <span>✕ ошибок: ${s.errors}</span>
            <span>последняя попытка: ${esc(relTime(s.last))}</span>
            <span>статус: ${esc(Progress.STATUS_LABEL[s.status])}</span>
          </div>
        </div>
        <span class="badge b-${s.status}">${esc(Progress.STATUS_LABEL[s.status])}</span>
      </div>`;
    }).join('');
    $('redZoneBtn').textContent = 'УНИЧТОЖИТЬ RED ZONE';
    $('redZoneBtn').onclick = () => { Nav.go('cards'); Cards.start({ mode: 'redzone', limit: 25 }); };
  }

  function renderQuick() {
    const stats = {
      dates: DATES.length, persons: PERSONS.length, events: EVENTS.length, comm: COMMISSION.length,
      due: Progress.dueCards().length
    };
    $('quickGrid').innerHTML = `
      <button class="quick-btn" data-go="dates"><span class="q-ico">◉</span><span class="q-t">ДАТЫ</span><span class="q-s">${stats.dates} карточек в обе стороны</span></button>
      <button class="quick-btn" data-go="textbook"><span class="q-ico">📖</span><span class="q-t">УЧЕБНИК</span><span class="q-s">подробно по темам курса</span></button>
      <button class="quick-btn" data-go="persons"><span class="q-ico">♙</span><span class="q-t">ПЕРСОНЫ</span><span class="q-s">${stats.persons} деятелей</span></button>
      <button class="quick-btn" data-go="events"><span class="q-ico">⚔</span><span class="q-t">СОБЫТИЯ</span><span class="q-s">${stats.events} с причинами и ходом</span></button>
      <button class="quick-btn" data-go="commission"><span class="q-ico">🎤</span><span class="q-t">КОМИССИЯ</span><span class="q-s">${stats.comm} устных вопросов</span></button>
      <button class="quick-btn" data-go="pomodoro"><span class="q-ico">⏱</span><span class="q-t">ТАЙМЕР</span><span class="q-s">Помодоро: фокус и отдых</span></button>
      <button class="quick-btn" data-go="review"><span class="q-ico">◷</span><span class="q-t">ПОВТОРЕНИЕ</span><span class="q-s">${stats.due} ждут повторения</span></button>`;
    $('quickGrid').querySelectorAll('[data-go]').forEach(b => {
      b.onclick = () => Nav.go(b.dataset.go);
    });
  }

  /* главная CTA */
  function continuePreparation() {
    const topicId = $('ctaContinue').dataset.topic || chooseTopic();
    Nav.go('cards');
    Cards.start({ mode: 'topic', topicId, limit: 40 });
  }

  /* ================================================================
     ПОВТОРЕНИЕ
     ================================================================ */
  function renderReview() {
    const due = Progress.dueCards();
    const fresh = Progress.newCards();
    const weak = Progress.weakCards();
    const root = $('reviewRoot');

    root.innerHTML = `
      <div class="review-hero">
        <div class="rh-l">СЕЙЧАС НУЖНО ПОВТОРИТЬ</div>
        <div class="rh-n">${due.length}</div>
        <div class="rh-s">карточек по расписанию · новых в очереди: ${fresh.length} · в RED ZONE: ${weak.length}</div>
        <div class="m-actions">
          <button class="btn btn-primary btn-lg" id="startReview" ${due.length ? '' : 'disabled'}>НАЧАТЬ ПОВТОРЕНИЕ</button>
          <button class="btn btn-ghost btn-lg" id="startMixed">СМЕШАННЫЕ КАРТОЧКИ</button>
        </div>
      </div>

      <div class="panel">
        <h2 class="panel-title">ОЧЕРЕДЬ ПОВТОРЕНИЯ</h2>
        <div class="review-list">
          ${due.length ? due.slice(0, 14).map(id => {
            const card = Cards.byId[id];
            const s = Store.state.cards[id];
            if (!card) return '';
            const sec = Math.round((Date.now() - s.next) / 1000);
            const when = sec < 60 ? 'просрочено ' + sec + ' с' :
              sec < 3600 ? 'просрочено ' + Math.floor(sec / 60) + ' мин' :
              'просрочено ' + Math.floor(sec / 3600) + ' ч';
            return `<div class="review-row">
              <span class="rr-k">${esc(cardLabel(card))}</span>
              <span class="rr-t"><span class="badge b-${s.status}">${esc(Progress.STATUS_LABEL[s.status])}</span></span>
              <span class="rr-m">${esc(when)} · ошибок: ${s.errors}</span>
            </div>`;
          }).join('') : '<div class="red-empty">Очередь пуста — вернись чуть позже или пройди новые карточки.</div>'}
        </div>
      </div>

      <div class="panel">
        <h2 class="panel-title">ПОВТОРЕНИЕ НА ЗАВТРА</h2>
        <div class="review-list">
          ${upcoming().map(u => `<div class="review-row">
            <span class="rr-k">${u.label}</span>
            <span class="rr-t">${u.count} карточек</span>
          </div>`).join('') || '<div class="red-empty">Ничего не запланировано.</div>'}
        </div>
      </div>`;

    const sr = $('startReview');
    if (sr) sr.onclick = () => { Cards.start({ mode: 'review', limit: 40 }); };
    const sm = $('startMixed');
    if (sm) sm.onclick = () => { Cards.start({ mode: 'mixed', limit: 40 }); };
  }

  function upcoming() {
    const now = Date.now(), H = 3600000;
    const buckets = [
      { label: 'через 5–30 минут', min: now, max: now + H },
      { label: 'через несколько часов', min: now + H, max: now + 6 * H },
      { label: 'сегодня позже', min: now + 6 * H, max: startOfNextDay() },
      { label: 'завтра', min: startOfNextDay(), max: startOfNextDay() + 86400000 }
    ];
    const cards = Store.state.cards;
    return buckets.map(b => ({
      label: b.label,
      count: Object.keys(cards).filter(id => cards[id].next >= b.min && cards[id].next < b.max).length
    })).filter(b => b.count > 0);
  }
  function startOfNextDay() {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + 1); return d.getTime();
  }

  /* ================================================================
     ТЕМЫ
     ================================================================ */
  function renderTopics() {
    $('topicsList').innerHTML = TOPICS.map(t => {
      const s = Progress.topicStats(t.id);
      const status = s.percent >= 80 ? ['b-know', 'ОСВОЕНО'] :
                     s.percent >= 40 ? ['b-partial', 'В РАБОТЕ'] :
                     s.percent > 0 ? ['b-unknown', 'НАЧАТО'] : ['b-unknown', 'НЕ НАЧАТО'];
      return `<button class="topic-row" data-topic="${t.id}">
        <div>
          <div class="tr-num">ТЕМА ${t.n}</div>
          <div class="tr-name">${esc(t.name)}</div>
          <div class="tr-desc">${esc(t.desc)}</div>
          <div class="tr-bar">
            <div class="bar"><i style="width:${s.percent}%"></i></div>
            <span class="tr-pct">${s.percent}%</span>
          </div>
          <div class="tr-stats">
            <span class="badge ${status[0]}">${status[1]}</span>
            <span class="badge">${s.seen} / ${s.total} карточек</span>
          </div>
        </div>
        <div style="font-size:24px;color:var(--muted)">→</div>
      </button>`;
    }).join('');
    $('topicsList').querySelectorAll('[data-topic]').forEach(b => {
      b.onclick = () => openTopic(b.dataset.topic);
    });
  }

  function openTopic(id) {
    currentTopic = id;
    Nav.go('topic');
  }

  function renderTopic(id) {
    if (!id) { Nav.go('topics', { force: true }); return; }
    const t = TOPICS.find(x => x.id === id);
    if (!t) { Nav.go('topics', { force: true }); return; }
    const s = Progress.topicStats(t.id);
    const counts = {
      dates: DATES.filter(d => d.t === t.id).length,
      persons: PERSONS.filter(p => p.t === t.id).length,
      events: EVENTS.filter(e => e.t === t.id).length,
      causes: CAUSES.filter(c => c.t === t.id).length,
      oral: ORAL.filter(o => o.t === t.id).length
    };

    $('topicRoot').innerHTML = `
      <div class="topic-hero">
        <div class="tr-num" style="color:var(--accent2);letter-spacing:.2em;font-size:13px">ТЕМА ${t.n}</div>
        <h2>${esc(t.name)}</h2>
        <div class="th-p">${esc(t.desc)}</div>
        <div class="tr-bar" style="display:flex;align-items:center;gap:14px;margin-top:18px;max-width:560px">
          <div class="bar" style="flex:1"><i style="width:${s.percent}%"></i></div>
          <span class="tr-pct" style="font-family:Georgia,serif;font-size:26px">${s.percent}%</span>
        </div>
      </div>

      <div class="summary">
        <h3>КРАТКИЙ КОНСПЕКТ</h3>
        <ul>${t.summary.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
      </div>

      <div class="topic-counts">
        <div class="tcount"><div class="tc-n">${counts.dates}</div><div class="tc-l">Даты</div></div>
        <div class="tcount"><div class="tc-n">${counts.persons}</div><div class="tc-l">Персоны</div></div>
        <div class="tcount"><div class="tc-n">${counts.events}</div><div class="tc-l">События</div></div>
        <div class="tcount"><div class="tc-n">${counts.causes}</div><div class="tc-l">Причины и последствия</div></div>
        <div class="tcount"><div class="tc-n">${counts.oral}</div><div class="tc-l">Устные вопросы</div></div>
      </div>

      <div class="topic-actions">
        <button class="btn btn-primary btn-lg" id="topicTrain">▶ НАЧАТЬ ТРЕНИРОВКУ</button>
        <button class="btn btn-ghost btn-lg" id="topicQuiz">◈ МИНИ-ТЕСТ</button>
        <button class="btn btn-ghost btn-lg" id="topicComm">🎤 КОМИССИЯ</button>
      </div>`;

    $('topicTrain').onclick = () => { Nav.go('cards'); Cards.start({ mode: 'topic', topicId: t.id, limit: 40 }); };
    $('topicQuiz').onclick = () => Quiz.start({ topicId: t.id });
    $('topicComm').onclick = () => Nav.go('commission');
  }

  /* ================================================================
     ПОДРОБНАЯ ИСТОРИЯ (электронный учебник)
     ================================================================ */
  const TB_ORDER = () => TOPICS
    .filter(t => typeof TEXTBOOK !== 'undefined' && TEXTBOOK[t.id])
    .map(t => t.id);
  const fmt = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  const tbCount = s => String(s == null ? '' : s).split(/\s+/).filter(Boolean).length;

  function tbWords(ch) {
    let n = tbCount(ch.intro) +
      (ch.timeline || []).reduce((a, i) => a + tbCount(i.e), 0);
    (ch.sections || []).forEach(sec => {
      n += tbCount(sec.gist) + tbCount(sec.link);
      (sec.blocks || []).forEach(b => {
        if (b.t === 'p' || b.t === 'sub' || b.t === 'note' || b.t === 'important') n += tbCount(b.x);
        else if (b.t === 'qa' || b.t === 'who') n += tbCount(b.h) +
          [].concat(b.x || []).reduce((a, p) => a + tbCount(p), 0);
        else if (b.t === 'term') n += (b.items || []).reduce((a, i) => a + tbCount(i.w) + tbCount(i.d), 0);
        else if (b.t === 'timeline') n += (b.items || []).reduce((a, i) => a + tbCount(i.e), 0);
        else if (b.t === 'date') n += tbCount(b.name) +
          (b.parts
            ? b.parts.reduce((a, p) => a + tbCount(p.h) + [].concat(p.x || []).reduce((x, q) => x + tbCount(q), 0), 0)
            : [].concat(b.x || []).reduce((a, p) => a + tbCount(p), 0));
        else if (b.t === 'ul' || b.t === 'chain') n += (b.items || []).reduce((a, i) => a + tbCount(i), 0);
        else if (b.t === 'links') n += (b.items || []).reduce((a, i) => a + tbCount(i.l), 0);
      });
    });
    n += (ch.checklist || []).reduce((a, i) => a + tbCount(i), 0);
    n += (ch.summary || []).reduce((a, i) => a + tbCount(i), 0);
    return n;
  }

  function tbLinkCount(ch, kind) {
    let n = 0;
    (ch.sections || []).forEach(sec => (sec.blocks || []).forEach(b => {
      if (b.t === 'links') n += (b.items || []).filter(i => i.k === kind).length;
      if (kind === 'date' && b.t === 'date') n++;
    }));
    return n;
  }

  function tbStatus(id) {
    return (Store.state.textbook && Store.state.textbook[id]) || 'none';
  }
  function tbSetStatus(id, v) {
    if (!Store.state.textbook) Store.state.textbook = {};
    Store.state.textbook[id] = v;
    Store.save();
  }
  const TB_BADGE = st => st === 'done' ? ['b-know', '● ИЗУЧЕНО']
    : st === 'reading' ? ['b-partial', '◐ ЧИТАЮ']
    : ['b-unknown', '◯ НЕ НАЧАТО'];

  function renderTextbook() {
    const root = $('textbookList');
    if (!root) return;
    root.innerHTML = TB_ORDER().map(id => {
      const ch = TEXTBOOK[id];
      const t = TOPICS.find(x => x.id === id) || { n: '', name: id };
      const b = TB_BADGE(tbStatus(id));
      const min = Math.max(1, Math.round(tbWords(ch) / 160));
      return `<button class="topic-row tb-card" data-chapter="${id}">
        <div>
          <div class="tr-num">ТЕМА ${esc(t.n)}</div>
          <div class="tr-name">${esc(t.name)}</div>
          <div class="tr-desc">${esc(ch.intro)}</div>
          <div class="tr-stats">
            <span class="badge ${b[0]}">${b[1]}</span>
            <span class="badge">⏱ ~${min} мин чтения</span>
            <span class="badge">${(ch.sections || []).length} разделов</span>
            <span class="badge">${tbLinkCount(ch, 'date')} дат</span>
            <span class="badge">${tbLinkCount(ch, 'person')} персон</span>
          </div>
        </div>
        <div style="font-size:20px;letter-spacing:.1em;color:var(--muted);white-space:nowrap">ОТКРЫТЬ →</div>
      </button>`;
    }).join('') || '<div class="red-empty">Раздел ещё готовится.</div>';
    root.querySelectorAll('[data-chapter]').forEach(el => {
      el.onclick = () => openChapter(el.dataset.chapter);
    });
  }

  function openChapter(id) {
    if (typeof TEXTBOOK === 'undefined' || !TEXTBOOK[id]) return;
    currentChapter = id;
    Nav.go('chapter');
  }

  function tbRenderBlocks(blocks) {
    return (blocks || []).map(b => {
      if (b.t === 'p') return `<p class="tb-p">${fmt(b.x)}</p>`;
      if (b.t === 'sub') return `<h4 class="tb-sub">${fmt(b.x)}</h4>`;
      if (b.t === 'ul') return `<ul class="tb-ul">${(b.items || []).map(i => `<li>${fmt(i)}</li>`).join('')}</ul>`;
      if (b.t === 'note') return `<div class="tb-note">${fmt(b.x)}</div>`;
      if (b.t === 'qa') return `<div class="tb-qa"><div class="tb-qa-h">${esc(b.h)}</div>${
        [].concat(b.x || []).map(p => `<p class="tb-p">${fmt(p)}</p>`).join('')}</div>`;
      if (b.t === 'who') return `<div class="tb-who"><div class="tb-who-h">👤 ${esc(b.h || 'КТО ЭТО')}</div>${
        [].concat(b.x || []).map(p => `<p class="tb-p">${fmt(p)}</p>`).join('')}</div>`;
      if (b.t === 'important') return `<div class="tb-important"><span class="tb-imp-ico" aria-hidden="true">💡</span>
          <div class="tb-imp-body"><div class="tb-imp-h">ПОЧЕМУ ЭТО ВАЖНО</div><p>${fmt(b.x)}</p></div></div>`;
      if (b.t === 'term') return `<div class="tb-terms"><div class="tb-terms-h">📖 ЗНАЧЕНИЯ ТЕРМИНОВ</div>${
        (b.items || []).map(i => `<div class="tb-term"><b>${fmt(i.w)}</b> — ${fmt(i.d)}</div>`).join('')}</div>`;
      if (b.t === 'timeline') return tbTimeline(b.items);
      if (b.t === 'chain') return `<div class="tb-chain">${(b.items || [])
          .map(i => `<span class="tb-chain-i">${fmt(i)}</span>`)
          .join('<span class="tb-chain-a">→</span>')}</div>`;
      if (b.t === 'date') {
        const body = b.parts
          ? b.parts.map(pt => `<div class="tb-date-p">
              <div class="tb-date-ph">${esc(pt.h)}</div>
              ${[].concat(pt.x || []).map(p => `<p class="tb-p">${fmt(p)}</p>`).join('')}</div>`).join('')
          : [].concat(b.x || []).map(p => `<p class="tb-p">${fmt(p)}</p>`).join('');
        return `<div class="tb-datebox">
          <div class="tb-date-y">${esc(b.y)}</div>
          <div class="tb-date-n">${esc(b.name)}</div>
          ${body}
        </div>`;
      }
      if (b.t === 'links') return `<div class="tb-links">${(b.items || [])
          .map(l => `<button class="tb-chip" data-k="${l.k}" data-id="${l.id}">${esc(l.l)}</button>`)
          .join('')}</div>`;
      return '';
    }).join('');
  }

  function tbTimeline(items) {
    return `<div class="tb-timeline">${(items || []).map(it =>
      `<div class="tb-tl-row"><span class="tb-tl-y">${esc(it.y)}</span><span class="tb-tl-e">${fmt(it.e)}</span></div>`)
      .join('<div class="tb-tl-arrow" aria-hidden="true">↓</div>')}</div>`;
  }

  function openDateChip(id) {
    const d = DATES.find(x => x.id === id);
    const deep = (typeof DEEP_DATES !== 'undefined') ? DEEP_DATES[id] : null;
    if (!d && !deep) return;

    const sec = (title, body) => body
      ? `<div class="m-section"><h4>${title}</h4><p>${esc(body)}</p></div>` : '';
    const secList = (title, arr) => (arr && arr.length)
      ? `<div class="m-section"><h4>${title}</h4><ul class="m-list">${arr.map(i => `<li>${esc(i)}</li>`).join('')}</ul></div>` : '';
    const topicName = d ? ((TOPICS.find(t => t.id === d.t) || {}).short || '') : '';
    const actions = `
      <div class="m-actions">
        ${d ? '<button class="btn btn-primary" data-act="dates">◉ В РАЗДЕЛ ДАТ</button>' : ''}
        ${Cards.cardsFor(id).length ? '<button class="btn btn-ghost" data-act="train">▶ ТРЕНИРОВАТЬСЯ</button>' : ''}
        <button class="btn btn-ghost" data-act="close">ЗАКРЫТЬ</button>
      </div>`;

    if (deep) {
      Nav.openModal(`
        <div class="m-title" id="modalTitle">${esc(d ? d.y : '')} — ${esc(d ? d.title : '')}</div>
        <div class="m-sub">${esc(topicName)}</div>
        ${sec('КРАТКО', deep.short)}
        ${sec('ПРЕДЫСТОРИЯ', deep.context)}
        ${secList('ПРИЧИНЫ', deep.causes)}
        ${sec('ЧТО ПРОИСХОДИЛО', deep.whatHappened)}
        ${sec('РЕЗУЛЬТАТ', deep.result)}
        ${sec('ПОСЛЕДСТВИЯ', deep.consequences)}
        ${sec('ЗНАЧЕНИЕ', deep.significance)}
        ${secList('КЛЮЧЕВЫЕ ФАКТЫ', deep.keyFacts)}
        ${secList('ЕСЛИ СПРОСЯТ ДАЛЬШЕ', deep.followUps)}
        ${secList('ЧАСТЫЕ ОШИБКИ', deep.mistakes)}
        ${actions}`);
    } else {
      Nav.openModal(`
        <div class="m-title" id="modalTitle">${esc(d.y)} — ${esc(d.title)}</div>
        <div class="m-sub">${esc(topicName)}</div>
        ${sec('ЗАЧЕМ ЭТА ДАТА', d ? d.why : '')}
        ${actions}`);
    }
    const dz = document.querySelector('#modalBox [data-act="dates"]');
    if (dz) dz.onclick = () => { Nav.closeModal(); Nav.go('dates'); };
    const tr = document.querySelector('#modalBox [data-act="train"]');
    if (tr) tr.onclick = () => { Nav.closeModal(); Nav.go('cards'); Cards.practice(id); };
    document.querySelector('#modalBox [data-act="close"]').onclick = Nav.closeModal;
  }

  function renderChapter(id) {
    const root = $('chapterRoot');
    if (!root) return;
    if (!id || typeof TEXTBOOK === 'undefined' || !TEXTBOOK[id]) {
      root.innerHTML = '<div class="red-empty">Тема не найдена. Вернись к списку учебника.</div>';
      return;
    }
    const ch = TEXTBOOK[id];
    const t = TOPICS.find(x => x.id === id) || { n: '', name: id };
    if (tbStatus(id) === 'none') tbSetStatus(id, 'reading');
    const st = tbStatus(id);
    const b = TB_BADGE(st);
    const min = Math.max(1, Math.round(tbWords(ch) / 160));
    const order = TB_ORDER();
    const i = order.indexOf(id);
    const prev = i > 0 ? order[i - 1] : null;
    const next = i > -1 && i < order.length - 1 ? order[i + 1] : null;
    const navBtn = (tid, dir) => {
      const tt = TOPICS.find(x => x.id === tid);
      const label = esc(tt ? (tt.short || tt.name) : tid);
      return `<button class="btn btn-ghost tb-navbtn" data-ch="${tid}">${dir === 'prev' ? '← ' + label : label + ' →'}</button>`;
    };

    root.innerHTML = `
      <div class="tb-head">
        <div class="tb-num">ТЕМА ${esc(t.n)} · ПОДРОБНАЯ ИСТОРИЯ</div>
        <h1 class="tb-title">${esc(t.name)}</h1>
        <div class="tb-meta">
          <span class="badge ${b[0]}">${b[1]}</span>
          <span class="badge">⏱ ~${min} мин</span>
          <span class="badge">${(ch.sections || []).length} разделов</span>
          <span class="badge">${tbLinkCount(ch, 'date')} дат</span>
          <span class="badge">${tbLinkCount(ch, 'person')} персон</span>
        </div>
        <div class="tb-actions">
          <button class="btn ${st === 'done' ? 'btn-ghost' : 'btn-primary'}" id="tbDone">${st === 'done' ? '○ СБРОСИТЬ СТАТУС' : '✓ ОТМЕТИТЬ ИЗУЧЕННОЙ'}</button>
          <button class="btn btn-ghost" id="tbTrain">▣ ТРЕНИРОВАТЬСЯ</button>
          <button class="btn btn-ghost" id="tbComm">🎤 КОМИССИЯ</button>
        </div>
        <div class="tb-toc">${(ch.sections || []).map((s, si) =>
          `<button class="tb-toc-i" data-si="${si}">${esc(s.h)}</button>`).join('')}</div>
      </div>

      <article class="tb-body">
        <p class="tb-intro">${fmt(ch.intro)}</p>
        ${(ch.timeline && ch.timeline.length) ? `<div class="tb-tlbox">
          <div class="tb-tlbox-h">⏱ ХРОНОЛОГИЯ ТЕМЫ</div>
          ${tbTimeline(ch.timeline)}
        </div>` : ''}
        ${(ch.sections || []).map((s, si) => `
          <section class="tb-sec" id="tb-s-${si}">
            <h2 class="tb-h2"><span class="tb-h2-n">${si + 1}.</span> ${esc(s.h)}</h2>
            ${tbRenderBlocks(s.blocks)}
            ${s.gist ? `<div class="tb-gist"><span class="tb-gist-ico" aria-hidden="true">🧠</span>
              <div><div class="tb-gist-h">ГЛАВНАЯ МЫСЛЬ</div><p>${fmt(s.gist)}</p></div></div>` : ''}
            ${s.link ? `<div class="tb-xlink"><div class="tb-xlink-h">🔗 КАК ЭТО СВЯЗАНО С ДАЛЬНЕЙШЕЙ ИСТОРИЕЙ</div>
              <p>${fmt(s.link)}</p></div>` : ''}
          </section>`).join('')}
        <section class="tb-sec" id="tb-s-check">
          <h2 class="tb-h2"><span class="tb-h2-n">?</span> ЧТО Я ДОЛЖЕН ПОНИМАТЬ ПОСЛЕ ЭТОЙ ТЕМЫ</h2>
          <ul class="tb-ul tb-check">${(ch.checklist || []).map(c => `<li>${fmt(c)}</li>`).join('')}</ul>
        </section>
        <section class="tb-sec" id="tb-s-sum">
          <h2 class="tb-h2"><span class="tb-h2-n">✓</span> КОРОТКО: ВСЯ ТЕМА ЗА 2 МИНУТЫ</h2>
          <ol class="tb-ol">${(ch.summary || []).map(s => `<li>${fmt(s)}</li>`).join('')}</ol>
        </section>
      </article>

      <div class="tb-foot">
        ${prev ? navBtn(prev, 'prev') : '<span></span>'}
        ${next ? navBtn(next, 'next') : '<span></span>'}
      </div>`;

    $('tbDone').onclick = () => {
      tbSetStatus(id, tbStatus(id) === 'done' ? 'reading' : 'done');
      renderChapter(id);
    };
    $('tbTrain').onclick = () => {
      Nav.go('cards');
      Cards.start({ mode: 'topic', topicId: id, limit: 40 });
    };
    $('tbComm').onclick = () => Nav.go('commission');
    root.querySelectorAll('[data-ch]').forEach(btn => {
      btn.onclick = () => openChapter(btn.dataset.ch);
    });
    root.querySelectorAll('.tb-toc-i').forEach(btn => {
      btn.onclick = () => {
        const el = document.getElementById('tb-s-' + btn.dataset.si);
        if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
    });
    root.querySelectorAll('.tb-chip').forEach(chip => {
      chip.onclick = () => {
        const k = chip.dataset.k, cid = chip.dataset.id;
        if (k === 'date') openDateChip(cid);
        else if (k === 'person') openPerson(cid);
        else if (k === 'cards') { Nav.go('cards'); Cards.practice(cid); }
      };
    });
  }

  /* ================================================================
     ДАТЫ
     ================================================================ */
  function renderDates() {
    const list = DATES.filter(d => {
      if (dateFilter === 'all') return true;
      const s = Store.state.cards[d.id + '_a'] || Store.state.cards[d.id + '_b'];
      const status = s ? s.status : 'none';
      if (dateFilter === 'unknown') return status === 'unknown' || status === 'none';
      if (dateFilter === 'partial') return status === 'partial';
      if (dateFilter === 'know') return status === 'know' || status === 'mastered';
      return true;
    });

    $('datesList').innerHTML = list.map(d => {
      const sa = Store.state.cards[d.id + '_a'], sb = Store.state.cards[d.id + '_b'];
      const worst = ['unknown','partial','know','mastered'];
      let status = 'none';
      [sa, sb].forEach(s => {
        if (!s || s.status === 'none') return;
        if (status === 'none' || worst.indexOf(s.status) < worst.indexOf(status)) status = s.status;
      });
      const label = Progress.STATUS_LABEL[status];
      const dot = status === 'none' ? '' : `<span class="dot dot-${Progress.STATUS_DOT[status]}"></span>`;
      return `<button class="date-tile status-${status}" id="date-${d.id}" data-id="${d.id}">
        <span class="dt-st badge b-${status}">${dot} ${label}</span>
        <div class="dt-year">${esc(d.y)}</div>
        <div class="dt-title">${esc(d.title)}</div>
        <div class="dt-why">${esc(d.why)}</div>
        <div class="dt-topic">${esc((TOPICS.find(t => t.id === d.t) || {}).short || '')}</div>
        <span class="btn btn-ghost btn-sm" data-practice="${d.id}" style="margin-top:12px;padding:8px 14px;font-size:12px">ТРЕНИРОВКА →</span>
      </button>`;
    }).join('') || '<div class="red-empty">По этому фильтру карточек нет.</div>';

    $('datesList').querySelectorAll('[data-practice]').forEach(b => {
      b.onclick = e => { e.stopPropagation(); Nav.go('cards'); Cards.practice(b.dataset.practice); };
    });
    $('datesList').querySelectorAll('.date-tile').forEach(tile => {
      tile.onclick = () => tile.classList.toggle('open');
    });
  }

  /* ================================================================
     ПЕРСОНЫ
     ================================================================ */
  function renderPersons() {
    $('personsList').innerHTML = PERSONS.map(p => {
      const s = Store.state.cards[p.id + '_role'];
      const status = s ? s.status : 'none';
      return `<button class="person-card status-${status}" data-id="${p.id}">
        <div class="pc-name">${esc(p.name)}</div>
        <div class="pc-years">${esc(p.years)}</div>
        <div class="pc-role">${esc(p.role)}</div>
        <div class="pc-foot">
          <span class="badge b-${status}">${esc(Progress.STATUS_LABEL[status])}</span>
          <span class="dt-topic">${esc((TOPICS.find(t => t.id === p.t) || {}).short || '')}</span>
        </div>
      </button>`;
    }).join('');
    $('personsList').querySelectorAll('[data-id]').forEach(b => {
      b.onclick = () => openPerson(b.dataset.id);
    });
  }

  function openPerson(id) {
    const p = PERSONS.find(x => x.id === id);
    if (!p) return;
    const dates = p.dates.map(y => {
      const d = DATES.find(d => d.y === y || d.y.startsWith(y));
      return d ? `${d.y} — ${d.title}` : y;
    });
    const events = (p.events || []).map(eid => {
      const e = EVENTS.find(x => x.id === eid);
      return e ? `${e.name} (${e.year})` : null;
    }).filter(Boolean);

    Nav.openModal(`
      <div class="m-title" id="modalTitle">${esc(p.name)}</div>
      <div class="m-sub">${esc(p.years)} · ${esc((TOPICS.find(t => t.id === p.t) || {}).name || '')}</div>
      <div class="m-section"><h4>КТО ЭТО</h4><p>${esc(p.role)}</p></div>
      <div class="m-section"><h4>КЛЮЧЕВЫЕ ФАКТЫ</h4>
        <ul class="m-list">${p.facts.map(f => `<li>${esc(f)}</li>`).join('')}</ul></div>
      ${dates.length ? `<div class="m-section"><h4>СВЯЗАННЫЕ ДАТЫ</h4>
        <ul class="m-list">${dates.map(d => `<li>${esc(d)}</li>`).join('')}</ul></div>` : ''}
      ${events.length ? `<div class="m-section"><h4>СВЯЗАННЫЕ СОБЫТИЯ</h4>
        <ul class="m-list">${events.map(e => `<li>${esc(e)}</li>`).join('')}</ul></div>` : ''}
      <div class="m-actions">
        <button class="btn btn-primary" data-act="train">▶ ПОТРЕНИРОВАТЬСЯ</button>
        <button class="btn btn-ghost" data-act="close">ЗАКРЫТЬ</button>
      </div>`);
    document.querySelector('#modalBox [data-act="train"]').onclick = () => {
      Nav.closeModal(); Nav.go('cards'); Cards.practice(p.id);
    };
    document.querySelector('#modalBox [data-act="close"]').onclick = Nav.closeModal;
  }

  /* ================================================================
     СОБЫТИЯ
     ================================================================ */
  function renderEvents() {
    $('eventsList').innerHTML = EVENTS.map(e => {
      const s = Store.state.cards[e.id + '_why'];
      const status = s ? s.status : 'none';
      return `<div class="event-card status-${status}">
        <div class="ev-head">
          <span class="ev-name">${esc(e.name)}</span>
          <span class="ev-year">${esc(e.year)}</span>
        </div>
        <div class="ev-grid">
          <div class="ev-cell"><div class="ec-l">УЧАСТНИКИ</div><div class="ec-t">${esc(e.participants)}</div></div>
          <div class="ev-cell"><div class="ec-l">ПРИЧИНЫ</div><div class="ec-t">${esc(e.causes)}</div></div>
          <div class="ev-cell"><div class="ec-l">ХОД</div><div class="ec-t">${esc(e.course)}</div></div>
          <div class="ev-cell"><div class="ec-l">РЕЗУЛЬТАТ</div><div class="ec-t">${esc(e.result)}</div></div>
          <div class="ev-cell"><div class="ec-l">ЗНАЧЕНИЕ</div><div class="ec-t">${esc(e.significance)}</div></div>
        </div>
        <div class="ev-actions">
          <button class="btn btn-primary" data-quiz="${e.id}">◉ ПРОВЕРИТЬ СЕБЯ</button>
          <button class="btn btn-ghost" data-cards="${e.id}">▣ КАРТОЧКИ</button>
          <span class="badge b-${status}" style="align-self:center">${esc(Progress.STATUS_LABEL[status])}</span>
        </div>
      </div>`;
    }).join('');
    $('eventsList').querySelectorAll('[data-quiz]').forEach(b => {
      b.onclick = () => Quiz.start({ eventId: b.dataset.quiz });
    });
    $('eventsList').querySelectorAll('[data-cards]').forEach(b => {
      b.onclick = () => { Nav.go('cards'); Cards.practice(b.dataset.cards); };
    });
  }

  function openEvent(id) {
    const el = document.querySelector(`#eventsList [data-cards="${id}"]`);
    Nav.go('events');
    if (el && el.scrollIntoView) setTimeout(() => el.closest('.event-card').scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
  }

  /* ================================================================
     ВОПРОС (из поиска)
     ================================================================ */
  function openQuestion(type, q, answer, must, ref) {
    Nav.openModal(`
      <div class="m-title" id="modalTitle">${esc(type)}</div>
      <div class="m-section"><h4>ВОПРОС</h4><p style="font-size:17px;color:#fff">${esc(q)}</p></div>
      <div class="m-section"><h4>ЭТАЛОННЫЙ ОТВЕТ</h4><p>${esc(answer)}</p></div>
      ${must && must.length ? `<div class="m-section"><h4>ЧТО ОБЯЗАТЕЛЬНО УПОМЯНУТЬ</h4>
        <ul class="m-list">${must.map(m => `<li>${esc(m)}</li>`).join('')}</ul></div>` : ''}
      <div class="m-actions">
        ${ref && Cards.cardsFor(ref).length ? '<button class="btn btn-primary" data-act="train">▶ ПОТРЕНИРОВАТЬСЯ</button>' : ''}
        <button class="btn btn-ghost" data-act="close">ЗАКРЫТЬ</button>
      </div>`);
    const tr = document.querySelector('#modalBox [data-act="train"]');
    if (tr) tr.onclick = () => { Nav.closeModal(); Nav.go('cards'); Cards.practice(ref); };
    document.querySelector('#modalBox [data-act="close"]').onclick = Nav.closeModal;
  }

  /* ================================================================
     ПРОГРЕСС
     ================================================================ */
  function renderProgress() {
    const sum = Progress.summary();
    const hist = Store.state.history.slice(-14);
    const rows = TOPICS.map(t => ({ name: t.short, percent: Progress.topicStats(t.id).percent }));
    const maxRev = Math.max(1, ...hist.map(h => h.correct + h.wrong), (Store.state.day ? Store.state.day.reviews : 0));

    $('progressRoot').innerHTML = `
      <div class="stat-grid">
        <div class="stat-cell"><div class="sc-l">Всего карточек</div><div class="sc-v">${sum.total}</div><div class="sc-s">по всему курсу</div></div>
        <div class="stat-cell ok"><div class="sc-l">Изучено</div><div class="sc-v">${sum.seen}</div><div class="sc-s">были в работе хотя бы раз</div></div>
        <div class="stat-cell"><div class="sc-l">Новых</div><div class="sc-v">${sum.fresh}</div><div class="sc-s">ни разу не встреченные</div></div>
        <div class="stat-cell warn"><div class="sc-l">Нужно повторить</div><div class="sc-v">${sum.needRepeat}</div><div class="sc-s">в ближайшие сутки · сейчас: ${sum.due}</div></div>
        <div class="stat-cell accent"><div class="sc-l">Красная зона</div><div class="sc-v">${sum.red}</div><div class="sc-s">постоянные ошибки</div></div>
        <div class="stat-cell"><div class="sc-l">Средняя точность</div><div class="sc-v">${sum.accuracy}%</div><div class="sc-s">по всем оценкам</div></div>
        <div class="stat-cell"><div class="sc-l">Серия</div><div class="sc-v">${sum.streak}</div><div class="sc-s">лучшая: ${sum.best}</div></div>
      </div>

      <div class="panel">
        <h2 class="panel-title">ПО ТЕМАМ</h2>
        <div class="by-topic">
          ${rows.map(r => `<div class="bt-row">
            <div class="bt-head"><span>${esc(r.name)}</span><b>${r.percent}%</b></div>
            <div class="bar"><i style="width:${r.percent}%" class="${r.percent >= 70 ? 'is-ok' : ''}"></i></div>
          </div>`).join('')}
        </div>
        <div class="legend">
          <span><i class="dot dot-r"></i>DON'T KNOW</span>
          <span><i class="dot dot-y"></i>PARTIAL</span>
          <span><i class="dot dot-g"></i>KNOW</span>
          <span><i class="dot dot-f"></i>MASTERED</span>
        </div>
      </div>

      <div class="panel">
        <h2 class="panel-title">АКТИВНОСТЬ ПОСЛЕДНИХ ДНЕЙ</h2>
        <div class="hist-bars">
          ${hist.map(h => {
            const n = h.correct + h.wrong;
            const height = Math.round(n / maxRev * 100);
            const acc = n ? Math.round(h.correct / n * 100) : 0;
            return `<div class="hist-col" title="${h.date}: ${n} карточек, точность ${acc}%">
              <span class="hl">${acc}%</span>
              <div class="hb" style="height:${Math.max(3, height)}%"></div>
              <span class="hl">${h.date.slice(5)}</span>
            </div>`;
          }).join('')}
          ${(() => {
            const d = Store.state.day;
            const n = d.reviews, height = Math.round(n / maxRev * 100);
            return `<div class="hist-col" title="сегодня: ${n} карточек">
              <span class="hl">${n ? Progress.todayAccuracy() + '%' : '—'}</span>
              <div class="hb" style="height:${Math.max(3, height)}%;background:linear-gradient(180deg,var(--accent2),rgba(216,90,90,.5))"></div>
              <span class="hl">сег</span>
            </div>`;
          })()}
        </div>
      </div>

      <div class="panel">
        <h2 class="panel-title">КОМИССИЯ</h2>
        <div class="recent-runs">
          ${((Store.state.commission && Store.state.commission.runs) || []).slice(0, 6).map(r => `
            <div class="run-row">
              <span>${esc(r.date)} · ${r.total} вопросов</span>
              <span>уверенно ${r.good} · частично ${r.partial} · провал ${r.bad}</span>
              <span class="rr-a">${r.accuracy}%</span>
            </div>`).join('') || '<div class="red-empty">Симуляций ещё не было. Самое время.</div>'}
        </div>
      </div>

      <div class="m-actions">
        <button class="btn btn-primary btn-lg" id="progComm">🎤 ПРОЙТИ КОМИССИЮ</button>
        <button class="btn btn-ghost btn-lg" id="progSettings">⚙ НАСТРОЙКИ</button>
      </div>`;

    $('progComm').onclick = () => Nav.go('commission');
    $('progSettings').onclick = openSettings;
  }

  /* ================================================================
     НАСТРОЙКИ / СБРОС
     ================================================================ */
  function openSettings() {
    const exam = Progress.examDate();
    Nav.openModal(`
      <div class="m-title" id="modalTitle">НАСТРОЙКИ</div>
      <div class="m-section"><h4>ДАТА КОМИССИИ</h4>
        <p>${exam.getDate().toString().padStart(2, '0')}.${pad(exam.getMonth() + 1)}.${exam.getFullYear()}</p></div>
      <div class="m-section"><h4>ХРАНЕНИЕ ПРОГРЕССА</h4>
        <p>${Store.available
          ? 'Прогресс сохраняется в localStorage этого браузера и не потеряется при перезагрузке.'
          : 'localStorage недоступен — прогресс живёт только до перезагрузки страницы.'}</p></div>
      <div class="m-section"><h4>ГОРЯЧИЕ КЛАВИШИ (КАРТОЧКИ)</h4>
        <ul class="m-list">
          <li>Пробел — показать ответ</li>
          <li>1 — не знал · 2 — с трудом · 3 — знал · 4 — мгновенно</li>
          <li>Enter — далее / повторить</li>
          <li>Esc — выйти из тренировки</li>
          <li>/ или Ctrl+K — глобальный поиск</li>
        </ul></div>
      <div class="danger-zone">
        <button class="btn btn-red" id="resetBtn">СБРОСИТЬ ВЕСЬ ПРОГРЕСС</button>
        <p>Это действие нельзя отменить: статусы карточек, серии, статистика комиссии и daily missions будут стёрты.</p>
      </div>`);
    document.getElementById('resetBtn').onclick = () => {
      if (!confirm('Это действие нельзя отменить. Сбросить весь прогресс?')) return;
      Store.reset();
      Progress.ensureDay();
      Nav.closeModal();
      Cards.showIdle();
      refreshChrome();
      Nav.go('dashboard', { force: true });
      alert('Прогресс сброшен. Начни с чистого листа.');
    };
  }

  /* ================================================================
     CHROME (sidebar / отсчёт)
     ================================================================ */
  function refreshChrome() {
    const cd = Progress.countdown();
    const o = Progress.overall();
    $('sideDays').textContent = cd.days > 0
      ? pad(cd.days) + ' ' + plural(cd.days, ['ДЕНЬ','ДНЯ','ДНЕЙ'])
      : 'СЕГОДНЯ';
    $('sideBar').style.width = o.percent + '%';
    $('sidePct').textContent = o.percent + '% подготовлено';
    if (Nav.current === 'dashboard') {
      renderDashboard();
    }
  }

  /* ================================================================
     INIT
     ================================================================ */
  function init() {
    Store.load();
    Progress.ensureDay();
    Cards.build();
    if (typeof Pomodoro !== 'undefined') Pomodoro.init();
    Nav.init();

    $('ctaContinue').onclick = continuePreparation;
    $('topicBack').onclick = () => Nav.go('topics');
    $('chapterBack').onclick = () => Nav.go('textbook');
    $('dateFilters').querySelectorAll('.chip').forEach(chip => {
      chip.onclick = () => {
        dateFilter = chip.dataset.filter;
        $('dateFilters').querySelectorAll('.chip').forEach(c => c.classList.toggle('is-active', c === chip));
        renderDates();
      };
    });

    Nav.go('dashboard', { force: true });
    refreshChrome();

    // живой отсчёт раз в минуту
    setInterval(() => {
      const cd = Progress.countdown();
      if (Nav.current === 'dashboard') renderDashboard();
      else refreshChromeLight(cd);
    }, 60000);

    window.addEventListener('beforeunload', () => Store.save(true));
    document.addEventListener('visibilitychange', () => { if (document.hidden) Store.save(true); });
  }

  function refreshChromeLight(cd) {
    $('sideDays').textContent = cd.days > 0
      ? pad(cd.days) + ' ' + plural(cd.days, ['ДЕНЬ','ДНЯ','ДНЕЙ']) : 'СЕГОДНЯ';
    const o = Progress.overall();
    $('sideBar').style.width = o.percent + '%';
    $('sidePct').textContent = o.percent + '% подготовлено';
  }

  document.addEventListener('DOMContentLoaded', init);

  return {
    get currentTopic() { return currentTopic; },
    get currentChapter() { return currentChapter; },
    renderDashboard, renderReview, renderTopics, renderTopic, openTopic,
    renderTextbook, renderChapter, openChapter,
    renderDates, renderPersons, renderEvents, renderProgress,
    openPerson, openEvent, openQuestion, openSettings, refreshChrome, init
  };
})();
