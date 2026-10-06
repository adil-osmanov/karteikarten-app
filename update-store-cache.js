const fs = require('fs');
let code = fs.readFileSync('src/app/page.tsx', 'utf8');

const targetUpdate = `  updateBook: async (book) => {
    const previousBooks = get().books;
    set({ books: previousBooks.map(b => b.id === book.id ? book : b) });`;

const replaceUpdate = `  updateBook: async (book) => {
    const previousBooks = get().books;
    const newBooks = previousBooks.map(b => b.id === book.id ? book : b);
    set({ books: newBooks });
    if (typeof window !== 'undefined') {
      try { localStorage.setItem('cache_books_v2', JSON.stringify(newBooks)); } catch(e) {}
    }`;

code = code.replace(targetUpdate, replaceUpdate);

const targetAdd = `  addBook: async (book) => {
    const previousBooks = get().books;
    set({ books: [...previousBooks, book] });`;

const replaceAdd = `  addBook: async (book) => {
    const previousBooks = get().books;
    const newBooks = [...previousBooks, book];
    set({ books: newBooks });
    if (typeof window !== 'undefined') {
      try { localStorage.setItem('cache_books_v2', JSON.stringify(newBooks)); } catch(e) {}
    }`;

code = code.replace(targetAdd, replaceAdd);

fs.writeFileSync('src/app/page.tsx', code);
console.log('Updated store cache');
