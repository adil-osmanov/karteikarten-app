const fs = require('fs');
let code = fs.readFileSync('src/app/page.tsx', 'utf8');

const targetLoopBlock = `            {(() => {
              const cefrLevels: CEFRLevel[] = activeBook?.activeLevels?.length ? activeBook.activeLevels : ['A1', 'A2', 'B1', 'B2', 'C1-C2'];
              const levelConfig: Record<CEFRLevel, { label: string, badgeClass: string }> = {
                'A1': { label: 'A1', badgeClass: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-[#2C2C2E] dark:text-[#8E8E93] dark:border-white/[0.05]' },
                'A2': { label: 'A2', badgeClass: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-[#2C2C2E] dark:text-[#8E8E93] dark:border-white/[0.05]' },
                'B1': { label: 'B1', badgeClass: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-[#2C2C2E] dark:text-[#8E8E93] dark:border-white/[0.05]' },
                'B2': { label: 'B2', badgeClass: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-[#2C2C2E] dark:text-[#8E8E93] dark:border-white/[0.05]' },
                'C1-C2': { label: 'C1-C2', badgeClass: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-[#2C2C2E] dark:text-[#8E8E93] dark:border-white/[0.05]' }
              };

              return cefrLevels.map(level => {`;

const replaceLoopBlock = `            {(() => {
              const cefrLevels: CEFRLevel[] = activeBook?.activeLevels?.length ? activeBook.activeLevels : ['A1', 'A2', 'B1', 'B2', 'C1-C2'];
              const levelConfig: Record<CEFRLevel, { label: string, badgeClass: string }> = {
                'A1': { label: 'A1', badgeClass: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-[#2C2C2E] dark:text-[#8E8E93] dark:border-white/[0.05]' },
                'A2': { label: 'A2', badgeClass: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-[#2C2C2E] dark:text-[#8E8E93] dark:border-white/[0.05]' },
                'B1': { label: 'B1', badgeClass: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-[#2C2C2E] dark:text-[#8E8E93] dark:border-white/[0.05]' },
                'B2': { label: 'B2', badgeClass: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-[#2C2C2E] dark:text-[#8E8E93] dark:border-white/[0.05]' },
                'C1-C2': { label: 'C1-C2', badgeClass: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-[#2C2C2E] dark:text-[#8E8E93] dark:border-white/[0.05]' }
              };

              // Compute sequential locks for Free users
              const isPremium = profile?.tier === 'premium';
              const lockedDecks = new Set<string>();
              if (!isPremium) {
                let hasUncompleted = false;
                cefrLevels.forEach(lvl => {
                  const decks = groupedDecks[\`\${activeTab}-\${lvl}\`] || [];
                  decks.forEach(d => {
                    if (hasUncompleted) {
                      lockedDecks.add(d.id);
                    } else {
                      const isCompleted = d.cards.length > 0 && d.cards.length === d.cards.filter(c => c.isArchived).length;
                      if (!isCompleted) {
                        hasUncompleted = true;
                      }
                    }
                  });
                });
              }

              return cefrLevels.map(level => {`;

code = code.replace(targetLoopBlock, replaceLoopBlock);

const targetLevelLock = `                const isPremium = profile?.tier === 'premium';
                const isLockedSection = !isPremium && ['B1', 'B2', 'C1-C2'].includes(level);`;
const replaceLevelLock = ``;
code = code.replace(targetLevelLock, replaceLevelLock);

const targetDeck1 = `<DeckCard 
                                  deck={deck} 
                                  isCompleted={false} 
                                  activeTab={activeTab} 
                                  isLocked={isLockedSection}
                                  onLockClick={() => setIsPaywallOpen(true)}
                                  onCardClick={handleDeckClick}`;
const replaceDeck1 = `<DeckCard 
                                  deck={deck} 
                                  isCompleted={false} 
                                  activeTab={activeTab} 
                                  isLocked={lockedDecks.has(deck.id)}
                                  onLockClick={() => setIsPaywallOpen(true)}
                                  onCardClick={handleDeckClick}`;
code = code.replace(targetDeck1, replaceDeck1);

const targetDeck2 = `<DeckCard 
                                          deck={deck} 
                                          isCompleted={true} 
                                          activeTab={activeTab} 
                                          isLocked={isLockedSection}
                                          onLockClick={() => setIsPaywallOpen(true)}
                                          onCardClick={handleDeckClick}`;
const replaceDeck2 = `<DeckCard 
                                          deck={deck} 
                                          isCompleted={true} 
                                          activeTab={activeTab} 
                                          isLocked={lockedDecks.has(deck.id)}
                                          onLockClick={() => setIsPaywallOpen(true)}
                                          onCardClick={handleDeckClick}`;
code = code.replace(targetDeck2, replaceDeck2);

fs.writeFileSync('src/app/page.tsx', code);
console.log('Updated render locks');
