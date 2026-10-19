import React, { useState, useEffect, useRef } from 'react';
import { X, Volume2, RotateCcw, BookOpen, Loader2, Sparkles, User, Info } from 'lucide-react';

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
  const [activeLineIdx, setActiveLineIdx] = useState<number>(0);
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

  // Reset active replica to 0 when story data changes
  useEffect(() => {
    setActiveLineIdx(0);
  }, [storyData]);

  if (!isOpen) return null;

  // Support both dialogue array and legacy paragraphs format
  const dialogue = storyData?.dialogue || (
    storyData?.paragraphs ? storyData.paragraphs.flatMap((p: any) => p.sentences?.map((s: any) => ({
      speaker: 'Erzähler',
      avatar: 'EZ',
      text: s.text,
      translation: s.translation,
      highlightWords: []
    }))) : []
  );

  const currentLine = dialogue[activeLineIdx] || dialogue[0];

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

    const fullDialogueText = dialogue.map((d: any) => `${d.speaker || ''}: ${d.text || ''}`).join(' ');
    if (!fullDialogueText) return;

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
        body: JSON.stringify({ text: fullDialogueText, voice })
      });

      if (!res.ok) throw new Error('TTS failed');

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

  const renderHighlightedText = (text: string, highlightWords: string[] = []) => {
    if (!highlightWords || highlightWords.length === 0) return text;
    const escaped = highlightWords.filter(Boolean).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (escaped.length === 0) return text;
    const regex = new RegExp(`(${escaped.join('|')})`, 'gi');
    const parts = text.split(regex);

    return parts.map((part, i) => {
      const isMatch = highlightWords.some(w => w && w.toLowerCase() === part.toLowerCase());
      if (isMatch) {
        return (
          <span key={i} className="px-2 py-0.5 mx-0.5 rounded-lg bg-sky-500/15 border border-sky-400/30 text-sky-200 font-medium inline-block">
            {part}
          </span>
        );
      }
      return part;
    });
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/75 backdrop-blur-md animate-in fade-in duration-200 select-none"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-4xl h-[86vh] rounded-[32px] bg-zinc-900/95 border border-white/10 p-6 sm:p-8 shadow-2xl backdrop-blur-2xl text-white flex flex-col relative animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Apple Minimalist Header (Только иконки) */}
        <div className="flex items-center justify-between pb-4 border-b border-white/[0.08] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-zinc-300">
              <BookOpen className="w-4 h-4" />
            </div>
            <h3 className="text-base sm:text-lg font-semibold tracking-tight text-zinc-100">
              {storyData?.title || topic?.name || topic?.title || 'Praxis-Szene'}
            </h3>
          </div>

          <div className="flex items-center gap-2">
            {/* Озвучка: только иконка */}
            <button
              onClick={handlePlayTTS}
              disabled={isLoadingAudio}
              className={`w-8 h-8 rounded-full border border-white/10 flex items-center justify-center transition active:scale-95 cursor-pointer ${
                isPlayingAudio ? 'bg-white text-zinc-900 border-white' : 'bg-white/5 text-zinc-300 hover:text-white hover:bg-white/10'
              }`}
              title="Vorlesen"
            >
              {isLoadingAudio ? <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>

            {/* Перегенерация: только иконка */}
            <button
              onClick={onRegenerate}
              disabled={isGenerating}
              className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition active:scale-95 disabled:opacity-50 cursor-pointer"
              title="Neu generieren"
            >
              <RotateCcw className={`w-3.5 h-3.5 text-sky-400 ${isGenerating ? 'animate-spin' : ''}`} />
            </button>

            {/* Закрыть: только иконка */}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition active:scale-95 ml-1 cursor-pointer"
              title="Schließen"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Тело сценария: просторное, с хорошим скроллом */}
        <div className="flex-1 overflow-y-auto py-5 pr-2 space-y-4 select-text">
          {isGenerating ? (
            <div className="h-full flex flex-col items-center justify-center text-zinc-500 space-y-3 py-20">
              <Loader2 className="w-7 h-7 animate-spin text-sky-400" />
              <p className="text-sm font-medium">Создаём сценарий диалога...</p>
            </div>
          ) : (
            <>
              {/* Callout ситуации в стиле Теории */}
              {storyData?.situation && (
                <div className="rounded-2xl bg-sky-500/10 border border-sky-500/20 p-4 flex items-start gap-3">
                  <div className="w-6 h-6 rounded-lg bg-sky-500/20 flex items-center justify-center text-sky-400 shrink-0 mt-0.5">
                    <Sparkles className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-sky-400 block mb-0.5">Situation</span>
                    <p className="text-sm text-sky-100/90 leading-relaxed">
                      {storyData.situation}
                    </p>
                  </div>
                </div>
              )}

              {/* Карточки реплик диалога */}
              <div className="space-y-3 pt-1">
                {dialogue.map((item: any, idx: number) => {
                  const isSelected = activeLineIdx === idx;
                  return (
                    <div
                      key={idx}
                      onClick={() => setActiveLineIdx(idx)}
                      className={`group p-4 rounded-2xl border transition-all duration-200 cursor-pointer flex items-start gap-4 ${
                        isSelected
                          ? 'bg-zinc-800/90 border-sky-500/40 shadow-lg shadow-sky-500/5 ring-1 ring-sky-500/20'
                          : 'bg-zinc-850/40 hover:bg-zinc-800/50 border-white/[0.05]'
                      }`}
                    >
                      {/* Аватар говорящего */}
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-semibold shrink-0 transition-colors ${
                        isSelected 
                          ? 'bg-sky-500 text-white shadow-sm' 
                          : 'bg-white/5 text-zinc-400 group-hover:text-zinc-200 group-hover:bg-white/10'
                      }`}>
                        {item.avatar || item.speaker?.slice(0, 2).toUpperCase() || <User className="w-4 h-4" />}
                      </div>

                      {/* Текст реплики */}
                      <div className="flex-1">
                        <span className="text-xs font-semibold text-zinc-400 block mb-1">
                          {item.speaker}
                        </span>
                        <p className={`text-[16px] sm:text-[17px] leading-relaxed ${
                          isSelected ? 'text-white' : 'text-zinc-200'
                        }`}>
                          {renderHighlightedText(item.text, item.highlightWords)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Блок практического правила в стиле Теории */}
              {storyData?.keyTakeaway && (
                <div className="p-4 rounded-2xl bg-zinc-800/40 border border-white/5 flex items-center gap-3">
                  <Info className="w-4 h-4 text-zinc-400 shrink-0" />
                  <p className="text-xs text-zinc-300">
                    <strong className="text-zinc-100 mr-1.5 font-medium">Praxis-Tipp:</strong> 
                    {storyData.keyTakeaway}
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Крупная карточка перевода Apple Translate */}
        <div className="shrink-0 pt-3 border-t border-white/[0.08]">
          <div className="rounded-2xl bg-zinc-800/70 border border-white/10 p-4 backdrop-blur-xl shadow-xl flex items-start gap-3">
            <div className="w-6 h-6 rounded-lg bg-white/10 flex items-center justify-center text-[10px] font-bold text-zinc-200 shrink-0 mt-0.5">
              RU
            </div>
            <div className="flex-1">
              <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider block mb-0.5">
                {currentLine?.speaker ? `Перевод • ${currentLine.speaker}` : 'Перевод'}
              </span>
              <p className="text-[15px] font-normal text-zinc-100 leading-relaxed">
                {currentLine?.translation || 'Нажмите на любую реплику выше, чтобы увидеть её перевод.'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
