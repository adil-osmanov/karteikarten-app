const fs = require('fs');
let code = fs.readFileSync('src/app/page.tsx', 'utf8');

const targetState = `  const [dbOpen, setDbOpen] = useState(false);
  const [isPaywallOpen, setIsPaywallOpen] = useState(false);`;
const replacementState = `  const [dbOpen, setDbOpen] = useState(false);
  const { isPaywallOpen, setIsPaywallOpen } = useStore();`;
code = code.replace(targetState, replacementState);

fs.writeFileSync('src/app/page.tsx', code);
console.log('Updated HeaderWidgets');
