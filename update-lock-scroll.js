const fs = require('fs');
let code = fs.readFileSync('src/app/page.tsx', 'utf8');

const targetHookInsertion = `function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}`;

const replaceHookInsertion = `function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function useLockBodyScroll() {
  useEffect(() => {
    const originalStyle = window.getComputedStyle(document.body).overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalStyle;
    };
  }, []);
}`;
code = code.replace(targetHookInsertion, replaceHookInsertion);

const modalsToUpdate = [
  { target: `function AdminModal({`, name: `AdminModal` },
  { target: `function PaywallModal({`, name: `PaywallModal` },
  { target: `function BookEditorModal({`, name: `BookEditorModal` },
  { target: `function DeckEditorModal({`, name: `DeckEditorModal` }
];

modalsToUpdate.forEach(modal => {
  const replaceStr = modal.target + `\n  useLockBodyScroll();`;
  code = code.replace(modal.target, replaceStr);
});

fs.writeFileSync('src/app/page.tsx', code);
console.log('Added useLockBodyScroll to modals in page.tsx');
