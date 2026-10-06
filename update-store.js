const fs = require('fs');
let code = fs.readFileSync('src/app/page.tsx', 'utf8');

code = code.replace(
  '  setPlaybackSpeed: (speed: number) => void;',
  '  setPlaybackSpeed: (speed: number) => void;\n  isPaywallOpen: boolean;\n  setIsPaywallOpen: (val: boolean) => void;'
);

code = code.replace(
  '  decks: [],',
  '  isPaywallOpen: false,\n  setIsPaywallOpen: (val) => set({ isPaywallOpen: val }),\n  decks: [],'
);

fs.writeFileSync('src/app/page.tsx', code);
console.log('Updated store');
