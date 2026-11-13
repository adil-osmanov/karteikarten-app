'use client';

import React, { useState } from 'react';
import {
  Volume2,
  X,
  ArrowLeft,
  BookOpen,
  Clock,
  Sparkles,
  Shield,
  Layers,
  Play,
} from 'lucide-react';
import { playGermanSpeech, type Flashcard } from '@/app/page';
import type { MatrixCEFRLevel, MasteredWordEntry } from '@/hooks/useWortschatzMatrix';
import type { WordTier } from '@/lib/vocabulary/wordFamilies';
import { getMemoryStrengthSegments } from '@/lib/vocabulary/wordFamilies';
import { formatSeparableWord } from '@/lib/utils/formatSeparableWord';

export interface EnrichedMasteredWord {
  key: string;
  word: string;
  translation: string;
  level: MatrixCEFRLevel;
  masteredAt: number;
  nextReviewDate: string | number | null;
  intervalDays: number;
  repetitions: number;
  tier: WordTier;
  forms: string | null;
  sentence: string | null;
  sentenceTranslation: string | null;
  sourceLabel: string;
  deckId: string | null;
  card: Flashcard | null;
  entry: MasteredWordEntry;
}

export interface WordInspectorProps {
  item: EnrichedMasteredWord | null;
  onClose: () => void;
  onQuickPractice: (item: EnrichedMasteredWord) => void;
}

const TIER_META: Record<
  WordTier,
  {
    statusLabel: string;
    badgeClasses: string;
    accentBarClass: string;
    segmentActiveClass: string;
    icon: React.ReactNode;
  }
> = {
  gold: {
    statusLabel: 'Gold · Langzeitgedächtnis',
    badgeClasses:
      'bg-amber-400/15 text-amber-300 border border-amber-400/35 shadow-[0_0_16px_rgba(251,191,36,0.12)]',
    accentBarClass: 'bg-amber-400',
    segmentActiveClass: 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]',
    icon: <Sparkles className="w-3 h-3 text-amber-400" />,
  },
  silber: {
    statusLabel: 'Silber · Gefestigt',
    badgeClasses: 'bg-slate-300/15 text-slate-200 border border-slate-300/30',
    accentBarClass: 'bg-slate-300',
    segmentActiveClass: 'bg-slate-300 shadow-[0_0_6px_rgba(203,213,225,0.4)]',
    icon: <Shield className="w-3 h-3 text-slate-300" />,
  },
  graphit: {
    statusLabel: 'Graphit · Neu',
    badgeClasses: 'bg-white/[0.06] text-zinc-300 border border-white/15',
    accentBarClass: 'bg-zinc-500',
    segmentActiveClass: 'bg-zinc-400',
    icon: <Layers className="w-3 h-3 text-zinc-400" />,
  },
};

function formatNextReviewCountdown(nextReviewDate: string | number | null): string {
  if (!nextReviewDate) return 'Langzeit-Archiv';
  const targetMs =
    typeof nextReviewDate === 'number'
      ? nextReviewDate
      : new Date(nextReviewDate).getTime();
  if (!Number.isFinite(targetMs) || targetMs <= 0) return 'Langzeit-Archiv';

  const diffMs = targetMs - Date.now();
  if (diffMs <= 0) return 'Heute fällig';

  const days = Math.ceil(diffMs / 86_400_000);
  if (days <= 1) return 'Nächste Wiederholung in 1 Tag';
  return `Nächste Wiederholung in ${days} Tagen`;
}

