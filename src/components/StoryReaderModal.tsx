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
  const [activeSentenceIdx, setActiveSentenceIdx] = useState<number | null>(0);
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

  // Озвучка через Microsoft TTS
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
      ?.filter(Boolean)
      ?.join(' ');

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

  // Собираем плоский список предложений для удобного перевода
  const allSentences = storyData?.paragraphs?.flatMap((p: any) => p.sentences) || [];
  const currentTranslation = activeSentenceIdx !== null && allSentences[activeSentenceIdx]
    ? allSentences[activeSentenceIdx].translation
    : 'Нажмите на любое предложение, чтобы увидеть его перевод.';

  let sentenceCounter = 0;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200 select-none"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-xl h-[80vh] rounded-[32px] bg-zinc-900/95 border border-white/10 p-7 shadow-2xl backdrop-blur-2xl text-white flex flex-col relative animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Шапка Apple Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/[0.08] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-zinc-300">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-[15px] font-semibold tracking-tight text-zinc-100">
                {storyData?.title || topic?.name || topic?.title || 'Lesetext'}
              </h3>
              <p className="text-[11px] text-zinc-500 font-medium">Режим чтения</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePlayMicrosoftTTS}
              disabled={isLoadingAudio || !storyData}
              className={`h-8 px-3 rounded-full border border-white/10 flex items-center gap-1.5 text-xs font-medium transition active:scale-95 cursor-pointer ${
                isPlayingAudio ? 'bg-white text-zinc-900 border-white font-semibold' : 'bg-white/5 text-zinc-300 hover:text-white hover:bg-white/10'
              }`}
            >
              {isLoadingAudio ? <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400" /> : <Volume2 className="w-3.5 h-3.5" />}
              <span>{isPlayingAudio ? 'Pause' : 'Vorlesen'}</span>
            </button>

            <button
              onClick={onRegenerate}
              disabled={isGenerating}
              className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition active:scale-95 disabled:opacity-50 cursor-pointer"
              title="Neu generieren"
            >
              <RotateCcw className={`w-3.5 h-3.5 text-zinc-400 ${isGenerating ? 'animate-spin' : ''}`} />
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

        {/* Тело текста в стиле Apple Lyrics / Transcript */}
        <div className="flex-1 overflow-y-auto py-6 pr-2 pb-16 space-y-6 text-[17px] leading-[1.8] font-normal tracking-wide select-text">
          {isGenerating ? (
            <div className="h-full flex flex-col items-center justify-center text-zinc-500 space-y-3">
              <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
              <p className="text-xs font-medium">Generiere Text...</p>
            </div>
          ) : (
            storyData?.paragraphs?.map((p: any, pIdx: number) => (
              <p key={pIdx} className="space-x-1">
                {p.sentences?.map((s: any) => {
                  const currentIdx = sentenceCounter++;
                  const isSelected = activeSentenceIdx === currentIdx;
                  return (
                    <span
                      key={currentIdx}
                      onClick={() => setActiveSentenceIdx(currentIdx)}
                      className={`cursor-pointer transition-colors duration-200 inline ${
                        isSelected 
                          ? 'text-white font-medium drop-shadow-sm' 
                          : 'text-zinc-500 hover:text-zinc-300'
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

        {/* Лаконичная строка перевода внизу (Apple Subtitle) */}
        <div className="h-12 border-t border-white/[0.06] flex items-center px-2 text-xs text-zinc-400 italic shrink-0">
          <span className="truncate">
            {currentTranslation ? `«${currentTranslation}»` : ''}
          </span>
        </div>
      </div>
    </div>
  );
}
