const fs = require('fs');
let code = fs.readFileSync('src/app/page.tsx', 'utf8');

// Update DarkModeToggle
const targetDarkMode = `  return (
    <button 
      onClick={toggle}
      className="w-8 h-8 flex items-center justify-center rounded-full bg-white/50 dark:bg-black/20 backdrop-blur-md border border-black/5 dark:border-white/10 text-gray-500 dark:text-white/70 hover:text-gray-900 dark:hover:text-white transition-colors cursor-pointer"
      title={isDark ? "Светлая тема" : "Темная тема"}
    >
      {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );`;
const replaceDarkMode = `  return (
    <button 
      onClick={toggle}
      className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-gray-500 dark:text-gray-400 transition-colors cursor-pointer"
      title={isDark ? "Светлая тема" : "Темная тема"}
    >
      {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );`;
code = code.replace(targetDarkMode, replaceDarkMode);

// Update ActivityWidget
const targetActivity = `  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/50 dark:bg-black/20 backdrop-blur-md border border-black/5 dark:border-white/10 shadow-sm mr-1">
      <Layers className="w-4 h-4 text-blue-500 fill-blue-500/20" />
      <span className="text-[11px] uppercase tracking-wider font-semibold text-gray-400 dark:text-gray-500 leading-none mt-[1px]">Сегодня</span>
      <span className="text-[15px] font-bold tabular-nums text-gray-900 dark:text-white leading-none">{todayCount}</span>
    </div>
  );`;
const replaceActivity = `  return (
    <div className="flex items-center gap-1.5 px-2 h-8 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-default">
      <Layers className="w-4 h-4 text-blue-500 fill-blue-500/20" />
      <span className="text-[15px] font-bold tabular-nums text-gray-900 dark:text-white leading-none">{todayCount}</span>
    </div>
  );`;
code = code.replace(targetActivity, replaceActivity);

// Update HeaderWidgets
const targetHeader = `<div className="absolute top-5 right-4 md:top-6 md:right-6 pr-2 flex items-center gap-3.5 z-50">
        <DarkModeToggle />
        <ActivityWidget />
        
        {isAdmin && (
          <>
            <button 
              onClick={() => setDbOpen(true)}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-white/50 dark:bg-black/20 backdrop-blur-md border border-black/5 dark:border-white/10 text-gray-500 dark:text-white/70 hover:text-gray-900 dark:hover:text-white transition-colors cursor-pointer"
              title="Database Export"
            >
              <Database className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setAdminOpen(true)}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-white/50 dark:bg-black/20 backdrop-blur-md border border-black/5 dark:border-white/10 text-gray-500 dark:text-white/70 hover:text-gray-900 dark:hover:text-white transition-colors cursor-pointer"
              title="Users Dashboard"
            >
              <LifeBuoy className="w-4 h-4" />
            </button>
          </>
        )}
        
        {/* User Pill */}
        {profile && (
          <div className="flex items-center gap-2.5 backdrop-blur-md border border-black/5 dark:border-white/10 bg-white/60 dark:bg-[#1C1C1E]/60 rounded-full pl-1.5 pr-1.5 py-1.5 shadow-sm transition-colors">
            <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-gray-400">
              <User className="w-4 h-4" />
            </div>
            <div className="flex items-center gap-2 pr-1">
              <span onClick={handleChangeName} title="Изменить имя" className="cursor-pointer hover:opacity-70 transition-opacity text-[13px] font-medium text-gray-800 dark:text-gray-200 max-w-[100px] truncate leading-none">
                {displayName}
              </span>
              {profile.tier === 'premium' ? (
                <div className="px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-200 to-amber-400 dark:from-amber-600 dark:to-amber-500 shadow-sm border border-amber-300 dark:border-amber-400/50">
                  <span className="text-[9px] font-bold text-amber-900 dark:text-white uppercase tracking-wider leading-none block mt-[1px]">PRO</span>
                </div>
              ) : (
                <div onClick={() => setIsPaywallOpen(true)} className="cursor-pointer hover:bg-gray-200 dark:hover:bg-white/20 transition-colors px-2 py-0.5 rounded-full bg-gray-100 dark:bg-white/10 border border-black/5 dark:border-white/5">
                  <span className="text-[9px] font-bold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white uppercase tracking-wider leading-none block mt-[1px]">FREE</span>
                </div>
              )}
            </div>
            <button 
              onClick={onSignOut} 
              className="ml-0.5 w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors" 
              title="Выйти"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>`;

const replaceHeader = `<div className="absolute top-5 right-4 md:top-6 md:right-6 flex items-center gap-1.5 p-1.5 backdrop-blur-xl bg-white/60 dark:bg-[#1C1C1E]/60 border border-black/5 dark:border-white/10 rounded-full shadow-[0_4px_16px_rgba(0,0,0,0.04)] z-50 transition-colors">
        
        {/* 1. Logout */}
        {profile && (
          <button onClick={onSignOut} className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors" title="Выйти">
            <LogOut className="w-4 h-4" />
          </button>
        )}

        {/* 2. Pro/Free */}
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

        <div className="w-[1px] h-4 bg-black/10 dark:bg-white/10 mx-0.5" />

        {/* 3. Theme */}
        <DarkModeToggle />

        {/* 4. Counter */}
        <ActivityWidget />

        {/* 5. Admin Stuff */}
        {isAdmin && (
          <>
            <div className="w-[1px] h-4 bg-black/10 dark:bg-white/10 mx-0.5" />
            <button onClick={() => setDbOpen(true)} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 text-gray-500 dark:text-gray-400 transition-colors" title="Export Context">
              <Database className="w-4 h-4" />
            </button>
            <button onClick={() => setAdminOpen(true)} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 text-gray-500 dark:text-gray-400 transition-colors" title="Admin Dashboard">
              <LifeBuoy className="w-4 h-4" />
            </button>
          </>
        )}
      </div>`;

code = code.replace(targetHeader, replaceHeader);

fs.writeFileSync('src/app/page.tsx', code);
console.log('Updated Header Widgets');
