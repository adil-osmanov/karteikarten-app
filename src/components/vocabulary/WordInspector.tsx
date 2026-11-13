'use client';

import React, { useMemo, useState } from 'react';
import { Volume2, X } from 'lucide-react';
import { playGermanSpeech, stopAllGermanSpeech, type Flashcard } from '@/app/page';
import type { MatrixCEFRLevel, MasteredWordEntry } from '@/hooks/useWortschatzMatrix';
import type { WordTier } from '@/lib/vocabulary/wordFamilies';
import { getMemoryStrengthSegments, WORD_EVOLUTION_BY_ID } from '@/lib/vocabulary/wordFamilies';
import { splitSeparableWord } from '@/lib/utils/formatSeparableWord';
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll';

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
  relatedWords?: EnrichedMasteredWord[];
  onSelectWord?: (wordKey: string) => void;
  onClose: () => void;
}

export function renderDelicateWord(word: string, forms?: string | null): React.ReactNode {
  if (!word || typeof word !== 'string') return word;

  const normalizedForSplit = word.replace(/[•\u2506\u250A·]/g, '|');
  const parts = splitSeparableWord(normalizedForSplit, forms);

  const coreNode = parts.isSeparable ? (
    <>
      {parts.prefixPart}<span className="text-neutral-400 dark:text-white/30 font-normal select-none px-[0.5px]" aria-hidden="true">·</span>{parts.stemPart}
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

/**
 * Strips duplicated Russian translations from grammatical forms (e.g.
 * "die Personalplanung, -en — кадровое планирование" -> "die Personalplanung, -en").
 */
export function sanitizeGrammarForms(rawForms: string | null, translation?: string): string | null {
  if (!rawForms || typeof rawForms !== 'string') return null;
  let cleaned = rawForms.trim();
  if (!cleaned) return null;

  // Strip trailing Russian segment separated by em/en dash or hyphen
  const dashSplit = cleaned.split(/\s+[—–]\s+/);
  if (dashSplit.length >= 2) {
    cleaned = dashSplit[0].trim();
  }

  // Strip " - <Russian>" while preserving German ending markers like "-en"
  cleaned = cleaned.replace(/\s+-\s+.*[а-яА-ЯёЁ].*$/u, '').trim();

  // Strip standalone trailing Russian gloss in parentheses
  cleaned = cleaned.replace(/\s*\([^)]*[а-яА-ЯёЁ][^)]*\)\s*$/u, '').trim();

  if (translation) {
    const cleanTrans = translation.trim().toLowerCase();
    if (cleanTrans && cleaned.toLowerCase().endsWith(cleanTrans)) {
      cleaned = cleaned.slice(0, cleaned.length - cleanTrans.length).replace(/[\s—–-]+$/, '').trim();
    }
  }

  if (!cleaned || /[а-яА-ЯёЁ]/u.test(cleaned)) {
    return null;
  }

  return cleaned;
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

function buildFilledWordForSentence(rawWord: string, precedingText: string): string {
  const cleanWord = rawWord.replace(/[|·•\u2506\u250A]/g, '').replace(/\s+/g, ' ').trim();
  const prevHasArticle = /\b(der|die|das|ein|eine|einen|einem|einer|eines|dem|den|des)\s*$/i.test(
    precedingText
  );
  if (prevHasArticle) {
    return cleanWord.replace(/^(der|die|das|ein|eine)\s+/i, '');
  }
  return cleanWord;
}

function renderCompletedSentence(sentence: string, word: string): {
  node: React.ReactNode;
  plainTextForSpeech: string;
} {
  const blankRegex = /(_{2,}|\[\s*_{2,}\s*\])/g;
  if (!blankRegex.test(sentence)) {
    return { node: sentence, plainTextForSpeech: sentence };
  }

  blankRegex.lastIndex = 0;
  const parts = sentence.split(blankRegex);
  const plainParts: string[] = [];

  const nodes = parts.map((part, idx) => {
    if (idx % 2 === 1) {
      const prevChunk = parts[idx - 1] || '';
      const filled = buildFilledWordForSentence(word, prevChunk);
      plainParts.push(filled);
      return (
        <span key={idx} className="text-amber-200 font-medium">
          {filled}
        </span>
      );
    }
    plainParts.push(part);
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });

  return {
    node: <>{nodes}</>,
    plainTextForSpeech: plainParts.join(''),
  };
}

export const WordInspector: React.FC<WordInspectorProps> = ({
  item,
  relatedWords = [],
  onSelectWord,
  onClose,
}) => {
  const [speakingTarget, setSpeakingTarget] = useState<'word' | 'sentence' | null>(null);

  useLockBodyScroll(Boolean(item));

  const cleanForms = useMemo(
    () => (item ? sanitizeGrammarForms(item.forms, item.translation) : null),
    [item]
  );

  const cleanSentence = item?.sentence
    ? item.sentence.replace(/[|·•\u2506\u250A]/g, '').trim()
    : null;

  const completedSentence = useMemo(() => {
    if (!cleanSentence || !item) return null;
    return renderCompletedSentence(cleanSentence, item.word);
  }, [cleanSentence, item]);

  if (!item) return null;

  const rankMeta = WORD_EVOLUTION_BY_ID[item.tier] ?? WORD_EVOLUTION_BY_ID.basis;
  const segmentsFilled = getMemoryStrengthSegments(item.intervalDays);
  const reviewCountdown = formatReviewCountdown(item.nextReviewDate, item.intervalDays);

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
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overscroll-none"
      onClick={onClose}
    >
      <div
        data-testid="word-inspector"
        className="w-full max-w-md rounded-3xl bg-[#141417] border border-white/10 p-7 shadow-2xl relative text-left select-text max-h-[90dvh] overflow-y-auto overscroll-contain"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={item.word.replace(/[|·•\u2506\u250A]/g, '')}
      >
        {/* Top Row: Quiet CEFR + Evolution Rank Badge & Close */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <span
            data-testid="inspector-rank-badge"
            className="text-xs font-medium inline-flex items-center gap-1.5"
          >
            <span className="text-neutral-400">{item.level}</span>
            <span className="text-white/20">·</span>
            <span className={`inline-flex items-center gap-1.5 ${rankMeta.inspectorTextClass}`}>
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${rankMeta.dotClass}`} aria-hidden="true" />
              <span>{rankMeta.inspectorLabel}</span>
            </span>
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
          <h3
            lang="de"
            className="text-2xl font-semibold tracking-tight text-white break-words leading-snug hyphens-auto"
          >
            {renderDelicateWord(item.word, cleanForms)}
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

        {/* Grammatical Forms (clean, without duplicate translation) */}
        {cleanForms && (
          <p className="text-[13px] text-neutral-500 mt-1.5 leading-relaxed">
            {cleanForms}
          </p>
        )}

        {/* Thin Divider + Completed Quote Sentence */}
        {completedSentence && (
          <>
            <div className="border-t border-white/[0.06] my-5" />
            <div className="flex items-start justify-between gap-3">
              <div className="border-l-2 border-white/15 pl-3.5 text-[15px] text-neutral-300 leading-relaxed flex-1 min-w-0">
                <p>{completedSentence.node}</p>
                {item.sentenceTranslation && (
                  <p className="mt-1.5 text-[13px] text-neutral-500 leading-relaxed">
                    {item.sentenceTranslation}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleSpeak(completedSentence.plainTextForSpeech, 'sentence')}
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

        {/* Clickable Related Words Row (Wortfamilie) */}
        {relatedWords.length > 0 && onSelectWord && (
          <div
            data-testid="inspector-wortfamilie"
            className="mt-5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-neutral-500"
          >
            <span className="text-neutral-500 mr-0.5">Wortfamilie:</span>
            {relatedWords.slice(0, 6).map((rel, idx) => (
              <React.Fragment key={rel.key}>
                {idx > 0 && <span className="text-white/20">·</span>}
                <button
                  type="button"
                  onClick={() => {
                    stopAllGermanSpeech();
                    setSpeakingTarget(null);
                    onSelectWord(rel.key);
                  }}
                  className="text-neutral-300 hover:text-white underline decoration-white/15 hover:decoration-white/50 underline-offset-4 transition-colors cursor-pointer"
                >
                  {renderDelicateWord(rel.word, rel.forms)}
                </button>
              </React.Fragment>
            ))}
          </div>
        )}

        {/* Bottom Divider & Compact Meta Row + 4-Segment Progress Bar */}
        <div className="border-t border-white/[0.06] mt-5 pt-4">
          <div className="text-xs text-neutral-500 flex items-center justify-between gap-3">
            <span className="truncate">{item.sourceLabel}</span>
            <span className="shrink-0 tabular-nums">{reviewCountdown}</span>
          </div>
          <div className="grid grid-cols-4 gap-1.5 mt-2.5">
            {[1, 2, 3, 4].map((seg) => (
              <div
                key={seg}
                className={`h-1 rounded-full transition-all ${
                  seg <= segmentsFilled ? rankMeta.segmentClass : 'bg-white/[0.08]'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
