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
  const [activeSentenceIdx, setActiveSentenceIdx] = useState<number>(0);
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

  // Reset active sentence to 0 when story data changes
  useEffect(() => {
    setActiveSentenceIdx(0);
  }, [storyData]);

  if (!isOpen) return null;

  // Support both paragraphs format and legacy dialogue format
  const paragraphs: Array<{ sentences?: Array<{ text: string; translation: string }> }> =
    storyData?.paragraphs ||
    (storyData?.dialogue
      ? [
          {
            sentences: storyData.dialogue.map((d: any) => ({
              text: d.text,
              translation: d.translation
            }))
          }
        ]
      : []);

  const handlePlayTTS = async () => {
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

    const fullText = paragraphs
      ?.flatMap((p: any) => p.sentences?.map((s: any) => s.text))
      ?.filter(Boolean)
      ?.join(' ');

    if (!fullText) return;

    try {
      setIsLoadingAudio(true);
      const voice =
        (topic?.language || language || 'DE') === 'EN'
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

  const allSentences = paragraphs.flatMap((p: any) => p.sentences || []);
  const currentSentence = allSentences[activeSentenceIdx] || allSentences[0];

  let sentenceCounter = 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/75 backdrop-blur-md animate-in fade-in duration-200 select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl h-[84vh] rounded-[32px] bg-zinc-900/95 border border-white/10 p-6 sm:p-8 shadow-2xl backdrop-blur-2xl text-white flex flex-col relative animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Шапка: Safari Reader Style */}
        <div className="flex items-center justify-between pb-4 border-b border-white/[0.08] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-zinc-300">
              <BookOpen className="w-4 h-4" />
            </div>
            <h3 className="text-base sm:text-lg font-semibold tracking-tight text-zinc-100">
              {storyData?.title || topic?.name || topic?.title || 'Lesetext'}
            </h3>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePlayTTS}
              disabled={isLoadingAudio}
              className={`w-8 h-8 rounded-full border border-white/10 flex items-center justify-center transition active:scale-95 cursor-pointer ${
                isPlayingAudio
                  ? 'bg-white text-zinc-900 border-white'
                  : 'bg-white/5 text-zinc-300 hover:text-white hover:bg-white/10'
              }`}
              title="Vorlesen"
            >
              {isLoadingAudio ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400" />
              ) : (
                <Volume2 className="w-3.5 h-3.5" />
              )}
            </button>

            <button
              onClick={onRegenerate}
              disabled={isGenerating}
              className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition active:scale-95 disabled:opacity-50 cursor-pointer"
              title="Neu generieren"
            >
              <RotateCcw className={`w-3.5 h-3.5 text-sky-400 ${isGenerating ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition active:scale-95 ml-1 cursor-pointer"
              title="Schließen"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Тело статьи: настоящие журнальные абзацы */}
        <div className="flex-1 overflow-y-auto py-6 pr-2 space-y-6 text-[17px] leading-[1.85] font-normal tracking-normal select-text">
          {isGenerating ? (
            <div className="h-full flex flex-col items-center justify-center text-zinc-500 space-y-3 py-20">
              <Loader2 className="w-6 h-6 animate-spin text-sky-400" />
              <p className="text-xs font-medium">Schreibe Artikel...</p>
            </div>
          ) : (
            paragraphs.map((p: any, pIdx: number) => (
              <p key={pIdx} className="text-zinc-200">
                {p.sentences?.map((s: any) => {
                  const currentIdx = sentenceCounter++;
                  const isSelected = activeSentenceIdx === currentIdx;
                  return (
                    <span
                      key={currentIdx}
                      onClick={() => setActiveSentenceIdx(currentIdx)}
                      className={`inline cursor-pointer transition-all duration-200 rounded-lg px-1.5 py-0.5 ${
                        isSelected
                          ? 'bg-sky-500/15 text-white border border-sky-400/30 shadow-[0_0_15px_rgba(56,189,248,0.12)]'
                          : 'hover:bg-white/[0.06] text-zinc-200'
                      }`}
                    >
                      {s.text}{' '}
                    </span>
                  );
                })}
              </p>
            ))
          )}
        </div>

        {/* Широкая карточка перевода (Apple Quick-Translate) */}
        <div className="shrink-0 pt-3 border-t border-white/[0.08]">
          <div className="rounded-2xl bg-zinc-800/70 border border-white/10 p-4 backdrop-blur-xl shadow-xl flex items-start gap-3">
            <div className="w-6 h-6 rounded-lg bg-white/10 flex items-center justify-center text-[10px] font-bold text-zinc-200 shrink-0 mt-0.5">
              RU
            </div>
            <p className="text-[15px] font-normal text-zinc-100 leading-relaxed">
              {currentSentence?.translation || 'Нажмите на любое предложение, чтобы увидеть перевод.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
