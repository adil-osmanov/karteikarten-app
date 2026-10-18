import { useState, useEffect, useRef } from 'react';

export interface DailyStats {
  date: string;
  activeSeconds: number;
  cardsDone: number;
  correctCount: number;
  mistakesCountToday?: number;
  mistakesPool: any[];
}

const getTodayKey = () => new Date().toISOString().split('T')[0];

export function getTodayCompletedCardsCount(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const todayStr = new Date().toLocaleDateString('en-CA');
    const todayIso = new Date().toISOString().split('T')[0];
    const dateKeys = [todayStr, todayIso];

    let maxFound = 0;
    ['DE', 'EN', 'RU'].forEach(lang => {
      const stored = localStorage.getItem(`daily_activity_${lang}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        for (const k of dateKeys) {
          const raw = parsed[k];
          const count = typeof raw === 'number' ? raw : (raw?.total || (typeof raw === 'string' ? parseInt(raw, 10) || 0 : 0));
          if (count > maxFound) maxFound = count;
        }
      }
    });

    const savedAppStats = localStorage.getItem('app_daily_stats');
    if (savedAppStats) {
      const parsed = JSON.parse(savedAppStats);
      if (typeof parsed?.cardsDone === 'number' && parsed.cardsDone > maxFound) {
        maxFound = parsed.cardsDone;
      }
    }

    return maxFound;
  } catch (e) {
    return 0;
  }
}

function loadInitialStats(): DailyStats {
  const todayKey = getTodayKey();
  const realTodayCards = getTodayCompletedCardsCount();

  if (typeof window === 'undefined') {
    return { 
      date: todayKey, 
      activeSeconds: 0, 
      cardsDone: realTodayCards, 
      correctCount: realTodayCards, 
      mistakesCountToday: 0, 
      mistakesPool: [] 
    };
  }

  const saved = localStorage.getItem('app_daily_stats');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      const mistakesPool = Array.isArray(parsed.mistakesPool) ? parsed.mistakesPool : [];
      if (parsed.date === todayKey) {
        const currentCards = Math.max(typeof parsed.cardsDone === 'number' ? parsed.cardsDone : 0, realTodayCards);
        
        // Recover from corrupt or missing accuracy data:
        const mistakesToday = typeof parsed.mistakesCountToday === 'number'
          ? Math.max(0, parsed.mistakesCountToday)
          : mistakesPool.length;

        let correctCount = typeof parsed.correctCount === 'number'
          ? parsed.correctCount
          : Math.max(0, currentCards - mistakesToday);

        // Self-healing: if correctCount is abnormally low compared to completed cards (e.g. 5 vs 287)
        if (currentCards > 0 && correctCount + mistakesToday < currentCards) {
          correctCount = Math.max(0, currentCards - mistakesToday);
        }

        return {
          date: todayKey,
          activeSeconds: typeof parsed.activeSeconds === 'number' ? parsed.activeSeconds : 0,
          cardsDone: currentCards,
          correctCount,
          mistakesCountToday: mistakesToday,
          mistakesPool
        };
      }

      // Новый день: сбрасываем дневные счетчики, но СОХРАНЯЕМ накопительный пул ошибок
      return {
        date: todayKey,
        activeSeconds: 0,
        cardsDone: realTodayCards,
        correctCount: realTodayCards,
        mistakesCountToday: 0,
        mistakesPool
      };
    } catch (e) {}
  }

  return { 
    date: todayKey, 
    activeSeconds: 0, 
    cardsDone: realTodayCards, 
    correctCount: realTodayCards, 
    mistakesCountToday: 0, 
    mistakesPool: [] 
  };
}

let globalStats: DailyStats = loadInitialStats();
const listeners = new Set<(stats: DailyStats) => void>();
let timerInitialized = false;
let activeStudyCount = 0;
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
  window.addEventListener('pointerdown', onActivity, { passive: true });
  window.addEventListener('mousemove', onActivity, { passive: true });
  window.addEventListener('keydown', onActivity, { passive: true });
  window.addEventListener('touchstart', onActivity, { passive: true });

  setInterval(() => {
    // 1. Таймер считает ТОЛЬКО когда пользователь находится внутри активной учебной сессии
    if (activeStudyCount <= 0) return;

    // 2. Вкладка не должна быть скрыта
    if (document.hidden) return;

    // 3. Защита от бездействия: если пользователь не прикасался к экрану/клавиатуре > 45 секунд — пауза
    if (Date.now() - lastActivityTime > 45000) return;

    const today = getTodayKey();
    if (globalStats.date !== today) {
      const realCards = getTodayCompletedCardsCount();
      globalStats = {
        date: today,
        activeSeconds: 1,
        cardsDone: realCards,
        correctCount: realCards,
        mistakesCountToday: 0,
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

export function useDayStats(options?: { isStudying?: boolean }) {
  const isStudying = options?.isStudying ?? false;

  const [stats, setLocalStats] = useState<DailyStats>(() => {
    if (typeof window !== 'undefined') {
      const current = loadInitialStats();
      globalStats = current;
      return current;
    }
    return globalStats;
  });

  // Управление активностью учебного таймера
  useEffect(() => {
    initGlobalTimer();

    if (isStudying) {
      activeStudyCount++;
      lastActivityTime = Date.now();
    }

    const listener = (newStats: DailyStats) => setLocalStats(newStats);
    listeners.add(listener);

    return () => {
      listeners.delete(listener);
      if (isStudying) {
        activeStudyCount = Math.max(0, activeStudyCount - 1);
      }
    };
  }, [isStudying]);

  const setStats = (updater: any) => {
    const next = typeof updater === 'function' ? updater(globalStats) : updater;
    globalStats = next;
    notify();
  };

  const recordCardResult = (
    isCorrect: boolean, 
    card: any, 
    options?: { isReviewingMistakes?: boolean }
  ) => {
    let updatedPool = [...(globalStats.mistakesPool || [])];
    
    // Извлекаем идентификаторы карточки надежно
    const cardId = card?.id || card?.card?.id || '';
    const targetWord = (card?.targetWord || card?.card?.targetWord || card?.sentence || '').trim();

    const matchFn = (c: any) => {
      const cId = c?.id || c?.card?.id || '';
      const cWord = (c?.targetWord || c?.card?.targetWord || c?.sentence || '').trim();
      if (cardId && cId && cId === cardId) return true;
      if (targetWord && cWord && cWord.toLowerCase() === targetWord.toLowerCase()) return true;
      return false;
    };

    if (!isCorrect) {
      // Добавляем в банк ошибок (без дубликатов)
      if (!updatedPool.some(matchFn)) {
        const fullCardSnapshot = {
          deckId: card?.deckId || '',
          id: cardId,
          targetWord: targetWord || card?.targetWord || '',
          sentence: card?.sentence || card?.card?.sentence || '',
          translation: card?.translation || card?.card?.translation || '',
          options: card?.options || card?.card?.options || [],
          masteryLevel: card?.masteryLevel ?? card?.card?.masteryLevel ?? 0,
          isArchived: Boolean(card?.isArchived || card?.card?.isArchived),
          baseWordInfo: card?.baseWordInfo || card?.card?.baseWordInfo || '',
          hint: card?.hint || card?.card?.hint || '',
          forms: card?.forms || card?.card?.forms || '',
          card: card?.card || card
        };
        updatedPool.push(fullCardSnapshot);
      }
    } else {
      // При правильном ответе удаляем ТОЛЬКО если находимся в режиме тренировки ошибок!
      if (options?.isReviewingMistakes) {
        updatedPool = updatedPool.filter(c => !matchFn(c));
      }
    }

    const today = getTodayKey();
    const currentActivityCards = getTodayCompletedCardsCount();
    const newCardsDone = Math.max((globalStats.cardsDone || 0) + (isCorrect ? 1 : 0), currentActivityCards);

    const prevMistakesToday = typeof globalStats.mistakesCountToday === 'number'
      ? globalStats.mistakesCountToday
      : (globalStats.mistakesPool?.length || 0);
    const newMistakesToday = isCorrect ? prevMistakesToday : prevMistakesToday + 1;

    const newCorrectCount = Math.max(0, newCardsDone - newMistakesToday);

    globalStats = {
      ...globalStats,
      date: today,
      cardsDone: newCardsDone,
      correctCount: newCorrectCount,
      mistakesCountToday: newMistakesToday,
      mistakesPool: updatedPool
    };
    notify();
  };

  return { stats, setStats, recordCardResult };
}
