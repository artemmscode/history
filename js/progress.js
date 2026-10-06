/* ============================================================
   progress.js — статусы карточек, интервальное повторение,
   RED ZONE, daily mission, обратный отсчёт
   ============================================================ */
const Progress = (() => {
  const MIN = 60000, HOUR = 3600000, DAY = 86400000;

  const INTERVALS = {           // локальный SRS: слабое возвращается быстро
    unknown: 5 * MIN,
    partial: 30 * MIN,
    know: 1 * DAY,
    mastered: 3 * DAY
  };
  const RATING = [
    { status:'unknown',  label:'НЕ ЗНАЛ',   ico:'😵' },
    { status:'partial',  label:'С ТРУДОМ',  ico:'😐' },
    { status:'know',     label:'ЗНАЛ',      ico:'🙂' },
    { status:'mastered', label:'МГНОВЕННО', ico:'🔥' }
  ];
  const STATUS_LABEL = {
    none:'НЕ НАЧАТО', unknown:"DON'T KNOW", partial:'PARTIAL', know:'KNOW', mastered:'MASTERED'
  };
  const STATUS_DOT = { none:'m', unknown:'r', partial:'y', know:'g', mastered:'f' };
  const WEIGHT = { none:0, unknown:.1, partial:.4, know:.75, mastered:1 };

  const st = () => Store.state;

  function todayKey(d) {
    d = d || new Date();
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function newDay() {
    return { date: todayKey(), reviews:0, newCards:0, correct:0, wrong:0, types:{}, commission:0,
             focus:0, pomodoros:0 };
  }
  function newDaily() {
    return { date: todayKey(), done:{} };
  }

  /* Смена суток: архивируем вчерашнюю статистику, обнуляем счётчики */
  function ensureDay() {
    const s = st(), t = todayKey();
    if (s.day && s.day.date !== t) {
      s.history.push({ date:s.day.date, reviews:s.day.reviews, correct:s.day.correct,
                       wrong:s.day.wrong, newCards:s.day.newCards, commission:s.day.commission });
      if (s.history.length > 60) s.history.shift();
      s.day = newDay();
    }
    if (!s.day) s.day = newDay();
    if (typeof s.day.focus !== 'number') s.day.focus = 0;
    if (typeof s.day.pomodoros !== 'number') s.day.pomodoros = 0;
    if (!s.daily || s.daily.date !== t) s.daily = newDaily();
    if (!Array.isArray(s.history)) s.history = [];
    if (typeof s.streak !== 'number') s.streak = 0;
    if (typeof s.bestStreak !== 'number') s.bestStreak = 0;
    if (!s.commission || !Array.isArray(s.commission.runs)) s.commission = { runs:[] };
    return s;
  }

  function cardStat(id) {
    const s = ensureDay();
    if (!s.cards[id]) s.cards[id] = { status:'none', attempts:0, correct:0, errors:0, next:0, last:0 };
    return s.cards[id];
  }

  function hasStat(id) { return !!(st().cards && st().cards[id]); }

  /* Выставляет оценку карточке и двигает её в расписании повторений */
  function rateCard(id, rating) {
    const s = ensureDay();
    const r = RATING[rating] || RATING[0];
    const c = cardStat(id);
    const wasNew = c.attempts === 0;
    const now = Date.now();

    c.status = r.status;
    c.attempts += 1;
    c.last = now;
    c.next = now + (INTERVALS[r.status] || DAY);

    const card = Cards.byId[id];
    const type = card ? card.type : 'other';

    s.day.types[type] = (s.day.types[type] || 0) + 1;
    s.day.reviews += 1;
    if (wasNew) s.day.newCards += 1;

    if (rating === 0) {
      c.errors += 1;
      s.day.wrong += 1;
      s.streak = 0;
    } else {
      c.correct += 1;
      s.day.correct += 1;
      s.streak += 1;
      if (s.streak > s.bestStreak) s.bestStreak = s.streak;
    }
    Store.save();
    return r;
  }

  /* Карточки, которые «помнятся» за счёт расписания */
  function dueCards(now) {
    now = now || Date.now();
    return Object.keys(st().cards)
      .filter(id => st().cards[id].next > 0 && st().cards[id].next <= now)
      .sort((a, b) => weight(st().cards[a].status) - weight(st().cards[b].status));
  }
  function weight(status) { return WEIGHT[status] === undefined ? 1 : WEIGHT[status]; }

  function newCards(limit) {
    const out = [];
    for (const c of Cards.all) if (!st().cards[c.id]) out.push(c.id);
    return limit ? out.slice(0, limit) : out;
  }

  /* RED ZONE — карточки, которые пользователь стабильно ломает */
  function weakCards() {
    const s = ensureDay();
    return Object.keys(s.cards)
      .filter(id => {
        const c = s.cards[id];
        return c.errors >= 2 || (c.errors >= 1 && c.status === 'unknown') ||
               (c.attempts >= 3 && c.correct === 0);
      })
      .sort((a, b) => (s.cards[b].errors - s.cards[a].errors) || (s.cards[a].last - s.cards[b].last));
  }

  function topicCards(topicId) {
    return Cards.all.filter(c => c.topic === topicId);
  }

  function statsOf(cards) {
    const s = st();
    const now = Date.now();
    let total = 0, seen = 0, known = 0, mastered = 0, partial = 0, unknown = 0, sum = 0;
    let fresh = 0, due = 0, needRepeat = 0;
    cards.forEach(c => {
      total++;
      const stt = s.cards[c.id];
      if (!stt || stt.status === 'none' || !stt.attempts) { fresh++; return; }
      seen++;
      if (stt.status === 'mastered') mastered++;
      else if (stt.status === 'know') known++;
      else if (stt.status === 'partial') partial++;
      else if (stt.status === 'unknown') unknown++;
      sum += WEIGHT[stt.status] || 0;
      if (stt.next > 0) {
        if (stt.next <= now) due++;
        if (stt.next <= now + DAY) needRepeat++;
      }
    });
    return {
      total, seen, mastered, known, partial, unknown, fresh, due, needRepeat,
      percent: total ? Math.round(sum / total * 100) : 0
    };
  }

  function overall() { return statsOf(Cards.all); }

  function topicStats(topicId) { return statsOf(topicCards(topicId)); }

  function todayAccuracy() {
    const d = ensureDay().day;
    const n = d.correct + d.wrong;
    return n ? Math.round(d.correct / n * 100) : 0;
  }

  /* ---------- обратный отсчёт до комиссии ---------- */
  function examDate() {
    const raw = (st().settings && st().settings.examDate) || '2026-10-06';
    const parts = raw.split('-').map(Number);
    let dt = new Date(parts[0], parts[1] - 1, parts[2], 9, 0, 0);
    const now = new Date();
    if (dt < now) dt = new Date(now.getFullYear() + 1, parts[1] - 1, parts[2], 9, 0, 0);
    return dt;
  }

  function countdown() {
    const diff = examDate() - new Date();
    const ms = Math.max(0, diff);
    const days = Math.floor(ms / DAY);
    const hours = Math.floor((ms % DAY) / HOUR);
    const mins = Math.floor((ms % HOUR) / MIN);
    const plural = (n, a) => {
      const m10 = n % 10, m100 = n % 100;
      if (m10 === 1 && m100 !== 11) return a[0];
      if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return a[1];
      return a[2];
    };
    const dayWord = plural(days, ['день','дня','дней']);
    return {
      days, hours, mins,
      short: days > 0 ? String(days).padStart(2, '0') + ' ' + plural(days, ['ДЕНЬ','ДНЯ','ДНЕЙ']) : (hours > 0 ? String(hours).padStart(2,'0') + ' ЧАС' + plural(hours, ['','А','ОВ']) : 'СЕГОДНЯ'),
      long: days > 0
        ? `${String(days).padStart(2,'0')} ${dayWord} ${String(hours).padStart(2,'0')} ЧАС.`
        : (hours > 0 ? `${String(hours).padStart(2,'0')} ЧАС. ${String(mins).padStart(2,'0')} МИН.` : 'ДЕНЬ КОМИССИИ')
    };
  }

  /* ---------- daily mission ---------- */
  function mission() {
    const d = ensureDay().day;
    const t = d.types || {};
    const dates = (t.date2event || 0) + (t.event2date || 0);
    return [
      { key:'dates',  text:'30 новых дат',      cur:dates, target:30, done:dates >= 30 },
      { key:'rev',    text:'20 повторений',      cur:d.reviews, target:20, done:d.reviews >= 20 },
      { key:'person', text:'10 персон',          cur:t.person || 0, target:10, done:(t.person || 0) >= 10 },
      { key:'cause',  text:'5 причин/следствий', cur:t.cause || 0, target:5,  done:(t.cause || 0) >= 5 },
      { key:'comm',   text:'1 мини-комиссия',    cur:d.commission || 0, target:1, done:(d.commission || 0) >= 1 }
    ];
  }

  function missionPercent() {
    const m = mission();
    const done = m.filter(x => x.done).length;
    return Math.round(done / m.length * 100);
  }

  /* Запись результата симуляции комиссии */
  function logCommissionRun(run) {
    const s = ensureDay();
    s.day.commission = (s.day.commission || 0) + 1;
    s.commission.runs.unshift(Object.assign({ date: todayKey() }, run));
    if (s.commission.runs.length > 30) s.commission.runs.pop();
    Store.save();
  }

  /* «Плохой» ответ на комиссии → связанные карточки в RED ZONE */
  function markErrorByRef(ref) {
    if (!ref) return 0;
    let n = 0;
    Object.keys(st().cards).forEach(id => {
      const c = Cards.byId[id];
      if (c && c.src === ref) {
        const s = st().cards[id];
        s.errors = (s.errors || 0) + 1;
        s.status = 'unknown';
        s.next = Date.now() + INTERVALS.unknown;
        s.last = Date.now();
        n++;
      }
    });
    if (n === 0) {
      // если карточек ещё не было — создаём «слабую» запись по первому совпадению
      const card = Cards.all.find(c => c.src === ref);
      if (card) {
        const s = cardStat(card.id);
        s.errors = 1; s.status = 'unknown'; s.next = Date.now() + INTERVALS.unknown; s.last = Date.now();
        n = 1;
      }
    }
    Store.save();
    return n;
  }

  /* Общая сводка для страницы прогресса */
  function summary() {
    const s = ensureDay(), o = overall();
    let red = weakCards().length;
    const acc = s.history.length || s.day.reviews
      ? Math.round((
          s.history.reduce((a, h) => a + h.correct, 0) + s.day.correct
        ) / Math.max(1, s.history.reduce((a, h) => a + h.correct + h.wrong, 0) + s.day.correct + s.day.wrong) * 100)
      : 0;
    return {
      total: o.total, seen: o.seen, fresh: o.fresh, due: o.due,
      needRepeat: o.needRepeat, red, accuracy: acc,
      streak: s.streak, best: s.bestStreak, percent: o.percent
    };
  }

  return {
    RATING, STATUS_LABEL, STATUS_DOT, INTERVALS,
    ensureDay, todayKey, cardStat, hasStat, rateCard,
    dueCards, newCards, weakCards, topicCards, statsOf, overall, topicStats,
    todayAccuracy, countdown, mission, missionPercent, logCommissionRun,
    markErrorByRef, summary, examDate
  };
})();
