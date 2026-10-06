const fs = require('fs');
let code = fs.readFileSync('src/app/page.tsx', 'utf8');

const targetDeckCardLock = `<span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mt-1 cursor-pointer hover:text-blue-500">
            Нажмите, чтобы открыть PRO
          </span>`;

const replaceDeckCardLock = `<span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mt-1 cursor-pointer hover:opacity-80 transition-opacity">
            Нажмите, чтобы открыть <span className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-500 to-amber-600 dark:from-amber-400 dark:to-amber-500">PRO</span>
          </span>`;

code = code.replace(targetDeckCardLock, replaceDeckCardLock);

fs.writeFileSync('src/app/page.tsx', code);
console.log('Updated DeckCard PRO text');
