const fs = require('fs');
let code = fs.readFileSync('src/app/page.tsx', 'utf8');

const targetHeaderEffect = `function HeaderWidgets({ activeBook, onBack, profile, session, onSignOut }: { activeBook?: BookMeta | null, onBack?: () => void, profile?: any, session?: any, onSignOut?: () => void }) {
  const [adminOpen, setAdminOpen] = useState(false);
  const [dbOpen, setDbOpen] = useState(false);
  const { isPaywallOpen, setIsPaywallOpen } = useStore();
  const isAdmin = profile?.role === 'admin';
  const displayName = session?.user?.user_metadata?.display_name || profile?.email?.split('@')[0] || 'User';`;

const replaceHeaderEffect = `function HeaderWidgets({ activeBook, onBack, profile, session, onSignOut }: { activeBook?: BookMeta | null, onBack?: () => void, profile?: any, session?: any, onSignOut?: () => void }) {
  const [adminOpen, setAdminOpen] = useState(false);
  const [dbOpen, setDbOpen] = useState(false);
  const { isPaywallOpen, setIsPaywallOpen } = useStore();
  const isAdmin = profile?.role === 'admin';
  const displayName = session?.user?.user_metadata?.display_name || profile?.email?.split('@')[0] || 'User';

  useEffect(() => {
    if (adminOpen || dbOpen || isPaywallOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
    return () => { document.body.style.overflow = 'auto'; };
  }, [adminOpen, dbOpen, isPaywallOpen]);`;

code = code.replace(targetHeaderEffect, replaceHeaderEffect);

fs.writeFileSync('src/app/page.tsx', code);
console.log('Fixed Header scroll locking');
