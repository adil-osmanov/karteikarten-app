'use client';

import React from 'react';

export interface TabConfig {
  id: 'textbooks' | 'flashcards' | 'structures';
  label: string;
}

export const TABS_DE: readonly TabConfig[] = [
  { id: 'textbooks', label: 'Lehrbücher' },
  { id: 'flashcards', label: 'Karteikarten' },
  { id: 'structures', label: 'Strukturen & NVV' },
] as const;

export const TABS_RU: readonly TabConfig[] = [
  { id: 'textbooks', label: 'Учебники' },
  { id: 'flashcards', label: 'Флешкарты' },
] as const;

export const TABS_EN: readonly TabConfig[] = [
  { id: 'textbooks', label: 'Textbooks' },
  { id: 'flashcards', label: 'Flashcards' },
] as const;

export const getTabsForLanguage = (lang?: string): readonly TabConfig[] => {
  const normalizedLang = (lang || 'de').toLowerCase();
  if (normalizedLang === 'de') return TABS_DE;
  if (normalizedLang === 'ru') return TABS_RU;
  return TABS_EN;
};

interface CategoryTabsProps {
  activeTab: string;
  onTabChange: (tabId: 'textbooks' | 'flashcards' | 'structures') => void;
  language?: string;
}

export const CategoryTabs = React.memo(function CategoryTabs({
  activeTab,
  onTabChange,
  language = 'de',
}: CategoryTabsProps) {
  const tabs = getTabsForLanguage(language);

  return (
    <div className="w-full flex justify-center mt-4 sm:mt-6 mb-6 sm:mb-8 px-4 select-none">
      <div
        role="tablist"
        aria-label="Kategorien"
        className="relative inline-flex items-center p-1 rounded-full bg-[#E4E4E7] dark:bg-[#161618] border border-black/[0.06] dark:border-white/10 select-none isolate"
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              type="button"
              onClick={() => onTabChange(tab.id)}
              // ЖЕСТКИЕ ПРАВИЛА ПРОТИВ МИГАНИЯ:
              // 1. Никаких смен font-weight, padding, border при hover!
              // 2. Только transition-colors для цвета текста и фонового стекла.
              // 3. Отключен outline и любое изменение масштаба (scale).
              className={`relative px-5 py-1.5 rounded-full text-xs font-medium tracking-tight transition-colors duration-150 outline-none cursor-pointer ${
                isActive
                  ? 'bg-white text-neutral-900 dark:bg-white/15 dark:text-white shadow-sm'
                  : 'text-neutral-600 hover:text-neutral-900 hover:bg-black/[0.04] dark:text-neutral-400 dark:hover:text-neutral-100 dark:hover:bg-white/[0.06]'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
});
