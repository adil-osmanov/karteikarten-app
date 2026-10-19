import React, { useState, useEffect, useRef } from 'react';
import { X, Volume2, RotateCcw, BookOpen, Loader2, HelpCircle } from 'lucide-react';

export interface ComprehensionItem {
  id: number;
  statement: string;
  isRichtig: boolean;
  evidence: string;
  explanationRu: string;
}

interface StoryReaderModalProps {
  isOpen: boolean;
  onClose: () => void;
  topic: any;
  storyData: any;
  onRegenerate: () => void;
  isGenerating: boolean;
  language?: string;
  onFeedbackSound?: (correct: boolean) => void;
}

export function StoryReaderModal({
  isOpen,
  onClose,
  topic,
  storyData,
  onRegenerate,
  isGenerating,
  language = 'DE',
  onFeedbackSound
}: StoryReaderModalProps) {
  const [activeSentenceIdx, setActiveSentenceIdx] = useState<number>(0);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [userAnswers, setUserAnswers] = useState<Record<number, boolean>>({});
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

  // Clean audio and reset answers on modal close or new generation
  useEffect(() => {
    if (!isOpen || isGenerating) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setIsPlayingAudio(false);
      setIsLoadingAudio(false);
    }
  }, [isOpen, isGenerating]);

  // Reset active sentence & answers when story data changes
  useEffect(() => {
    setActiveSentenceIdx(0);
    setUserAnswers({});
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

  const comprehension: ComprehensionItem[] = storyData?.comprehension || [];

  const playSound = (correct: boolean) => {
    if (onFeedbackSound) {
      onFeedbackSound(correct);
      return;
    }
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      if (correct) {
        osc.frequency.setValueAtTime(587.33, ctx.currentTime);
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
        osc.start();
        osc.stop(ctx.currentTime + 0.25);
      } else {
        osc.frequency.setValueAtTime(220, ctx.currentTime);
        osc.frequency.setValueAtTime(164.81, ctx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
        osc.start();
        osc.stop(ctx.currentTime + 0.25);
      }
    } catch (e) {}
  };

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
          ? 'en-US-GuyNeural'
          : (topic?.language || language || 'DE') === 'RU'
          ? 'ru-RU-DmitryNeural'
          : 'de-DE-KillianNeural';

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

  const handleSelectAnswer = (idx: number, choice: boolean) => {
    if (userAnswers[idx] !== undefined) return;
    setUserAnswers(prev => ({ ...prev, [idx]: choice }));
    const item = comprehension[idx];
    if (item) {
      const isCorrect = choice === item.isRichtig;
      playSound(isCorrect);
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
          if (isCorrect) navigator.vibrate(40);
          else navigator.vibrate([30, 40, 30]);
        } catch (e) {}
      }
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
        className="w-full max-w-3xl h-[86vh] rounded-[32px] bg-zinc-900/95 border border-white/10 p-6 sm:p-8 shadow-2xl backdrop-blur-2xl text-white flex flex-col relative animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Apple Header */}
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
              onClick={() => {
                setUserAnswers({});
                onRegenerate();
              }}
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

        {/* Scrollable area: Article + Goethe/telc Richtig/Falsch Block */}
        <div className="flex-1 overflow-y-auto py-6 pr-2 space-y-8 select-text">
          {isGenerating ? (
            <div className="h-full flex flex-col items-center justify-center text-zinc-500 space-y-3 py-24">
              <Loader2 className="w-6 h-6 animate-spin text-sky-400" />
              <p className="text-xs font-medium">Schreibe Artikel & Fragen...</p>
            </div>
          ) : (
            <>
              {/* Story text with clickable sentence translation */}
              <div className="space-y-6 text-[17px] leading-[1.85] font-normal tracking-normal text-zinc-200">
                {paragraphs.map((p: any, pIdx: number) => (
                  <p key={pIdx}>
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
                ))}
              </div>

              {/* Leseverständnis: Richtig oder Falsch block */}
              {comprehension.length > 0 && (
                <div className="pt-8 border-t border-white/[0.08] space-y-5">
                  <div className="flex items-center gap-2">
                    <HelpCircle className="w-4 h-4 text-sky-400" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                      Leseverständnis • Richtig oder Falsch?
                    </span>
                  </div>

                  <div className="space-y-4">
                    {comprehension.map((item, idx) => {
                      const userChoice = userAnswers[idx];
                      const isAnswered = userChoice !== undefined;

                      return (
                        <div
                          key={item.id || idx}
                          className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-4 sm:p-5 space-y-3.5"
                        >
                          <p className="text-[15px] font-medium text-zinc-100 leading-snug">
                            {idx + 1}. {item.statement}
                          </p>

                          {/* Pill action buttons */}
                          <div className="flex items-center gap-2.5">
                            {/* Richtig Button */}
                            <button
                              type="button"
                              disabled={isAnswered}
                              onClick={() => handleSelectAnswer(idx, true)}
                              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-medium border transition-all active:scale-95 cursor-pointer ${
                                !isAnswered
                                  ? 'bg-white/[0.04] hover:bg-white/[0.08] border-white/10 text-zinc-300'
                                  : item.isRichtig
                                  ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 font-semibold shadow-[0_0_12px_rgba(16,185,129,0.15)]'
                                  : userChoice === true
                                  ? 'bg-rose-500/20 border-rose-500/50 text-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.15)]'
                                  : 'bg-white/[0.02] border-transparent text-zinc-600 opacity-40'
                              }`}
                            >
                              ✓ Richtig
                            </button>

                            {/* Falsch Button */}
                            <button
                              type="button"
                              disabled={isAnswered}
                              onClick={() => handleSelectAnswer(idx, false)}
                              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-medium border transition-all active:scale-95 cursor-pointer ${
                                !isAnswered
                                  ? 'bg-white/[0.04] hover:bg-white/[0.08] border-white/10 text-zinc-300'
                                  : !item.isRichtig
                                  ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 font-semibold shadow-[0_0_12px_rgba(16,185,129,0.15)]'
                                  : userChoice === false
                                  ? 'bg-rose-500/20 border-rose-500/50 text-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.15)]'
                                  : 'bg-white/[0.02] border-transparent text-zinc-600 opacity-40'
                              }`}
                            >
                              ✕ Falsch
                            </button>
                          </div>

                          {/* Evidence & Explanation */}
                          {isAnswered && (
                            <div className="pt-2 text-xs text-zinc-400 space-y-1.5 border-t border-white/[0.04] animate-in fade-in duration-200">
                              {item.evidence && (
                                <p className="text-zinc-300 italic leading-relaxed">
                                  <strong className="text-zinc-400 font-medium not-italic">Beleg im Text:</strong> «{item.evidence}»
                                </p>
                              )}
                              {item.explanationRu && (
                                <p className="text-zinc-400 leading-relaxed">
                                  💡 {item.explanationRu}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Apple Quick-Translate Bottom Card */}
        <div className="shrink-0 pt-3 border-t border-white/[0.08]">
          <div className="rounded-2xl bg-zinc-800/70 border border-white/10 p-4 backdrop-blur-xl shadow-xl flex items-start gap-3">
            <div className="w-6 h-6 rounded-lg bg-white/10 flex items-center justify-center text-[10px] font-bold text-zinc-200 shrink-0 mt-0.5">
              RU
            </div>
            <p className="text-[15px] font-normal text-zinc-100 leading-relaxed">
              {currentSentence?.translation || 'Нажмите на любое предложение выше, чтобы увидеть его перевод.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