export const WordInspector: React.FC<WordInspectorProps> = ({
  item,
  onClose,
  onQuickPractice,
}) => {
  const [speakingTarget, setSpeakingTarget] = useState<'word' | 'sentence' | null>(null);

  if (!item) return null;

  const tierMeta = TIER_META[item.tier];
  const segmentsFilled = getMemoryStrengthSegments(item.intervalDays);
  const reviewCountdown = formatNextReviewCountdown(item.nextReviewDate);
  const cleanDisplayWord = formatSeparableWord(item.word);
  const cleanSentence = item.sentence ? item.sentence.replace(/\|/g, '').trim() : null;

  const handleSpeak = (text: string, target: 'word' | 'sentence') => {
    setSpeakingTarget(target);
    playGermanSpeech(text, {
      onEnd: () => setSpeakingTarget((curr) => (curr === target ? null : curr)),
    }).catch(() => {
      setSpeakingTarget(null);
    });
  };

  const inspectorBody = (
    <div className="flex flex-col h-full overflow-hidden text-left select-text">
      {/* Sticky Inspector Header */}
      <div className="px-5 pt-4 pb-3.5 border-b border-white/[0.07] flex items-center justify-between gap-2 shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-400 hover:text-white transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Zurück zum Mosaik</span>
        </button>

        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          title="Inspektor schließen (Esc)"
          aria-label="Inspektor schließen"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5 scrollbar-thin scrollbar-thumb-neutral-700/50 scrollbar-track-transparent">
        {/* 1. Title + TTS + CEFR + Tier Badge */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-white/[0.08] text-neutral-200 border border-white/10 font-mono">
              {item.level}
            </span>
            <span
              className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-0.5 rounded-full ${tierMeta.badgeClasses}`}
            >
              {tierMeta.icon}
              <span>{tierMeta.statusLabel}</span>
            </span>
          </div>

          <div className="flex items-start justify-between gap-3">
            <h3 className="text-2xl font-semibold tracking-tight text-white leading-tight break-words">
              {cleanDisplayWord}
            </h3>
            <button
              type="button"
              onClick={() => handleSpeak(item.word, 'word')}
              className={`p-2.5 rounded-xl border transition-all cursor-pointer shrink-0 ${
                speakingTarget === 'word'
                  ? 'bg-blue-500/20 border-blue-400/50 text-blue-300 scale-95'
                  : 'bg-white/[0.06] border-white/10 text-neutral-300 hover:text-white hover:bg-white/10'
              }`}
              title="Wort vorlesen"
              aria-label="Wort vorlesen"
            >
              <Volume2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 2. Translation & Grammatical Forms */}
        <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.07] space-y-2">
          <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">
            Bedeutung
          </div>
          <div className="text-base font-medium text-neutral-100 leading-snug">
            {item.translation || '—'}
          </div>
          {item.forms && (
            <div className="pt-2 border-t border-white/[0.06]">
              <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500 mb-1">
                Formen
              </div>
              <div className="text-xs text-neutral-300 font-mono leading-relaxed">
                {item.forms}
              </div>
            </div>
          )}
        </div>

        {/* 3. Beispielsatz */}
        {cleanSentence && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                Beispielsatz
              </span>
              <button
                type="button"
                onClick={() => handleSpeak(cleanSentence, 'sentence')}
                className={`inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg border transition-colors cursor-pointer ${
                  speakingTarget === 'sentence'
                    ? 'bg-blue-500/20 border-blue-400/40 text-blue-300'
                    : 'bg-white/[0.05] border-white/10 text-neutral-400 hover:text-white'
                }`}
                title="Beispielsatz vorlesen"
              >
                <Volume2 className="w-3 h-3" />
                <span>Anhören</span>
              </button>
            </div>
            <div className="relative pl-3.5 py-2.5 pr-3 rounded-r-2xl bg-white/[0.025] border border-l-0 border-white/[0.06]">
              <div
                className={`absolute left-0 top-0 bottom-0 w-1 rounded-full ${tierMeta.accentBarClass}`}
              />
              <p className="text-sm text-neutral-100 leading-relaxed">{cleanSentence}</p>
              {item.sentenceTranslation && (
                <p className="mt-1.5 text-xs text-neutral-400 leading-relaxed">
                  {item.sentenceTranslation}
                </p>
              )}
            </div>
          </div>
        )}

        {/* 4. Speicher-Biometrie (SRS-Pass) */}
        <div className="p-3.5 rounded-2xl bg-white/[0.025] border border-white/[0.07] space-y-3">
          <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">
            Speicher-Biometrie
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-neutral-400 shrink-0">
                <BookOpen className="w-3.5 h-3.5 text-neutral-500" />
                Quelle
              </span>
              <span className="text-neutral-200 font-medium text-right truncate max-w-[200px]">
                {item.sourceLabel}
              </span>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-neutral-400 shrink-0">
                <Clock className="w-3.5 h-3.5 text-neutral-500" />
                Status
              </span>
              <span className="text-neutral-200 font-medium text-right">
                {reviewCountdown}
              </span>
            </div>
          </div>

          {/* 4-segment visual memory strength meter */}
          <div className="pt-1 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-neutral-400">
              <span>Gedächtnisstärke</span>
              <span className="font-mono text-neutral-300">
                {item.intervalDays > 0 ? `${item.intervalDays} Tage Intervall` : 'Archiviert'}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {[1, 2, 3, 4].map((seg) => (
                <div
                  key={seg}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    seg <= segmentsFilled ? tierMeta.segmentActiveClass : 'bg-white/[0.08]'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 5. Footer Quick Actions */}
      <div className="p-4 border-t border-white/[0.07] bg-black/20 flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => onQuickPractice(item)}
          className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white text-black hover:bg-neutral-200 active:scale-[0.99] font-semibold text-xs transition-all cursor-pointer shadow-sm"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>Jetzt kurz üben</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop right drawer inspector inside modal */}
      <aside
        data-testid="word-inspector-desktop"
        className="hidden md:flex md:w-[355px] lg:w-[385px] shrink-0 border-l border-white/10 bg-[#111115]/95 backdrop-blur-md flex-col"
      >
        {inspectorBody}
      </aside>

      {/* Mobile native Bottom Sheet overlay */}
      <div className="md:hidden fixed inset-0 z-30 flex items-end justify-center">
        <div
          className="absolute inset-0 bg-black/65 backdrop-blur-sm"
          onClick={onClose}
        />
        <div
          data-testid="word-inspector-mobile"
          className="relative w-full max-h-[84dvh] rounded-t-[28px] bg-[#131317]/98 border-t border-white/15 shadow-[0_-20px_60px_rgba(0,0,0,0.85)] backdrop-blur-xl flex flex-col overflow-hidden pb-[env(safe-area-inset-bottom,12px)]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="pt-2.5 pb-1 flex justify-center shrink-0">
            <div className="w-10 h-1 rounded-full bg-white/20" />
          </div>
          {inspectorBody}
        </div>
      </div>
    </>
  );
};
