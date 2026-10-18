import { useState, useEffect } from 'react';

export interface DailyStats {
  date: string;
  activeSeconds: number;
  cardsDone: number;
  correctCount: number;
  mistakesPool: any[];
}

const getTodayKey = () => new Date().toISOString().split('T')[0];

function loadInitialStats(): DailyStats {
  const todayKey = getTodayKey();
  if (typeof window === 'undefined') {
    return { date: todayKey, activeSeconds: 0, cardsDone: 0, correctCount: 0, mistakesPool: [] };
  }
  const saved = localStorage.getItem('app_daily_stats');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (parsed.date === todayKey) {
        return {
          date: todayKey,
          activeSeconds: typeof parsed.activeSeconds === 'number' ? parsed.activeSeconds : 0,
          cardsDone: typeof parsed.cardsDone === 'number' ? parsed.cardsDone : 0,
          correctCount: typeof parsed.correctCount === 'number' ? parsed.correctCount : 0,
          mistakesPool: Array.isArray(parsed.mistakesPool) ? parsed.mistakesPool : []
        };
      }
      // Новый день: сбрасываем день, но СОХРАНЯЕМ накопительный пул ошибок
      return {
        date: todayKey,
        activeSeconds: 0,
        cardsDone: 0,
        correctCount: 0,
        mistakesPool: Array.isArray(parsed.mistakesPool) ? parsed.mistakesPool : []
      };
    } catch (e) {}
  }
  return { date: todayKey, activeSeconds: 0, cardsDone: 0, correctCount: 0, mistakesPool: [] };
}

let globalStats: DailyStats = loadInitialStats();
const listeners = new Set<(stats: DailyStats) => void>();
let timerInitialized = false;
let lastActivityTime = Date.now();

function notify() {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('app_daily_stats', JSON.stringify(globalStats));
    } catch (e) {}
  }
  listeners.forEach(fn => fn(globalStats));
}

function initGlobalTimer() {
  if (timerInitialized || typeof window === 'undefined') return;
  timerInitialized = true;

  const onActivity = () => { lastActivityTime = Date.now(); };
  window.addEventListener('mousemove', onActivity, { passive: true });
  window.addEventListener('keydown', onActivity, { passive: true });
  window.addEventListener('touchstart', onActivity, { passive: true });

  setInterval(() => {
    if (document.hidden) return;
    // Если бездействие больше 45 секунд — пауза
    if (Date.now() - lastActivityTime > 45000) return;

    const today = getTodayKey();
    if (globalStats.date !== today) {
      globalStats = {
        date: today,
        activeSeconds: 1,
        cardsDone: 0,
        correctCount: 0,
        mistakesPool: globalStats.mistakesPool || []
      };
    } else {
      globalStats = {
        ...globalStats,
        activeSeconds: (globalStats.activeSeconds || 0) + 1
      };
    }
    notify();
  }, 1000);
}

export function useDayStats() {
  const [stats, setLocalStats] = useState<DailyStats>(() => {
    if (typeof window !== 'undefined') {
      const current = loadInitialStats();
      globalStats = current;
      return current;
    }
    return globalStats;
  });

  useEffect(() => {
    initGlobalTimer();
    const listener = (newStats: DailyStats) => setLocalStats(newStats);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const setStats = (updater: any) => {
    const next = typeof updater === 'function' ? updater(globalStats) : updater;
    globalStats = next;
    notify();
  };

  const recordCardResult = (isCorrect: boolean, card: any) => {
    let updatedPool = [...(globalStats.mistakesPool || [])];
    const targetWord = card?.targetWord || card?.card?.targetWord || '';
    const cardId = card?.id || card?.card?.id || '';

    const matchFn = (c: any) => {
      const cWord = c?.targetWord || c?.card?.targetWord || '';
      const cId = c?.id || c?.card?.id || '';
      if (targetWord && cWord) return cWord === targetWord;
      return Boolean(cId && cardId && cId === cardId);
    };

    if (!isCorrect) {
      // Добавляем в ошибки (без дублей)
      if (!updatedPool.some(matchFn)) {
        updatedPool.push(card);
      }
    } else {
      // Если это была карточка из пула ошибок — вычеркиваем
      updatedPool = updatedPool.filter(c => !matchFn(c));
    }

    const today = getTodayKey();
    globalStats = {
      ...globalStats,
      date: today,
      cardsDone: (globalStats.cardsDone || 0) + 1,
      correctCount: isCorrect ? (globalStats.correctCount || 0) + 1 : (globalStats.correctCount || 0),
      mistakesPool: updatedPool
    };
    notify();
  };

  return { stats, setStats, recordCardResult };
}
