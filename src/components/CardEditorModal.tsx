'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Pencil, ChevronDown, ChevronUp } from 'lucide-react';
import type { Flashcard } from '@/app/page';
import type { CEFRLevel } from '@/lib/vocabulary/cefrLevelDetector';

export interface CardEditorModalProps {
  card?: Flashcard | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedCard: Flashcard) => Promise<void> | void;
}

const LEVELS: CEFRLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1'];

export const CardEditorModal: React.FC<CardEditorModalProps> = ({
  card,
  isOpen,
  onClose,
  onSave,
}) => {
  const [sentence, setSentence] = useState(card?.sentence || '');
  const [targetWord, setTargetWord] = useState(card?.targetWord || (card as any)?.front || '');
  const [translation, setTranslation] = useState(card?.translation || (card as any)?.back || '');
  const [selectedLevel, setSelectedLevel] = useState<CEFRLevel | null>((card?.level as CEFRLevel) || null);
  const [forms, setForms] = useState(card?.forms || card?.hint || '');
  const [grammaticalTag, setGrammaticalTag] = useState(card?.baseWordInfo || '');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const targetInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && card) {
      setSentence(card.sentence || '');
      setTargetWord(card.targetWord || (card as any)?.front || '');
      setTranslation(card.translation || (card as any)?.back || '');
      setSelectedLevel((card.level as CEFRLevel) || null);
      setForms(card.forms || card.hint || '');
      setGrammaticalTag(card.baseWordInfo || '');
      setShowAdvanced(Boolean(card.baseWordInfo && card.baseWordInfo.trim().length > 0));

      setTimeout(() => {
        targetInputRef.current?.focus();
      }, 40);
    }
  }, [card, isOpen]);

  const handleSave = useCallback(() => {
    if (!card) return;
    const cleanTarget = targetWord.trim();
    const cleanSentence = sentence.trim();
    if (!cleanTarget && !cleanSentence) return;

    const cleanTranslation = translation.trim();
    const cleanForms = forms.trim();
    const cleanGrammar = grammaticalTag.trim();

    const updatedCardPayload: Flashcard = {
      ...card,
      sentence: cleanSentence,
      targetWord: cleanTarget || card.targetWord,
      translation: cleanTranslation,
      level: selectedLevel || null,
      forms: cleanForms || null,
      hint: cleanForms || null,
      baseWordInfo: cleanGrammar || null,
      updated_at: new Date().toISOString(),
      ...({
        front: cleanTarget || card.targetWord,
        back: cleanTranslation,
        grammaticalTag: cleanGrammar || undefined,
      } as any),
    };

    try {
      // 1. Мгновенно обновляем стейт в родительском компоненте и Zustand (плюс фоновый Write-Through в Supabase)
      Promise.resolve(onSave(updatedCardPayload)).catch((err) => {
        console.error('Failed to save card:', err);
      });

      // 2. Мгновенно закрываем модалку без блокировки интерфейса
      onClose();
    } catch (error) {
      console.error('Failed to save card:', error);
    }
  }, [card, sentence, targetWord, translation, selectedLevel, forms, grammaticalTag, onSave, onClose]);

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
        handleSave();
      } else {
        // Изолируем нажатия клавиш внутри модалки от глобальных хоткеев карточки (Space, Enter, R)
        e.stopPropagation();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, card, handleSave, onClose]);

  if (!isOpen || !card) return null;

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xl animate-in fade-in duration-150 select-none"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="relative w-full max-w-lg p-7 rounded-3xl bg-neutral-900/95 border border-white/10 backdrop-blur-2xl shadow-[0_30px_90px_rgba(0,0,0,0.85)] flex flex-col gap-5 text-left select-text animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="card-editor-title"
      >
        {/* Лаконичная шапка */}
        <div className="flex items-center justify-between pb-3 border-b border-white/5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Pencil className="w-4 h-4" />
            </div>
            <h3 id="card-editor-title" className="text-lg font-semibold tracking-tight text-white">
              Karte bearbeiten
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-neutral-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="Schließen (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Поля ввода */}
        <div className="flex flex-col gap-4">
          {/* Zielwort & Übersetzung в 2 компактные колонки */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-400 tracking-wide block">
                Zielwort
              </label>
              <input
                ref={targetInputRef}
                type="text"
                value={targetWord}
                onChange={(e) => setTargetWord(e.target.value)}
                placeholder="z.B. sich entscheiden, aus|ruhen"
                className="w-full px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-base sm:text-sm text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:border-blue-500/50 transition-colors"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-400 tracking-wide block">
                Übersetzung
              </label>
              <input
                type="text"
                value={translation}
                onChange={(e) => setTranslation(e.target.value)}
                placeholder="Übersetzung..."
                className="w-full px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-base sm:text-sm text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:border-blue-500/50 transition-colors"
              />
            </div>
          </div>

          {/* Beispielsatz */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-neutral-400 tracking-wide block">
              Beispielsatz
            </label>
            <textarea
              value={sentence}
              onChange={(e) => setSentence(e.target.value)}
              rows={2}
              placeholder="Beispielsatz..."
              className="w-full px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-base sm:text-sm text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:border-blue-500/50 resize-none transition-colors"
            />
          </div>

          {/* Сегментированный переключатель уровня (Apple Segmented Control) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-neutral-400 tracking-wide">
                Niveau
              </label>
              {selectedLevel && (
                <button
                  type="button"
                  onClick={() => setSelectedLevel(null)}
                  className="text-[11px] text-neutral-500 hover:text-neutral-300 transition-colors cursor-pointer"
                >
                  Auto
                </button>
              )}
            </div>
            <div className="grid grid-cols-5 p-1 rounded-xl bg-white/[0.03] border border-white/5">
              {LEVELS.map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setSelectedLevel(selectedLevel === lvl ? null : lvl)}
                  className={`py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                    selectedLevel === lvl
                      ? 'bg-white/15 text-white shadow-sm border border-white/10'
                      : 'text-neutral-400 hover:text-neutral-200 border border-transparent'
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>
          </div>

          {/* Formen */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-neutral-400 tracking-wide block">
              Formen
            </label>
            <input
              type="text"
              value={forms}
              onChange={(e) => setForms(e.target.value)}
              placeholder="z.B. übergibt · übergab · hat übergeben"
              className="w-full px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-sm text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:border-blue-500/50 transition-colors"
            />
          </div>

          {/* Спойлер + Erweiterte Optionen для Grammatischer Tag */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced((prev) => !prev)}
              className="inline-flex items-center gap-1 text-xs font-medium text-neutral-500 hover:text-neutral-300 transition-colors cursor-pointer"
            >
              {showAdvanced ? (
                <>
                  <ChevronUp className="w-3.5 h-3.5" />
                  <span>Erweiterte Optionen ausblenden</span>
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5" />
                  <span>+ Erweiterte Optionen</span>
                </>
              )}
            </button>
            {showAdvanced && (
              <div className="mt-2 space-y-1.5">
                <label className="text-xs font-medium text-neutral-400 tracking-wide block">
                  Grammatischer Tag
                </label>
                <input
                  type="text"
                  value={grammaticalTag}
                  onChange={(e) => setGrammaticalTag(e.target.value)}
                  placeholder="z.B. Präposition + Akkusativ"
                  className="w-full px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-base sm:text-sm text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:border-blue-500/50 transition-colors"
                />
              </div>
            )}
          </div>
        </div>

        {/* Футер действий */}
        <div className="flex items-center justify-between pt-3 border-t border-white/5 mt-1">
          <span className="text-[11px] text-neutral-400">⌘ + Enter zum Speichern</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-neutral-300 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
            >
              Abbrechen
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-[0.98] text-xs font-medium text-white transition-all shadow-[0_0_20px_rgba(37,99,235,0.35)] cursor-pointer"
            >
              Speichern
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }
  return modalContent;
};
