const fs = require('fs');
let code = fs.readFileSync('src/components/admin/AdminDashboard.tsx', 'utf8');

const targetState = `  const [users, setUsers] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);`;
const replaceState = `  const [users, setUsers] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');`;

code = code.replace(targetState, replaceState);

const targetTitle = `        <h2 className="text-2xl font-bold tracking-tight mb-2 text-gray-900 dark:text-white">Пользователи</h2>
        <p className="text-gray-500 dark:text-white/50 text-sm mb-8 font-medium">
          Управление аккаунтами и премиум-доступом
        </p>

        {isLoading ? (`;
const replaceTitle = `        <h2 className="text-2xl font-bold tracking-tight mb-2 text-gray-900 dark:text-white">Пользователи</h2>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <p className="text-gray-500 dark:text-white/50 text-sm font-medium">
            Управление аккаунтами и премиум-доступом
          </p>
          <input 
            type="text" 
            placeholder="Поиск по email..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-64 px-4 py-2 bg-gray-100 dark:bg-white/5 border border-transparent dark:border-white/10 rounded-xl text-[14px] text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
          />
        </div>

        {isLoading ? (`;
code = code.replace(targetTitle, replaceTitle);

const targetMap = `{users.map(user => (`;
const replaceMap = `{users.filter(u => u.email.toLowerCase().includes(search.toLowerCase())).map(user => (`;
code = code.replace(targetMap, replaceMap);

const targetTableHead = `<th className="pb-4 px-4 font-semibold text-[13px] uppercase tracking-wider text-gray-500 dark:text-gray-400">Пользователь</th>
                  <th className="pb-4 px-4 font-semibold text-[13px] uppercase tracking-wider text-gray-500 dark:text-gray-400">Регистрация</th>
                  <th className="pb-4 px-4 font-semibold text-[13px] uppercase tracking-wider text-gray-500 dark:text-gray-400">Роль</th>
                  <th className="pb-4 px-4 font-semibold text-[13px] uppercase tracking-wider text-gray-500 dark:text-gray-400">Статус</th>
                  <th className="pb-4 px-4 font-semibold text-[13px] uppercase tracking-wider text-gray-500 dark:text-gray-400 text-right">Pro</th>`;
const replaceTableHead = `<th className="pb-4 px-4 font-semibold text-[13px] uppercase tracking-wider text-gray-500 dark:text-gray-400 w-2/5">Пользователь</th>
                  <th className="pb-4 px-4 font-semibold text-[13px] uppercase tracking-wider text-gray-500 dark:text-gray-400 w-1/5">Регистрация</th>
                  <th className="pb-4 px-4 font-semibold text-[13px] uppercase tracking-wider text-gray-500 dark:text-gray-400 w-1/6">Роль</th>
                  <th className="pb-4 px-4 font-semibold text-[13px] uppercase tracking-wider text-gray-500 dark:text-gray-400 w-1/6">Статус</th>
                  <th className="pb-4 px-4 font-semibold text-[13px] uppercase tracking-wider text-gray-500 dark:text-gray-400 text-right w-16">Pro</th>`;
code = code.replace(targetTableHead, replaceTableHead);

const targetStatus = `<td className="py-4 px-4">
                      <span className={cn(
                        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider",`;
const replaceStatus = `<td className="py-4 px-4">
                      <span className={cn(
                        "inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider w-[72px]",`;
code = code.replace(targetStatus, replaceStatus);


fs.writeFileSync('src/components/admin/AdminDashboard.tsx', code);
console.log('Updated admin dashboard search and stability');
