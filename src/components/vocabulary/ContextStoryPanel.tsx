'use client';

import React, { useMemo, useState } from 'react';
import { Volume2, Square, ArrowLeft, Loader2, X } from 'lucide-react';
import { playGermanSpeech, stopAllGermanSpeech } from '@/app/page';

export interface StoryUsedWordItem {
  lemma: string;
  surfaceForm: string;
  translation: string;
}

export interface GeneratedContextStory {
  title: string;
  paragraphs: string[];
  russianTranslation: string;
  usedWords: StoryUsedWordItem[];
  source?: 'ai' | 'fallback';
}

export interface ContextStoryPanelProps {
  story: GeneratedContextStory | null;
  isLoading: boolean;
  onRegenerate: () => void;
  onClose: () => void;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const ContextStoryPanel: React.FC<ContextStoryPanelProps> = ({
  story,
  isLoading,
  onRegenerate,
  onClose,
}) => {
  const [showTranslation, setShowTranslation] = useState(false);
  const [isSpeakingText, setIsSpeakingText] = useState(false);
  const [activeGloss, setActiveGloss] = useState<StoryUsedWordItem | null>(null);

  const { glossBySurface, highlightRegex } = useMemo(() => {
    const map = new Map<string, StoryUsedWordItem>();
    const forms: string[] = [];

    for (const uw of story?.usedWords || []) {
      const surface = String(uw?.surfaceForm || '').trim();
      if (surface.length < 2) continue;
      const lower = surface.toLowerCase();
      if (!map.has(lower)) {
        map.set(lower, {
          lemma: String(uw.lemma || surface).trim(),
          surfaceForm: surface,
          translation: String(uw.translation || '—').trim(),
        });
        forms.push(surface);
      }
    }

    if (forms.length === 0) {
      return { glossBySurface: map, highlightRegex: null as RegExp | null };
    }

    const sorted = [...forms].sort((a, b) => b.length - a.length).map(escapeRegExp);
    const regex = new RegExp(
      `(?<![\\p{L}\\p{N}])(${sorted.join('|')})(?![\\p{L}\\p{N}])`,
      'giu'
    );

    return { glossBySurface: map, highlightRegex: regex };
  }, [story?.usedWords]);

  const handleToggleSpeech = () => {
    if (!story?.paragraphs?.length) return;
    if (isSpeakingText) {
      stopAllGermanSpeech();
      setIsSpeakingText(false);
      return;
    }
    const fullText = `${story.title}. ${story.paragraphs.join(' ')}`;
    setIsSpeakingText(true);
    playGermanSpeech(fullText, {
      onEnd: () => setIsSpeakingText(false),
    }).catch(() => {
      setIsSpeakingText(false);
    });
  };

  const renderParagraph = (paragraph: string, pIdx: number) => {
    if (!highlightRegex) {
      return <p key={pIdx}>{paragraph}</p>;
    }

    const segments = paragraph.split(highlightRegex);
    return (
      <p key={pIdx}>
        {segments.map((segment, sIdx) => {
          if (!segment) return null;
          const match = glossBySurface.get(segment.toLowerCase());
          if (!match) {
            return <React.Fragment key={sIdx}>{segment}</React.Fragment>;
          }

          return (
            <button
              key={sIdx}
              type="button"
              onClick={() => {
                setActiveGloss(match);
                playGermanSpeech(segment).catch(() => {});
              }}
              className="text-amber-300 border-b border-amber-400/40 cursor-pointer hover:bg-amber-400/10 rounded px-0.5 transition inline"
            >
              {segment}
            </button>
          );
        })}
      </p>
    );
  };

  return (
    <div
      data-testid="context-story-panel"
      className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 sm:px-8 pt-6 pb-10 scrollbar-thin scrollbar-thumb-neutral-700/50 scrollbar-track-transparent"
    >
      <div className="max-w-2xl mx-auto flex flex-col">
        {/* Top Minimal Back Navigation */}
        <div className="mb-6">
          <button
            type="button"
            onClick={() => {
              stopAllGermanSpeech();
              setIsSpeakingText(false);
              onClose();
            }}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-400 hover:text-white transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Mosaik</span>
          </button>
        </div>

        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-center">
            <Loader2 className="w-6 h-6 text-neutral-400 animate-spin" />
            <p className="text-sm text-neutral-300">Geschichte wird geschrieben...</p>
          </div>
        ) : story ? (
          <div className="flex-1 flex flex-col">
            {/* Title */}
            <h2 className="text-xl font-semibold text-white mb-4 tracking-tight">
              {story.title}
            </h2>

            {/* Story Paragraphs */}
            <div className="text-[16px] sm:text-[17px] leading-[1.75] text-neutral-200 space-y-4">
              {story.paragraphs.map((p, idx) => renderParagraph(p, idx))}
            </div>

            {/* Compact Popover Card for Clicked Target Word */}
            {activeGloss && (
              <div
                data-testid="story-word-popover"
                className="mt-5 flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-[#18181D] border border-white/10 shadow-lg"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-amber-300 truncate">
                    {activeGloss.lemma}
                  </div>
                  <div className="text-xs text-neutral-300 mt-0.5 truncate">
                    {activeGloss.translation}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => playGermanSpeech(activeGloss.lemma).catch(() => {})}
                    className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 flex items-center justify-center text-neutral-200 cursor-pointer transition-colors"
                    aria-label="Wort vorlesen"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveGloss(null)}
                    className="w-8 h-8 rounded-full hover:bg-white/[0.08] flex items-center justify-center text-neutral-400 hover:text-white cursor-pointer transition-colors"
                    aria-label="Hinweis schließen"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Collapsible Russian Translation */}
            {showTranslation && (
              <div
                data-testid="story-translation-box"
                className="mt-6 pt-5 border-t border-white/[0.07]"
              >
                <p className="text-sm sm:text-[15px] leading-relaxed text-neutral-400">
                  {story.russianTranslation}
                </p>
              </div>
            )}

            {/* Minimal Bottom Action Bar: 3 clean buttons */}
            <div className="mt-8 pt-5 border-t border-white/[0.07] flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={handleToggleSpeech}
                className={`px-3.5 py-2 rounded-xl text-xs font-medium border transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
                  isSpeakingText
                    ? 'bg-white/15 border-white/25 text-white'
                    : 'bg-white/[0.05] border-white/[0.08] text-neutral-200 hover:bg-white/[0.1]'
                }`}
              >
                {isSpeakingText ? (
                  <Square className="w-3.5 h-3.5 fill-current" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5" />
                )}
                <span>{isSpeakingText ? 'Stoppen' : 'Vorlesen'}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowTranslation((v) => !v)}
                className={`px-3.5 py-2 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
                  showTranslation
                    ? 'bg-white/15 border-white/25 text-white'
                    : 'bg-white/[0.05] border-white/[0.08] text-neutral-200 hover:bg-white/[0.1]'
                }`}
              >
                Übersetzung
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveGloss(null);
                  setShowTranslation(false);
                  stopAllGermanSpeech();
                  setIsSpeakingText(false);
                  onRegenerate();
                }}
                className="px-3.5 py-2 rounded-xl text-xs font-medium bg-white/[0.05] border border-white/[0.08] text-neutral-200 hover:bg-white/[0.1] transition-colors cursor-pointer ml-auto"
              >
                Neue Geschichte
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
