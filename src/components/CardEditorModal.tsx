'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X, Check, Pencil } from 'lucide-react';
import type { Flashcard } from '@/app/page';
import type { CEFRLevel } from '@/lib/vocabulary/cefrLevelDetector';

export interface CardEditorModalProps {
  card?: Flashcard | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedCard: Flashcard) => Promise<void> | void;
}

export const CardEditorModal: React.FC<CardEditorModalProps> = ({
  card,
  isOpen,
  onClose,
  onSave,
}) => {
  const [sentence, setSentence] = useState(card?.sentence || '');
  const [targetWord, setTargetWord] = useState(card?.targetWord || '');
  const [translation, setTranslation] = useState(card?.translation || '');
  const [baseWordInfo, setBaseWordInfo] = useState(card?.baseWordInfo || '');
  const [forms, setForms] = useState(card?.forms || card?.hint || '');
  const [level, setLevel] = useState<CEFRLevel | null>((card?.level as CEFRLevel) || null);
  const [isSaving, setIsSaving] = useState(false);

  const sentenceTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync internal form state whenever card or isOpen changes
  useEffect(() => {
    if (isOpen && card) {
      setSentence(card.sentence || '');
      setTargetWord(card.targetWord || '');
      setTranslation(card.translation || '');
      setBaseWordInfo(card.baseWordInfo || '');
      setForms(card.forms || card.hint || '');
      setLevel((card.level as CEFRLevel) || null);
      setIsSaving(false);
      
      // Auto-focus sentence input after opening
      setTimeout(() => {
        sentenceTextareaRef.current?.focus();
      }, 50);
    }
  }, [card, isOpen]);

  // Handle ESC and Cmd+Enter shortcuts
  useEffect(() => {
    if (!isOpen || !card) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        handleSubmit();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, card, sentence, targetWord, translation, baseWordInfo, forms, level]);

  if (!isOpen || !card) return null;

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isSaving || !card) return;

    const trimmedSentence = sentence.trim();
    const trimmedTargetWord = targetWord.trim();
    const trimmedTranslation = translation.trim();
    const trimmedBaseWordInfo = baseWordInfo.trim();
    const trimmedForms = forms.trim();

    if (!trimmedTargetWord && !trimmedSentence) {
      return;
    }

    setIsSaving(true);
    try {
      const updatedCard: Flashcard = {
        ...card,
        sentence: trimmedSentence || card.sentence,
        targetWord: trimmedTargetWord || card.targetWord,
        translation: trimmedTranslation || card.translation,
        baseWordInfo: trimmedBaseWordInfo || null,
        forms: trimmedForms || null,
        hint: trimmedForms || null,
        level: level || null,
        updated_at: new Date().toISOString(),
      };

      await onSave(updatedCard);
      onClose();
    } catch (err) {
      console.error('Error saving card:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xl animate-in fade-in duration-200 select-none"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="rounded-3xl bg-white/95 dark:bg-neutral-900/95 border border-neutral-200/60 dark:border-neutral-800 shadow-2xl p-6 max-w-lg w-full scale-100 animate-in zoom-in-95 duration-150 select-text text-left"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="card-editor-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-neutral-100 dark:border-neutral-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Pencil className="w-4 h-4" />
            </div>
            <div>
              <h3 id="card-editor-title" className="text-base font-semibold text-zinc-900 dark:text-white tracking-tight">
                Karte bearbeiten
              </h3>
              <p className="text-xs text-neutral-400 dark:text-neutral-500">
                Sofortige Aktualisierung in der Sitzung und der Datenbank
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            title="Schließen (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* 1. Sentence / Front Text */}
          <div>
            <label className="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">
              Satz / Text des Beispiels (Sentence)
            </label>
            <textarea
              ref={sentenceTextareaRef}
              rows={3}
              value={sentence}
              onChange={(e) => setSentence(e.target.value)}
              placeholder="Beispielsatz mit Lücke oder Wort..."
              className="w-full bg-neutral-100 dark:bg-neutral-800/60 border-0 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/30 outline-none text-zinc-900 dark:text-zinc-100 placeholder:text-neutral-400 font-sans transition-all resize-y min-h-[72px]"
            />
          </div>

          {/* 2. Target Word / Gap */}
          <div>
            <label className="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">
              Zielwort / Lücke (Target Word)
            </label>
            <input
              type="text"
              value={targetWord}
              onChange={(e) => setTargetWord(e.target.value)}
              placeholder="z.B. aus|probieren, aus|statten, die Bestätigung..."
              className="w-full bg-neutral-100 dark:bg-neutral-800/60 border-0 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/30 outline-none text-zinc-900 dark:text-zinc-100 placeholder:text-neutral-400 font-sans transition-all"
            />
          </div>

          {/* 3. CEFR Level Selector */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-medium text-neutral-500 dark:text-neutral-400">
                CEFR-Niveau (Level)
              </label>
              {level && (
                <button
                  type="button"
                  onClick={() => setLevel(null)}
                  className="text-[11px] text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 underline cursor-pointer"
                >
                  Zurücksetzen (Auto)
                </button>
              )}
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {(['A1', 'A2', 'B1', 'B2', 'C1'] as const).map((lvl) => {
                const isSelected = level === lvl;
                return (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setLevel(isSelected ? null : lvl)}
                    className={`py-1.5 px-2 rounded-xl text-xs font-semibold tracking-wide transition-all cursor-pointer border ${
                      isSelected
                        ? lvl === 'A1'
                          ? 'bg-emerald-500 text-white border-emerald-600 shadow-sm shadow-emerald-500/20'
                          : lvl === 'A2'
                          ? 'bg-teal-500 text-white border-teal-600 shadow-sm shadow-teal-500/20'
                          : lvl === 'B1'
                          ? 'bg-blue-600 text-white border-blue-700 shadow-sm shadow-blue-500/20'
                          : lvl === 'B2'
                          ? 'bg-amber-500 text-white border-amber-600 shadow-sm shadow-amber-500/20'
                          : 'bg-purple-600 text-white border-purple-700 shadow-sm shadow-purple-500/20'
                        : 'bg-neutral-100 dark:bg-neutral-800/60 text-neutral-600 dark:text-neutral-300 border-transparent hover:bg-neutral-200/70 dark:hover:bg-neutral-700/60'
                    }`}
                  >
                    {lvl}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. Translation */}
          <div>
            <label className="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">
              Übersetzung (Back / Russian Translation)
            </label>
            <input
              type="text"
              value={translation}
              onChange={(e) => setTranslation(e.target.value)}
              placeholder="Russische Übersetzung..."
              className="w-full bg-neutral-100 dark:bg-neutral-800/60 border-0 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/30 outline-none text-zinc-900 dark:text-zinc-100 placeholder:text-neutral-400 font-sans transition-all"
            />
          </div>

          {/* 4. Grammar Badge / Tag */}
          <div>
            <label className="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">
              Grammatischer Tag / Badge (z.B. Futur I, Präposition + Dativ)
            </label>
            <input
              type="text"
              value={baseWordInfo}
              onChange={(e) => setBaseWordInfo(e.target.value)}
              placeholder="z.B. Futur I -> ausprobieren, sich gewöhnen an + Akk..."
              className="w-full bg-neutral-100 dark:bg-neutral-800/60 border-0 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/30 outline-none text-zinc-900 dark:text-zinc-100 placeholder:text-neutral-400 font-sans transition-all"
            />
          </div>

          {/* 5. Hint / Explanation / Forms */}
          <div>
            <label className="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">
              Hinweis / Formen / Erklärung (Hint & Forms)
            </label>
            <input
              type="text"
              value={forms}
              onChange={(e) => setForms(e.target.value)}
              placeholder="z.B. probiert aus, probierte aus, hat ausprobiert..."
              className="w-full bg-neutral-100 dark:bg-neutral-800/60 border-0 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/30 outline-none text-zinc-900 dark:text-zinc-100 placeholder:text-neutral-400 font-sans transition-all"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-3 mt-4 border-t border-neutral-100 dark:border-neutral-800">
            <span className="text-[11px] text-neutral-400">
              Tipp: <kbd className="px-1.5 py-0.5 rounded bg-neutral-200/60 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 font-mono text-[10px]">⌘</kbd> + <kbd className="px-1.5 py-0.5 rounded bg-neutral-200/60 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 font-mono text-[10px]">Enter</kbd> zum Speichern
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="px-4 py-2 text-sm font-medium text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200 transition-colors cursor-pointer rounded-xl"
              >
                Abbrechen
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl px-5 py-2 text-sm shadow-sm active:scale-98 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isSaving ? (
                  <span>Speichert...</span>
                ) : (
                  <>
                    <Check className="w-4 h-4 stroke-[2.5]" />
                    <span>Speichern</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
