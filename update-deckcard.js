const fs = require('fs');
let code = fs.readFileSync('src/app/page.tsx', 'utf8');

const targetSig = `const DeckCard = React.memo(({ 
  deck, isCompleted, activeTab, onCardClick, onRename, onDelete, onEditTheory, onViewTheory, onStartDictation, onStartShadowing
}: { 
  deck: Deck; isCompleted: boolean; activeTab: string; 
  onCardClick: (id: string) => void; onRename?: (id: string, name: string) => void; 
  onDelete?: (id: string, name: string) => void; 
  onEditTheory?: (id: string) => void; onViewTheory: (id: string) => void; 
  onStartDictation: (id: string) => void;
  onStartShadowing: (id: string) => void;
}) => {
  const total = deck.cards.length;`;

const replaceSig = `const DeckCard = React.memo(({ 
  deck, isCompleted, activeTab, isLocked, onLockClick, onCardClick, onRename, onDelete, onEditTheory, onViewTheory, onStartDictation, onStartShadowing
}: { 
  deck: Deck; isCompleted: boolean; activeTab: string; isLocked?: boolean; onLockClick?: () => void;
  onCardClick: (id: string) => void; onRename?: (id: string, name: string) => void; 
  onDelete?: (id: string, name: string) => void; 
  onEditTheory?: (id: string) => void; onViewTheory: (id: string) => void; 
  onStartDictation: (id: string) => void;
  onStartShadowing: (id: string) => void;
}) => {
  const total = deck.cards.length;`;

code = code.replace(targetSig, replaceSig);

const targetDiv = `  return (
    <div 
      onClick={() => { initAudioCtx(); onCardClick(deck.id); }}
      className={cn(
        "group relative overflow-hidden rounded-[24px] cursor-pointer transition-all duration-400 ease-[cubic-bezier(0.23,1,0.32,1)] hover:-translate-y-1.5",
        "bg-white dark:bg-[#1C1C1E] border border-black/[0.04] dark:border-white/[0.08]",
        "shadow-[0_8px_24px_rgba(0,0,0,0.03)] hover:shadow-[0_20px_40px_rgba(0,0,0,0.08)]",
        isCompleted ? "opacity-90 grayscale-[0.3]" : ""
      )}
    >`;

const replaceDiv = `  return (
    <div 
      onClick={() => { 
        if (isLocked && onLockClick) { onLockClick(); return; }
        initAudioCtx(); onCardClick(deck.id); 
      }}
      className={cn(
        "group relative overflow-hidden rounded-[24px] cursor-pointer transition-all duration-400 ease-[cubic-bezier(0.23,1,0.32,1)] hover:-translate-y-1.5",
        "bg-white dark:bg-[#1C1C1E] border border-black/[0.04] dark:border-white/[0.08]",
        "shadow-[0_8px_24px_rgba(0,0,0,0.03)] hover:shadow-[0_20px_40px_rgba(0,0,0,0.08)]",
        isCompleted ? "opacity-90 grayscale-[0.3]" : ""
      )}
    >
      {isLocked && (
        <div className="absolute inset-0 z-20 bg-black/60 backdrop-blur-[2px] flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center shadow-lg border border-white/10">
            <Lock className="w-5 h-5 text-white" />
          </div>
        </div>
      )}`;

code = code.replace(targetDiv, replaceDiv);
fs.writeFileSync('src/app/page.tsx', code);
console.log('Updated DeckCard');
