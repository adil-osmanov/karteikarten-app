const fs = require('fs');
let code = fs.readFileSync('src/app/page.tsx', 'utf8');

code = code.replace(
  'set({ books: previousBooks }); // Rollback on failure',
  `set({ books: previousBooks });
      if (typeof window !== 'undefined') {
        try { localStorage.setItem('cache_books_v2', JSON.stringify(previousBooks)); } catch(e) {}
      } // Rollback on failure`
);

fs.writeFileSync('src/app/page.tsx', code);
console.log('Fixed rollback');
