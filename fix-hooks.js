const fs = require('fs');
let code = fs.readFileSync('src/app/page.tsx', 'utf8');

const target1 = `  const { answerCard, decks } = useStore();
  
  const [activeCards, setActiveCards] = useState<{ deckId: string, card: Flashcard }[]>([]);`;

const replace1 = `  const { answerCard, decks, appLanguage } = useStore();
  
  const [activeCards, setActiveCards] = useState<{ deckId: string, card: Flashcard }[]>([]);`;

code = code.replace(target1, replace1);

const target2 = `  const { appLanguage } = useStore();
  const todayStr = new Date().toLocaleDateString('en-CA');`;

const replace2 = `  const todayStr = new Date().toLocaleDateString('en-CA');`;

code = code.replace(target2, replace2);

fs.writeFileSync('src/app/page.tsx', code);
console.log('Fixed hook order');
