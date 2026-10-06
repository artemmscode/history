/* ============================================================
   storage.js — localStorage wrapper + app state
   Если localStorage недоступен, работаем в памяти (session).
   ============================================================ */
const Store = (() => {
  const KEY = 'hst0610_state_v1';
  let available = true;

  try {
    localStorage.setItem('__hst_probe__', '1');
    localStorage.removeItem('__hst_probe__');
  } catch (e) {
    available = false;
  }

  const defaultState = () => ({
    cards: {},                 // cardId -> {status, attempts, correct, errors, next, last}
    day: null,                 // текущая дневная статистика
    daily: null,               // текущая daily mission
    history: [],               // [{date, reviews, correct, wrong, newCards, commission}]
    streak: 0,                 // серия правильных подряд
    bestStreak: 0,
    commission: { runs: [] },  // история симуляций
    lastSession: null,         // {mode, topicId}
    pomodoro: null,            // состояние таймера Помодоро
    textbook: {},              // topicId -> 'reading' | 'done' (статус чтения учебника)
    settings: { examDate: '2026-10-06' }
  });

  let state = defaultState();

  function load() {
    if (available) {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          state = Object.assign(defaultState(), parsed);
        }
      } catch (e) {
        console.warn('[HISTORY] Не удалось прочитать прогресс:', e);
      }
    }
    return state;
  }

  let saveTimer = null;
  function save(immediate) {
    if (!available) return;
    clearTimeout(saveTimer);
    const write = () => {
      try {
        localStorage.setItem(KEY, JSON.stringify(state));
      } catch (e) {
        available = false;
        console.warn('[HISTORY] localStorage недоступен — прогресс живёт до перезагрузки.');
      }
    };
    if (immediate) write();
    else saveTimer = setTimeout(write, 350);
  }

  function reset() {
    state = defaultState();
    save(true);
  }

  return {
    get state() { return state; },
    load, save, reset,
    get available() { return available }
  };
})();
