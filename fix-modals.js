const fs = require('fs');
let code = fs.readFileSync('src/app/page.tsx', 'utf8');

// Fix BookEditorModal
code = code.replace(
  /function BookEditorModal\(\{\n  useLockBodyScroll\(\); book, onClose, onSave \}: \{ book\?: BookMeta \| null, onClose: \(\) => void, onSave: \(b: BookMeta\) => void \}\) \{/g,
  'function BookEditorModal({ book, onClose, onSave }: { book?: BookMeta | null, onClose: () => void, onSave: (b: BookMeta) => void }) {\n  useLockBodyScroll();'
);

// Fix DeckEditorModal
code = code.replace(
  /function DeckEditorModal\(\{\n  useLockBodyScroll\(\); deck, onClose, onSave, onDelete \}: \{ deck: Deck, onClose: \(\) => void, onSave: \(d: Deck\) => void, onDelete\?: \(\) => void \}\) \{/g,
  'function DeckEditorModal({ deck, onClose, onSave, onDelete }: { deck: Deck, onClose: () => void, onSave: (d: Deck) => void, onDelete?: () => void }) {\n  useLockBodyScroll();'
);

fs.writeFileSync('src/app/page.tsx', code);
console.log('Fixed modals');
