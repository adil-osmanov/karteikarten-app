const fs = require('fs');
let code = fs.readFileSync('src/app/page.tsx', 'utf8');

const targetLoop = `              return cefrLevels.map(level => {
                const sectionKey = \`\${activeTab}-\${level}\`;
                const sortedDecks = groupedDecks[\`\${activeTab}-\${level}\`] || [];

                const limit = visibleLimits[sectionKey] || 10;
                const visibleDecks = sortedDecks.slice(0, limit);
                const inProgressDecks = visibleDecks.filter(d => d.cards.length === 0 || d.cards.length !== d.cards.filter(c => c.isArchived).length);
                const completedDecks = visibleDecks.filter(d => d.cards.length > 0 && d.cards.length === d.cards.filter(c => c.isArchived).length);
                const isExpanded = expandedCategories[sectionKey] || false;`;

const replaceLoop = `              return cefrLevels.map(level => {
                const sectionKey = \`\${activeTab}-\${level}\`;
                const sortedDecks = groupedDecks[\`\${activeTab}-\${level}\`] || [];

                const limit = visibleLimits[sectionKey] || 10;
                const visibleDecks = sortedDecks.slice(0, limit);
                const inProgressDecks = visibleDecks.filter(d => d.cards.length === 0 || d.cards.length !== d.cards.filter(c => c.isArchived).length);
                const completedDecks = visibleDecks.filter(d => d.cards.length > 0 && d.cards.length === d.cards.filter(c => c.isArchived).length);
                const isExpanded = expandedCategories[sectionKey] || false;
                
                const isPremium = profile?.tier === 'premium';
                const isLockedSection = !isPremium && ['B1', 'B2', 'C1-C2'].includes(level);`;

code = code.replace(targetLoop, replaceLoop);

const targetDeck1 = `<DeckCard 
                                  deck={deck} 
                                  isCompleted={false} 
                                  activeTab={activeTab} 
                                  onCardClick={handleDeckClick}`;

const replaceDeck1 = `<DeckCard 
                                  deck={deck} 
                                  isCompleted={false} 
                                  activeTab={activeTab} 
                                  isLocked={isLockedSection}
                                  onLockClick={() => setIsPaywallOpen(true)}
                                  onCardClick={handleDeckClick}`;

code = code.replace(targetDeck1, replaceDeck1);

const targetDeck2 = `<DeckCard 
                                          deck={deck} 
                                          isCompleted={true} 
                                          activeTab={activeTab} 
                                          onCardClick={handleDeckClick}`;

const replaceDeck2 = `<DeckCard 
                                          deck={deck} 
                                          isCompleted={true} 
                                          activeTab={activeTab} 
                                          isLocked={isLockedSection}
                                          onLockClick={() => setIsPaywallOpen(true)}
                                          onCardClick={handleDeckClick}`;

code = code.replace(targetDeck2, replaceDeck2);

fs.writeFileSync('src/app/page.tsx', code);
console.log('Updated render loop');
