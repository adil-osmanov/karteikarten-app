const fs = require('fs');
let code = fs.readFileSync('src/app/page.tsx', 'utf8');

// StudyInterface
const targetStudyPaywall = `<button
            onClick={() => { alert('Интеграция с платежной системой (Stripe/Robokassa/ЮKassa)'); }}
            className="w-full bg-blue-600 hover:bg-blue-700 dark:bg-white dark:text-black dark:hover:opacity-90 text-white py-4 rounded-2xl font-bold text-[17px] transition-all active:scale-[0.98] mb-3"
          >
            Открыть безлимит навсегда за 890 ₽
          </button>`;
const replaceStudyPaywall = `<a
            href={\`https://t.me/adilosmanow?text=\${encodeURIComponent("Привет! Хочу купить PRO в Kraft. Моя почта в приложении: " + (profile?.email || ""))}\`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => console.log('Paywall clicked')}
            className="w-full flex items-center justify-center bg-blue-600 hover:bg-blue-700 dark:bg-white dark:text-black dark:hover:opacity-90 text-white py-4 rounded-2xl font-bold text-[17px] transition-all active:scale-[0.98] mb-3"
          >
            Открыть безлимит навсегда за 890 ₽
          </a>`;

code = code.replace(targetStudyPaywall, replaceStudyPaywall);


// HeaderWidgets Paywall
const targetHeaderPaywall = `<h2 className="text-xl font-bold text-white mb-2 tracking-tight">Снимите все ограничения</h2>
              <p className="text-sm text-gray-400 mb-8 font-medium leading-relaxed">
                Учите слова в своем темпе. Без дневных лимитов и рекламы. Идеально для интенсивной подготовки к B1/B2.
              </p>
              <button onClick={() => console.log('Redirect to payment')} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-2xl py-4 transition-colors active:scale-95 text-[15px]">
                Открыть безлимит навсегда за 890 ₽
              </button>`;
const replaceHeaderPaywall = `<h2 className="text-xl font-bold text-white mb-2 tracking-tight">Откройте все возможности</h2>
              <p className="text-[13px] text-gray-400 mb-8 font-medium leading-relaxed px-2">
                Полный доступ ко всем темам и отсутствие дневных лимитов. Идеально для интенсивной подготовки к экзамену. Учитесь в своем ритме.
              </p>
              <a 
                href={\`https://t.me/adilosmanow?text=\${encodeURIComponent("Привет! Хочу купить PRO в Kraft. Моя почта в приложении: " + (profile?.email || ""))}\`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => console.log('Paywall clicked')} 
                className="w-full flex items-center justify-center bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-2xl py-4 transition-colors active:scale-95 text-[15px]"
              >
                Открыть безлимит навсегда за 890 ₽
              </a>`;

code = code.replace(targetHeaderPaywall, replaceHeaderPaywall);

fs.writeFileSync('src/app/page.tsx', code);
console.log('Updated Paywalls');
