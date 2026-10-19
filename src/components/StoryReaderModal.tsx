import React, { useState, useEffect } from 'react';
import { X, Volume2, VolumeX, RotateCcw, BookOpen, Sparkles } from 'lucide-react';

export interface StorySentence {
  text: string;
  translation: string;
}

export interface StoryParagraph {
  sentences: StorySentence[];
}

export interface StoryGlossaryItem {
  word: string;
  baseWord?: string;
  hint: string;
}

export interface StoryData {
  title: string;
  paragraphs: StoryParagraph[];
  glossary: StoryGlossaryItem[];
}

interface StoryReaderModalProps {
  isOpen: boolean;
  onClose: () => void;
  topic: any;
  storyData: StoryData | null;
  onRegenerate: () => void;
  isGenerating: boolean;
  language?: string;
}

export function StoryReaderModal({
  isOpen,
  onClose,
  topic,
  storyData,
  onRegenerate,
  isGenerating,
  language = 'DE'
}: StoryReaderModalProps) {
  const [activeSentence, setActiveSentence] = useState<string | null>(null);
  const [activeTooltip, setActiveTooltip] = useState<{ word: string; hint: string; x: number; y: number } | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (!isOpen) return;

    const prevOverflow = document.body.style.overflow;
    const prevTouchAction = document.body.style.touchAction;
    const prevOverscroll = document.body.style.overscrollBehavior;

    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    document.body.style.overscrollBehavior = 'none';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.touchAction = prevTouchAction;
      document.body.style.overscrollBehavior = prevOverscroll;
      window.removeEventListener('keydown', handleKeyDown);
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, [isOpen, onClose]);

  // Clean audio on close
  useEffect(() => {
    if (!isOpen && typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setIsPlayingAudio(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const topicTitle = storyData?.title || topic?.name || topic?.title || 'Lesetext';
  const langCode = (topic?.language || language || 'DE').toUpperCase();

  const handlePlayAudio = () => {
    if (!storyData || typeof window === 'undefined' || !window.speechSynthesis) return;

    if (isPlayingAudio) {
      window.speechSynthesis.cancel();
      setIsPlayingAudio(false);
      return;
    }

    const fullText = storyData.paragraphs
      ?.flatMap((p: any) => p.sentences?.map((s: any) => s.text))
      .filter(Boolean)
      .join(' ');

    if (!fullText) return;

    const utterance = new SpeechSynthesisUtterance(fullText);
    if (langCode === 'EN') utterance.lang = 'en-US';
    else if (langCode === 'RU') utterance.lang = 'ru-RU';
    else utterance.lang = 'de-DE';

    utterance.rate = 0.9;
    utterance.onend = () => setIsPlayingAudio(false);
    utterance.onerror = () => setIsPlayingAudio(false);

    setIsPlayingAudio(true);
    window.speechSynthesis.speak(utterance);
  };

  const renderSentenceWithGlossary = (sentence: StorySentence) => {
    const text = sentence?.text || '';
    const glossary = storyData?.glossary || [];

    return (
      <span
        onClick={() => setActiveSentence(sentence.translation)}
        className="cursor-pointer hover:bg-black/[0.04] dark:hover:bg-white/[0.06] rounded px-1 py-0.5 transition-colors inline"
        title="Нажмите, чтобы увидеть перевод предложения"
      >
        {text.split(/(\s+|[,.:;!?"«»—]+)/).map((part: string, idx: number) => {
          const clean = part.trim().toLowerCase();
          if (!clean) return <span key={idx}>{part}</span>;

          const match = glossary.find((g: StoryGlossaryItem) => {
            const gw = (g.word || '').trim().toLowerCase();
            const gbw = (g.baseWord || '').trim().toLowerCase();
            return (
              gw === clean ||
              gbw === clean ||
              (clean.length > 3 && (gw.startsWith(clean) || clean.startsWith(gw)))
            );
          });

          if (match) {
            return (
              <span
                key={idx}
                onMouseEnter={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setActiveTooltip({
                    word: match.baseWord || match.word,
                    hint: match.hint,
                    x: rect.left + rect.width / 2,
                    y: rect.top - 36
                  });
                }}
                onMouseLeave={() => setActiveTooltip(null)}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveSentence(sentence.translation);
                  const rect = e.currentTarget.getBoundingClientRect();
                  setActiveTooltip({
                    word: match.baseWord || match.word,
                    hint: match.hint,
                    x: rect.left + rect.width / 2,
                    y: rect.top - 36
                  });
                }}
                className="text-sky-600 dark:text-sky-400 font-semibold underline decoration-sky-500/40 underline-offset-4 cursor-pointer hover:text-sky-500 dark:hover:text-sky-300 transition-colors"
              >
                {part}
              </span>
            );
          }
          return <span key={idx}>{part}</span>;
        })}
      </span>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/40 dark:bg-black/70 backdrop-blur-md animate-in fade-in duration-200 select-none overscroll-contain touch-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[88vh] rounded-[32px] bg-white/95 dark:bg-zinc-900/95 border border-black/[0.08] dark:border-white/10 p-6 sm:p-8 shadow-2xl backdrop-blur-2xl text-zinc-900 dark:text-white flex flex-col relative animate-in zoom-in-95 duration-200 font-sans"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Шапка ридера */}
        <div className="flex items-center justify-between pb-4 border-b border-black/[0.06] dark:border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-500 dark:text-sky-400 shadow-sm">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                {topicTitle}
              </h3>
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
                Контекстное чтение • Наведи на слово для перевода
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={handlePlayAudio}
              disabled={isGenerating || !storyData}
              className={`w-8 h-8 rounded-full border border-black/[0.06] dark:border-white/10 flex items-center justify-center transition active:scale-95 cursor-pointer ${
                isPlayingAudio
                  ? 'bg-sky-500 text-white shadow-sm'
                  : 'bg-black/[0.04] dark:bg-white/5 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-black/[0.08] dark:hover:bg-white/10'
              }`}
              title={isPlayingAudio ? 'Остановить аудио' : 'Слушать историю'}
            >
              {isPlayingAudio ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>

            <button
              onClick={onRegenerate}
              disabled={isGenerating}
              className="w-8 h-8 rounded-full bg-black/[0.04] dark:bg-white/5 hover:bg-black/[0.08] dark:hover:bg-white/10 border border-black/[0.06] dark:border-white/10 flex items-center justify-center text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition active:scale-95 disabled:opacity-50 cursor-pointer"
              title="Сгенерировать заново"
            >
              <RotateCcw className={`w-3.5 h-3.5 text-sky-500 dark:text-sky-400 ${isGenerating ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-black/[0.04] dark:bg-white/5 hover:bg-black/[0.08] dark:hover:bg-white/10 border border-black/[0.06] dark:border-white/10 flex items-center justify-center text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition active:scale-95 ml-1 cursor-pointer"
              title="Закрыть"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Тело истории */}
        <div className="flex-1 overflow-y-auto my-5 pr-2 space-y-4 font-sans text-base sm:text-lg leading-relaxed text-zinc-800 dark:text-zinc-200 select-text">
          {isGenerating ? (
            <div className="py-20 flex flex-col items-center justify-center text-zinc-500 space-y-3">
              <div className="relative">
                <RotateCcw className="w-8 h-8 animate-spin text-sky-500" />
                <Sparkles className="w-4 h-4 text-amber-400 absolute -top-1 -right-1 animate-pulse" />
              </div>
              <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                ИИ создает живой связный сюжет из слов темы...
              </p>
            </div>
          ) : storyData?.paragraphs && storyData.paragraphs.length > 0 ? (
            storyData.paragraphs.map((p: StoryParagraph, pIdx: number) => (
              <p key={pIdx} className="indent-3 sm:indent-4">
                {p.sentences?.map((s: StorySentence, sIdx: number) => (
                  <React.Fragment key={sIdx}>
                    {renderSentenceWithGlossary(s)}{' '}
                  </React.Fragment>
                ))}
              </p>
            ))
          ) : (
            <div className="py-16 text-center text-zinc-500 text-sm">
              Нет сгенерированной истории. Нажмите «Сгенерировать заново».
            </div>
          )}
        </div>

        {/* Нижняя плашка перевода предложения */}
        <div className="pt-3.5 border-t border-black/[0.06] dark:border-white/10 min-h-[52px] flex items-center justify-between text-xs text-zinc-600 dark:text-zinc-400 bg-black/[0.02] dark:bg-white/[0.02] -mx-6 sm:-mx-8 -mb-6 sm:-mb-8 px-6 sm:px-8 py-3.5 rounded-b-[32px]">
          <span className="italic leading-normal">
            {activeSentence
              ? `«${activeSentence}»`
              : 'Нажмите на любое предложение, чтобы увидеть перевод всей фразы целиком.'}
          </span>
        </div>

        {/* Всплывающий тултип над словом */}
        {activeTooltip && (
          <div
            className="fixed z-[70] px-3.5 py-1.5 rounded-xl bg-white/95 dark:bg-zinc-800/95 border border-black/[0.08] dark:border-white/15 shadow-2xl backdrop-blur-xl text-xs font-medium text-zinc-900 dark:text-zinc-100 pointer-events-none -translate-x-1/2 animate-in fade-in zoom-in-95 duration-150"
            style={{ left: activeTooltip.x, top: activeTooltip.y }}
          >
            {activeTooltip.hint}
          </div>
        )}
      </div>
    </div>
  );
}
