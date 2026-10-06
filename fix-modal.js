const fs = require('fs');
let code = fs.readFileSync('src/app/page.tsx', 'utf8');

code = code.replace(
  /function AdminModal\(\{\n  useLockBodyScroll\(\); onClose, activeBook \}/g,
  'function AdminModal({ onClose, activeBook }'
);
code = code.replace(
  /function AdminModal\(\{\n  onClose, activeBook \}: \{ onClose: \(\) => void, activeBook\?: BookMeta \| null \}\) \{/g,
  'function AdminModal({ onClose, activeBook }: { onClose: () => void, activeBook?: BookMeta | null }) {\n  useLockBodyScroll();'
);
code = code.replace(
  /function AdminModal\(\{ onClose, activeBook \}: \{ onClose: \(\) => void, activeBook\?: BookMeta \| null \}\) \{/g,
  'function AdminModal({ onClose, activeBook }: { onClose: () => void, activeBook?: BookMeta | null }) {\n  useLockBodyScroll();'
);

fs.writeFileSync('src/app/page.tsx', code);
console.log('Fixed AdminModal');
