import React, { useState, useEffect, useRef } from 'react';
import { X, Volume2, RotateCcw, BookOpen, Loader2 } from 'lucide-react';

interface StoryReaderModalProps {
  isOpen: boolean;
  onClose: () => void;
  topic: any;
  storyData: any;
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
  const [activeSentenceIdx, setActiveSentenceIdx] = useState<number | null>(null);
  const [activeTranslation, setActiveTranslation] = useState<string | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [isOpen, onClose]);

  // Clean audio on close
  useEffect(() => {
    if (!isOpen || isGenerating) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setIsPlayingAudio(false);
      setIsLoadingAudio(false);
    }
  }, [isOpen, isGenerating]);

  if (!isOpen) return null;

  const handlePlayMicrosoftTTS = async () => {
    if (isPlayingAudio && audioRef.current) {
      audioRef.current.pause();
      setIsPlayingAudio(false);
      return;
    }

    if (audioRef.current && audioRef.current.src && audioRef.current.currentTime > 0 && !audioRef.current.ended) {
      audioRef.current.play();
      setIsPlayingAudio(true);
      return;
    }

    const fullText = storyData?.paragraphs
      ?.flatMap((p: any) => p.sentences?.map((s: any) => s.text))
      .filter(Boolean)
      .join(' ');

    if (!fullText) return;

    try {
      setIsLoadingAudio(true);
      const voice = (topic?.language || language || 'DE') === 'EN' 
        ? 'en-US-JennyNeural' 
        : (topic?.language || language || 'DE') === 'RU' 
          ? 'ru-RU-SvetlanaNeural' 
          : 'de-DE-KatjaNeural';

      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: fullText, voice })
      });

      if (!res.ok) throw new Error('TTS Failed');

      const blob = await res.blob();
      const audioUrl = URL.createObjectURL(blob);

      if (audioRef.current) {
        audioRef.current.src = audioUrl;
      } else {
        audioRef.current = new Audio(audioUrl);
      }

      audioRef.current.onended = () => setIsPlayingAudio(false);
      audioRef.current.onerror = () => {
        setIsPlayingAudio(false);
        setIsLoadingAudio(false);
      };

      await audioRef.current.play();
      setIsPlayingAudio(true);
    } catch (err) {
      console.error('Ошибка TTS:', err);
      setIsPlayingAudio(false);
    } finally {
      setIsLoadingAudio(false);
    }
  };

  const focusWords = React.useMemo(() => {
    const rawList: string[] = [];
    if (Array.isArray(storyData?.glossary)) {
      storyData.glossary.forEach((g: any) => {
        const item = g.baseWord || g.word;
        if (item && typeof item === 'string') rawList.push(item.trim());
      });
    }
    if (rawList.length === 0 && Array.isArray(topic?.cards)) {
      topic.cards.forEach((c: any) => {
        if (c.targetWord && typeof c.targetWord === 'string') rawList.push(c.targetWord.trim());
      });
    }
    return Array.from(new Set(rawList.filter(Boolean))).slice(0, 16);
  }, [storyData, topic]);

  let sentenceCounter = 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200 select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] rounded-[32px] bg-white/95 dark:bg-zinc-900/95 border border-black/[0.08] dark:border-white/10 p-6 sm:p-8 shadow-2xl backdrop-blur-2xl text-zinc-900 dark:text-white flex flex-col relative animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Шапка ридера */}
        <div className="flex items-center justify-between pb-5 border-b border-black/[0.08] dark:border-white/[0.08]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 flex items-center justify-center text-zinc-700 dark:text-zinc-300">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                {storyData?.title || topic?.name || topic?.title || 'Lesetext'}
              </h3>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium mt-0.5">
                Нажмите на любое предложение для перевода
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePlayMicrosoftTTS}
              disabled={isLoadingAudio || !storyData}
              className={`h-8 px-3 rounded-xl border border-black/10 dark:border-white/10 flex items-center gap-1.5 text-xs font-medium transition active:scale-95 cursor-pointer ${
                isPlayingAudio
                  ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-semibold shadow-sm'
                  : 'bg-black/5 dark:bg-white/5 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-black/10 dark:hover:bg-white/10'
              }`}
            >
              {isLoadingAudio ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-500 dark:text-zinc-400" />
              ) : (
                <Volume2 className="w-3.5 h-3.5" />
              )}
              <span>{isPlayingAudio ? 'Pause' : 'Vorlesen'}</span>
            </button>

            <button
              onClick={onRegenerate}
              disabled={isGenerating}
              className="w-8 h-8 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-black/10 dark:border-white/10 flex items-center justify-center text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition active:scale-95 disabled:opacity-50 cursor-pointer"
              title="Пересоздать историю"
            >
              <RotateCcw className={`w-3.5 h-3.5 text-sky-500 dark:text-sky-400 ${isGenerating ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-black/10 dark:border-white/10 flex items-center justify-center text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition active:scale-95 ml-1 cursor-pointer"
              title="Закрыть"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Тело книги (Apple Books Style) */}
        <div className="flex-1 overflow-y-auto my-4 pr-3 pt-2 pb-10 space-y-6 text-left select-text">
          {isGenerating ? (
            <div className="py-24 flex flex-col items-center justify-center text-zinc-500 space-y-3">
              <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
              <p className="text-xs font-medium">Создаём связный текст...</p>
            </div>
          ) : (
            storyData?.paragraphs?.map((p: any, pIdx: number) => (
              <p key={pIdx} className="text-left text-zinc-800 dark:text-zinc-200 text-[16px] sm:text-[17px] leading-[1.8] font-normal tracking-normal">
                {p.sentences?.map((s: any) => {
                  const currentIdx = sentenceCounter++;
                  const isSelected = activeSentenceIdx === currentIdx;
                  return (
                    <span
                      key={currentIdx}
                      onClick={() => {
                        setActiveSentenceIdx(currentIdx);
                        setActiveTranslation(s.translation);
                      }}
                      className={`transition-all duration-150 mr-1.5 rounded-lg px-1.5 py-0.5 cursor-pointer ${
                        isSelected
                          ? 'bg-black/[0.08] dark:bg-white/[0.08] text-zinc-950 dark:text-white font-medium'
                          : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.04]'
                      }`}
                    >
                      {s.text}
                    </span>
                  );
                })}
              </p>
            ))
          )}
        </div>

        {/* Нижняя панель: Fokus-Wörter + перевод предложения */}
        <div className="pt-3 border-t border-black/[0.08] dark:border-white/[0.08] space-y-2.5">
          {focusWords.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium">Fokus:</span>
              {focusWords.map((w: string) => (
                <span
                  key={w}
                  className="px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 text-[11px] text-zinc-700 dark:text-zinc-300 font-medium select-text"
                >
                  {w}
                </span>
              ))}
            </div>
          )}

          <div className="min-h-[52px] flex items-center px-4 py-3 rounded-2xl bg-black/[0.02] dark:bg-white/[0.02] border border-black/5 dark:border-white/5 text-sm text-zinc-800 dark:text-zinc-300">
            {activeTranslation ? (
              <span className="italic leading-relaxed text-zinc-900 dark:text-zinc-100">
                «{activeTranslation}»
              </span>
            ) : (
              <span className="text-zinc-400 dark:text-zinc-500 text-xs font-medium">
                Нажмите на предложение в тексте, чтобы увидеть его русский перевод.
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
