const fs = require('fs');
let code = fs.readFileSync('src/app/page.tsx', 'utf8');

const targetHeaderStart = `      <div className="absolute top-5 right-4 md:top-6 md:right-6 flex items-center gap-1.5 p-1.5 backdrop-blur-xl bg-white/60 dark:bg-[#1C1C1E]/60 border border-black/5 dark:border-white/10 rounded-full shadow-[0_4px_16px_rgba(0,0,0,0.04)] z-50 transition-colors">
        
        {/* 1. Logout */}`;

const targetHeaderEnd = `          </>
        )}
      </div>`;

const replaceHeader = `      <div className="absolute top-5 right-4 md:top-6 md:right-6 flex items-center gap-1.5 p-1.5 backdrop-blur-xl bg-white/60 dark:bg-[#1C1C1E]/60 border border-black/5 dark:border-white/10 rounded-full shadow-[0_4px_16px_rgba(0,0,0,0.04)] z-50 transition-colors">
        
        {/* 1. Admin Stuff (Left-most) */}
        {isAdmin && (
          <>
            <button onClick={() => setAdminOpen(true)} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 text-gray-500 dark:text-gray-400 transition-colors" title="Admin Dashboard">
              <LifeBuoy className="w-4 h-4" />
            </button>
            <button onClick={() => setDbOpen(true)} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 text-gray-500 dark:text-gray-400 transition-colors" title="Export Context">
              <Database className="w-4 h-4" />
            </button>
            <div className="w-[1px] h-4 bg-black/10 dark:bg-white/10 mx-0.5" />
          </>
        )}

        {/* 2. Counter */}
        <ActivityWidget profile={profile} />

        {/* 3. Theme */}
        <DarkModeToggle />

        <div className="w-[1px] h-4 bg-black/10 dark:bg-white/10 mx-0.5" />

        {/* 4. Pro/Free */}
        {profile && (
          profile.tier === 'premium' ? (
            <div className="h-8 px-3 rounded-full flex items-center justify-center bg-gradient-to-r from-amber-200 to-amber-400 dark:from-amber-600 dark:to-amber-500 shadow-sm border border-amber-300 dark:border-amber-400/50 cursor-default">
              <span className="text-[10px] font-bold text-amber-900 dark:text-white uppercase tracking-widest block mt-[1px]">PRO</span>
            </div>
          ) : (
            <div onClick={() => setIsPaywallOpen(true)} className="cursor-pointer h-8 px-3 rounded-full flex items-center justify-center bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/20 transition-colors border border-transparent">
              <span className="text-[10px] font-bold text-gray-500 dark:text-gray-300 hover:text-gray-700 dark:hover:text-white uppercase tracking-widest block mt-[1px]">FREE</span>
            </div>
          )
        )}

        {/* 5. Logout (Right-most) */}
        {profile && (
          <button onClick={onSignOut} className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors" title="Выйти">
            <LogOut className="w-4 h-4" />
          </button>
        )}
      </div>`;

// Using regex to replace the entire block
code = code.replace(
  new RegExp(targetHeaderStart.replace(/[.*+?^\${}()|[\]\\]/g, '\\$&') + '[\\s\\S]*?' + targetHeaderEnd.replace(/[.*+?^\${}()|[\]\\]/g, '\\$&')),
  replaceHeader
);

fs.writeFileSync('src/app/page.tsx', code);
console.log('Updated Header order');
