const fs = require('fs');
let code = fs.readFileSync('src/app/page.tsx', 'utf8');

const targetActivityWidget = `function ActivityWidget() {
  const { appLanguage } = useStore();
  const [daily, setDaily] = useState<Record<string, any>>({});

  useEffect(() => {
    const loadProgress = () => {
      try {
        const stored = localStorage.getItem(\`daily_activity_\${appLanguage}\`);
        if (stored) setDaily(JSON.parse(stored));
        else setDaily({});
      } catch (e) {}
    };
    loadProgress();
    window.addEventListener('storage-update', loadProgress);
    return () => window.removeEventListener('storage-update', loadProgress);
  }, [appLanguage]);

  const todayStr = new Date().toLocaleDateString('en-CA');
  const rawCount = daily[todayStr];
  const todayCount = typeof rawCount === 'number' ? rawCount : (rawCount?.total || (typeof rawCount === 'string' ? parseInt(rawCount) || 0 : 0));

  return (
    <div className="flex items-center gap-1.5 px-2 h-8 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-default">
      <Layers className="w-4 h-4 text-blue-500 fill-blue-500/20" />
      <span className="text-[15px] font-bold tabular-nums text-gray-900 dark:text-white leading-none">{todayCount}</span>
    </div>
  );
}`;

const replaceActivityWidget = `function ActivityWidget({ profile }: { profile?: any }) {
  const { appLanguage } = useStore();
  const [daily, setDaily] = useState<Record<string, any>>({});
  const [showPopup, setShowPopup] = useState(false);

  useEffect(() => {
    const loadProgress = () => {
      try {
        const stored = localStorage.getItem(\`daily_activity_\${appLanguage}\`);
        if (stored) setDaily(JSON.parse(stored));
        else setDaily({});
      } catch (e) {}
    };
    loadProgress();
    window.addEventListener('storage-update', loadProgress);
    return () => window.removeEventListener('storage-update', loadProgress);
  }, [appLanguage]);

  const todayStr = new Date().toLocaleDateString('en-CA');
  const rawCount = daily[todayStr];
  const todayCount = typeof rawCount === 'number' ? rawCount : (rawCount?.total || (typeof rawCount === 'string' ? parseInt(rawCount) || 0 : 0));
  
  const isFree = profile?.tier !== 'premium';

  return (
    <div className="relative">
      <div 
        onClick={() => setShowPopup(!showPopup)}
        className="flex items-center gap-1.5 px-2 h-8 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer select-none"
      >
        <Layers className="w-4 h-4 text-blue-500 fill-blue-500/20" />
        <span className="text-[15px] font-bold tabular-nums text-gray-900 dark:text-white leading-none">{todayCount}</span>
      </div>
      
      <AnimatePresence>
        {showPopup && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40" onClick={() => setShowPopup(false)} 
            />
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95, filter: 'blur(4px)' }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: 10, scale: 0.95, filter: 'blur(4px)' }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="absolute top-full right-1/2 translate-x-1/2 mt-3 w-64 bg-white/90 dark:bg-[#1C1C1E]/90 backdrop-blur-2xl border border-black/5 dark:border-white/10 rounded-2xl shadow-xl p-5 z-50 text-center"
            >
              <div className="w-12 h-12 bg-blue-50 dark:bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-3 shadow-inner">
                <Layers className="w-6 h-6 text-blue-500" />
              </div>
              <h4 className="text-[15px] font-semibold text-gray-900 dark:text-white tracking-tight mb-2">
                Дневная активность
              </h4>
              <p className="text-[13px] text-gray-500 dark:text-gray-400 font-medium leading-snug mb-4">
                Вы повторили <span className="text-gray-900 dark:text-white font-bold">{todayCount}</span> карточек за сегодня. Регулярные интервальные повторения помогают надежно закрепить слова в долговременной памяти.
              </p>
              {isFree ? (
                <div className="text-[11px] font-bold uppercase tracking-wider text-blue-500 bg-blue-50 dark:bg-blue-500/10 py-1.5 rounded-lg">
                  Лимит: {todayCount}/70 (Free)
                </div>
              ) : (
                <div className="text-[11px] font-bold uppercase tracking-wider text-amber-600 bg-amber-50 dark:bg-amber-500/10 py-1.5 rounded-lg">
                  Безлимит (Pro)
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}`;

code = code.replace(targetActivityWidget, replaceActivityWidget);

fs.writeFileSync('src/app/page.tsx', code);
console.log('Updated ActivityWidget popup');
