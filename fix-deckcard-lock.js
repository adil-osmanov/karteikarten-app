const fs = require('fs');
let code = fs.readFileSync('src/app/page.tsx', 'utf8');

const targetDeckCardClick = `  return (
    <div 
      onClick={() => { initAudioCtx(); onCardClick(deck.id); }}
      className={cn(
        "group cursor-pointer bg-white/80 dark:bg-[#1C1C1E]/70 backdrop-blur-3xl rounded-[28px] p-8 border border-black/[0.08] dark:border-white/[0.08] shadow-sm dark:shadow-[0_10px_30px_rgba(0,0,0,0.5)] transition-colors duration-200 hover:-translate-y-1 active:scale-[0.98] active:translate-y-0 min-h-[160px] flex flex-col relative will-change-transform transform-gpu translate-z-0",
        isCompleted && "opacity-60 hover:opacity-100"
      )}
    >`;

const replaceDeckCardClick = `  return (
    <div 
      onClick={(e) => {
        if (isLocked) {
          e.preventDefault();
          e.stopPropagation();
          if (onLockClick) onLockClick();
          return;
        }
        initAudioCtx(); 
        onCardClick(deck.id); 
      }}
      className={cn(
        "group cursor-pointer bg-white/80 dark:bg-[#1C1C1E]/70 backdrop-blur-3xl rounded-[28px] p-8 border border-black/[0.08] dark:border-white/[0.08] shadow-sm dark:shadow-[0_10px_30px_rgba(0,0,0,0.5)] transition-colors duration-200 hover:-translate-y-1 active:scale-[0.98] active:translate-y-0 min-h-[160px] flex flex-col relative will-change-transform transform-gpu translate-z-0 overflow-hidden",
        isCompleted && "opacity-60 hover:opacity-100",
        isLocked && "opacity-90"
      )}
    >
      {isLocked && (
        <div className="absolute inset-0 z-20 bg-white/60 dark:bg-black/60 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center border border-black/5 dark:border-white/10 rounded-[28px]">
          <div className="w-12 h-12 bg-white dark:bg-white/10 rounded-full flex items-center justify-center shadow-sm mb-3">
            <Lock className="w-5 h-5 text-gray-500 dark:text-gray-300" />
          </div>
          <span className="text-[13px] font-semibold text-gray-900 dark:text-white leading-tight">
            Сначала пройдите предыдущие колоды
          </span>
          <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mt-1 cursor-pointer hover:text-blue-500">
            Нажмите, чтобы открыть PRO
          </span>
        </div>
      )}`;

code = code.replace(targetDeckCardClick, replaceDeckCardClick);

fs.writeFileSync('src/app/page.tsx', code);
console.log('Updated DeckCard lock visualization');
