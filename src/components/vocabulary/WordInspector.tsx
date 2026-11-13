'use client';

import React, { useState } from 'react';
import { Volume2, X } from 'lucide-react';
import { playGermanSpeech, type Flashcard } from '@/app/page';
import type { MatrixCEFRLevel, MasteredWordEntry } from '@/hooks/useWortschatzMatrix';
import type { WordTier } from '@/lib/vocabulary/wordFamilies';
import { getMemoryStrengthSegments } from '@/lib/vocabulary/wordFamilies';
import { splitSeparableWord } from '@/lib/utils/formatSeparableWord';

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

const TIER_LABEL: Record<WordTier, string> = {
  gold: 'Gold',
  silber: 'Silber',
  graphit: 'Graphit',
};

const TIER_SEGMENT_CLASS: Record<WordTier, string> = {
  gold: 'bg-amber-400',
  silber: 'bg-slate-300/80',
  graphit: 'bg-white/35',
};

export function renderDelicateWord(word: string, forms?: string | null): React.ReactNode {
  if (!word || typeof word !== 'string') return word;

  const normalizedForSplit = word.replace(/[•\u2506\u250A·]/g, '|');
  const parts = splitSeparableWord(normalizedForSplit, forms);

  const coreNode = parts.isSeparable ? (
    <>
      {parts.prefixPart}
      <span className="text-white/25 mx-[1px] select-none" aria-hidden="true">
        ·
      </span>
      {parts.stemPart}
    </>
  ) : (
    parts.cleanWord
  );

  if (parts.leadingText || parts.trailingText) {
    return (
      <>
        {parts.leadingText ? `${parts.leadingText} ` : ''}
        {coreNode}
        {parts.trailingText ? ` ${parts.trailingText}` : ''}
      </>
    );
  }

  return coreNode;
}

function formatReviewCountdown(nextReviewDate: string | number | null, intervalDays: number): string {
  if (nextReviewDate) {
    const targetMs =
      typeof nextReviewDate === 'number'
        ? nextReviewDate
        : new Date(nextReviewDate).getTime();
    if (Number.isFinite(targetMs) && targetMs > 0) {
      const diffMs = targetMs - Date.now();
      if (diffMs <= 0) return 'Heute fällig';
      const days = Math.ceil(diffMs / 86_400_000);
      return `Wiederholung in ${days} ${days === 1 ? 'Tag' : 'Tagen'}`;
    }
  }
  if (intervalDays > 0) {
    return `Wiederholung in ${intervalDays} ${intervalDays === 1 ? 'Tag' : 'Tagen'}`;
  }
  return 'Langzeit-Archiv';
}

export const WordInspector: React.FC<WordInspectorProps> = ({
  item,
  onClose,
  onQuickPractice,
}) => {
  const [speakingTarget, setSpeakingTarget] = useState<'word' | 'sentence' | null>(null);

  if (!item) return null;

  const segmentsFilled = getMemoryStrengthSegments(item.intervalDays);
  const reviewCountdown = formatReviewCountdown(item.nextReviewDate, item.intervalDays);
  const cleanSentence = item.sentence ? item.sentence.replace(/[|·•\u2506\u250A]/g, '').trim() : null;

  const handleSpeak = (text: string, target: 'word' | 'sentence') => {
    const cleanText = text.replace(/[|·•\u2506\u250A]/g, '').trim();
    setSpeakingTarget(target);
    playGermanSpeech(cleanText, {
      onEnd: () => setSpeakingTarget((curr) => (curr === target ? null : curr)),
    }).catch(() => {
      setSpeakingTarget(null);
    });
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        data-testid="word-inspector"
        className="w-full max-w-md rounded-3xl bg-[#141417] border border-white/10 p-7 shadow-2xl relative text-left select-text max-h-[90dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={item.word.replace(/[|·•\u2506\u250A]/g, '')}
      >
        {/* Top Row: Quiet Badge + Single Close */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <span className="text-xs text-neutral-400">
            {item.level} · {TIER_LABEL[item.tier]}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
            title="Schließen (Esc)"
            aria-label="Inspektor schließen"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Word + Round Audio Button */}
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-2xl font-semibold tracking-tight text-white break-words leading-snug">
            {renderDelicateWord(item.word, item.forms)}
          </h3>
          <button
            type="button"
            onClick={() => handleSpeak(item.word, 'word')}
            className={`w-10 h-10 rounded-full flex items-center justify-center border transition-all cursor-pointer shrink-0 ${
              speakingTarget === 'word'
                ? 'bg-white/15 border-white/25 text-white scale-95'
                : 'bg-white/[0.06] border-white/10 text-neutral-300 hover:text-white hover:bg-white/10'
            }`}
            title="Vorlesen"
            aria-label="Wort vorlesen"
          >
            <Volume2 className="w-4 h-4" />
          </button>
        </div>

        {/* Russian Translation */}
        <p className="text-[17px] text-neutral-200 mt-2 leading-snug">
          {item.translation || '—'}
        </p>

        {/* Grammatical Forms */}
        {item.forms && (
          <p className="text-[13px] text-neutral-500 mt-1 leading-relaxed">
            {item.forms}
          </p>
        )}

        {/* Thin Divider + Clean Quote Sentence */}
        {cleanSentence && (
          <>
            <div className="border-t border-white/[0.06] my-5" />
            <div className="flex items-start justify-between gap-3">
              <div className="border-l-2 border-white/15 pl-3.5 text-[15px] text-neutral-300 leading-relaxed flex-1 min-w-0">
                <p>{cleanSentence}</p>
                {item.sentenceTranslation && (
                  <p className="mt-1.5 text-[13px] text-neutral-500 leading-relaxed">
                    {item.sentenceTranslation}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleSpeak(cleanSentence, 'sentence')}
                className={`w-8 h-8 rounded-full flex items-center justify-center border transition-all cursor-pointer shrink-0 mt-0.5 ${
                  speakingTarget === 'sentence'
                    ? 'bg-white/15 border-white/25 text-white'
                    : 'bg-white/[0.05] border-white/[0.08] text-neutral-400 hover:text-white hover:bg-white/10'
                }`}
                title="Beispiel vorlesen"
                aria-label="Beispiel vorlesen"
              >
                <Volume2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </>
        )}

        {/* Compact Meta Row + 4-Segment Progress Bar */}
        <div className="mt-6">
          <div className="text-xs text-neutral-500 flex items-center justify-between gap-3">
            <span className="truncate">{item.sourceLabel}</span>
            <span className="shrink-0">{reviewCountdown}</span>
          </div>
          <div className="grid grid-cols-4 gap-1.5 mt-2.5">
            {[1, 2, 3, 4].map((seg) => (
              <div
                key={seg}
                className={`h-1 rounded-full transition-all ${
                  seg <= segmentsFilled ? TIER_SEGMENT_CLASS[item.tier] : 'bg-white/[0.08]'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Primary Action */}
        <button
          type="button"
          onClick={() => onQuickPractice(item)}
          className="w-full mt-5 py-3 rounded-2xl bg-white text-black font-medium text-sm hover:bg-neutral-200 transition cursor-pointer"
        >
          Jetzt üben
        </button>
      </div>
    </div>
  );
};
