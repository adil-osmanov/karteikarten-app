'use client';

import React, { useMemo, useState } from 'react';
import {
  Sparkles,
  Volume2,
  Square,
  Eye,
  EyeOff,
  RotateCcw,
  ArrowLeft,
  Loader2,
} from 'lucide-react';
import { playGermanSpeech, stopAllGermanSpeech } from '@/app/page';
import type { EnrichedMasteredWord } from './WordInspector';

export interface GeneratedContextStory {
  germanText: string;
  russianTranslation: string;
  usedWords: string[];
  source?: 'ai' | 'fallback';
}

export interface ContextStoryPanelProps {
  story: GeneratedContextStory | null;
  isLoading: boolean;
  sourceWords: EnrichedMasteredWord[];
  onRegenerate: () => void;
  onClose: () => void;
}

export const ContextStoryPanel: React.FC<ContextStoryPanelProps> = ({
  story,
  isLoading,
  sourceWords,
  onRegenerate,
  onClose,
}) => {
  const [showTranslation, setShowTranslation] = useState(false);
  const [isSpeakingText, setIsSpeakingText] = useState(false);
  const [activeGloss, setActiveGloss] = useState<{ word: string; translation: string } | null>(null);

  const glossByToken = useMemo(() => {
    const map = new Map<string, { word: string; translation: string }>();
    sourceWords.forEach((sw) => {
      const clean = sw.word.replace(/[|·•\u2506\u250A]/g, '').trim();
      const tokens = clean
        .toLowerCase()
        .replace(/^(der|die|das|ein|eine|sich)\s+/i, '')
        .split(/\s+/)
        .filter((t) => t.length >= 3);
      tokens.forEach((t) => {
        map.set(t, { word: clean, translation: sw.translation || '—' });
        if (t.length >= 6) {
          map.set(t.slice(0, -1), { word: clean, translation: sw.translation || '—' });
        }
      });
    });
    if (story?.usedWords) {
      story.usedWords.forEach((uw) => {
        const lower = uw.toLowerCase().trim();
        if (!map.has(lower)) {
          const matched = sourceWords.find((sw) =>
            sw.word.replace(/[|·•\u2506\u250A]/g, '').toLowerCase().includes(lower)
          );
          if (matched) {
            map.set(lower, {
              word: uw,
              translation: matched.translation || '—',
            });
          }
        }
      });
    }
    return map;
  }, [sourceWords, story?.usedWords]);

  const highlightMatchers = useMemo(() => {
    const candidates = new Set<string>();
    sourceWords.forEach((sw) => {
      const clean = sw.word
        .replace(/[|·•\u2506\u250A]/g, '')
        .replace(/^(der|die|das|ein|eine|sich)\s+/i, '')
        .trim();
      if (clean.length >= 3) candidates.add(clean);
      const lastTok = clean.split(/\s+/).pop() || '';
      if (lastTok.length >= 4) candidates.add(lastTok);
    });
    (story?.usedWords || []).forEach((w) => {
      const clean = String(w || '').trim();
      if (clean.length >= 3) candidates.add(clean);
    });
    return Array.from(candidates).sort((a, b) => b.length - a.length);
  }, [sourceWords, story?.usedWords]);

  const renderedSegments = useMemo(() => {
    if (!story?.germanText) return [];
    if (highlightMatchers.length === 0) return [{ text: story.germanText, match: null }];

    const escaped = highlightMatchers.map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const regex = new RegExp(`(${escaped.join('|')}[a-zäöüß]*)`, 'gi');
    const parts = story.germanText.split(regex);

    return parts.filter(Boolean).map((part) => {
      const lower = part.toLowerCase();
      const hit =
        glossByToken.get(lower) ||
        Array.from(glossByToken.entries()).find(([k]) => lower.startsWith(k) || k.startsWith(lower))?.[1] ||
        null;
      const isHighlight = Boolean(
        hit ||
          highlightMatchers.some((m) => lower === m.toLowerCase() || (m.length >= 5 && lower.startsWith(m.toLowerCase().slice(0, -1))))
      );
      return {
        text: part,
        match: isHighlight ? hit || { word: part, translation: 'Gelerntes Wort' } : null,
      };
    });
  }, [story?.germanText, highlightMatchers, glossByToken]);

  const handleToggleSpeech = () => {
    if (!story?.germanText) return;
    if (isSpeakingText) {
      stopAllGermanSpeech();
      setIsSpeakingText(false);
      return;
    }
    setIsSpeakingText(true);
    playGermanSpeech(story.germanText, {
      onEnd: () => setIsSpeakingText(false),
    }).catch(() => {
      setIsSpeakingText(false);
    });
  };

  return (
    <div
      data-testid="context-story-panel"
      className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 scrollbar-thin scrollbar-thumb-neutral-700/50 scrollbar-track-transparent"
    >
      {/* Navigation + Title */}
      <div className="flex flex-wrap items-center justify-between gap-3">
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
          <span>Zurück zum Mosaik</span>
        </button>

        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gradient-to-r from-amber-400/15 via-blue-500/15 to-purple-500/15 border border-amber-400/25 text-[11px] font-medium text-amber-200">
          <Sparkles className="w-3 h-3 text-amber-400" />
          <span>KI-Kontexttext</span>
        </div>
      </div>

      {/* Loading state */}
      {isLoading ? (
        <div className="py-16 px-4 rounded-3xl bg-white/[0.025] border border-white/[0.08] flex flex-col items-center justify-center gap-3 text-center">
          <Loader2 className="w-7 h-7 text-amber-400 animate-spin" />
          <p className="text-sm font-medium text-neutral-200">Kontexttext wird erstellt...</p>
          <p className="text-xs text-neutral-500 max-w-sm">
            Ein natürlicher deutscher Text wird aus deinen gelernten Wörtern zusammengestellt.
          </p>
        </div>
      ) : story ? (
        <div className="space-y-4">
          {/* Reading Surface */}
          <div className="p-5 sm:p-6 rounded-3xl bg-gradient-to-b from-amber-400/[0.05] to-[#121216] border border-amber-400/20 shadow-[0_0_32px_rgba(251,191,36,0.05)] space-y-4">
            <p className="text-base sm:text-[17px] leading-[1.75] text-neutral-100 font-normal">
              {renderedSegments.map((seg, idx) =>
                seg.match ? (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setActiveGloss(seg.match!);
                      playGermanSpeech(seg.text).catch(() => {});
                    }}
                    className="inline px-1.5 py-0.5 mx-0.5 rounded-lg bg-amber-400/15 hover:bg-amber-400/25 border border-amber-400/30 text-amber-200 font-medium transition-colors cursor-pointer"
                    title={seg.match.translation}
                  >
                    {seg.text}
                  </button>
                ) : (
                  <React.Fragment key={idx}>{seg.text}</React.Fragment>
                )
              )}
            </p>

            {/* Clicked highlighted word mini-gloss */}
            {activeGloss && (
              <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-2xl bg-black/40 border border-amber-400/25 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-semibold text-amber-300 truncate">{activeGloss.word}</span>
                  <span className="text-neutral-500">—</span>
                  <span className="text-neutral-200 truncate">{activeGloss.translation}</span>
                </div>
                <button
                  type="button"
                  onClick={() => playGermanSpeech(activeGloss.word).catch(() => {})}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-300 cursor-pointer shrink-0"
                  aria-label="Wort vorlesen"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Collapsible Russian translation for self-check */}
            {showTranslation && (
              <div className="pt-3 border-t border-white/[0.08]">
                <p className="text-sm leading-relaxed text-neutral-400">
                  {story.russianTranslation}
                </p>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleToggleSpeech}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
                isSpeakingText
                  ? 'bg-blue-500/20 border-blue-400/40 text-blue-300'
                  : 'bg-white/[0.06] border-white/10 text-neutral-200 hover:bg-white/10'
              }`}
            >
              {isSpeakingText ? <Square className="w-3.5 h-3.5 fill-current" /> : <Volume2 className="w-3.5 h-3.5" />}
              <span>{isSpeakingText ? 'Stoppen' : 'Vorlesen'}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowTranslation((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium bg-white/[0.06] border border-white/10 text-neutral-200 hover:bg-white/10 transition-colors cursor-pointer"
            >
              {showTranslation ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span>{showTranslation ? 'Übersetzung ausblenden' : 'Übersetzung einblenden'}</span>
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
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium bg-amber-400/15 border border-amber-400/30 text-amber-200 hover:bg-amber-400/25 transition-colors cursor-pointer ml-auto"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Neu generieren</span>
            </button>
          </div>

          {/* Used word chips */}
          <div className="pt-1 space-y-2">
            <div className="text-[11px] text-neutral-500">
              Verwendete Wörter (zum Nachschlagen antippen)
            </div>
            <div className="flex flex-wrap gap-1.5">
              {sourceWords.map((sw) => {
                const clean = sw.word.replace(/[|·•\u2506\u250A]/g, '').trim();
                return (
                  <button
                    key={sw.key}
                    type="button"
                    onClick={() => {
                      setActiveGloss({ word: clean, translation: sw.translation || '—' });
                      playGermanSpeech(clean).catch(() => {});
                    }}
                    className="px-2.5 py-1 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs text-neutral-300 transition-colors cursor-pointer"
                  >
                    {clean}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
