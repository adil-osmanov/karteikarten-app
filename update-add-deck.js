const fs = require('fs');
let code = fs.readFileSync('src/app/page.tsx', 'utf8');

const targetAddDeck = `    let deckRes = await supabase.from('kraft_decks').insert(payload);
    
    if (deckRes.error && deckRes.error.message.includes('not exist')) {
        console.warn("Falling back to deck insert without book_id/language columns. Please run the SQL migration.");
        const fallbackPayload = {
          id: deck.id,
          name: deck.name,
          category: deck.category,
          level: deck.level || 'A1'
        };
        deckRes = await supabase.from('kraft_decks').insert(fallbackPayload);
    }
    
    if (deckRes.error) {
      console.error("Supabase Deck Insert Error:", deckRes.error.message);
      alert(\`Fehler beim Сохранить des Decks in der Datenbank: \${deckRes.error.message}\`);
      set({ decks: previousDecks });
      return;
    }`;

const replaceAddDeck = `    // Ensure book exists if bookId is provided to avoid FK violation
    if (payload.book_id) {
      const { data: bookCheck } = await supabase.from('kraft_books').select('id').eq('id', payload.book_id).single();
      if (!bookCheck) {
        await supabase.from('kraft_books').insert({
          id: payload.book_id,
          language: payload.language || 'DE',
          title: payload.book_id === 'default-en' ? 'Basic English' : 'Basis Deutsch',
          activelevels: ['A1', 'A2', 'B1', 'B2', 'C1-C2']
        });
      }
    }

    let deckRes = await supabase.from('kraft_decks').insert(payload);
    
    if (deckRes.error && deckRes.error.message.includes('not exist')) {
        console.warn("Falling back to deck insert without book_id/language columns. Please run the SQL migration.");
        const fallbackPayload = {
          id: deck.id,
          name: deck.name,
          category: deck.category,
          level: deck.level || 'A1'
        };
        deckRes = await supabase.from('kraft_decks').insert(fallbackPayload);
    }
    
    if (deckRes.error) {
      console.error("Supabase Deck Insert Error:", deckRes.error.message);
      
      // If it STILL fails with FK, drop book_id and retry
      if (deckRes.error.message.includes('foreign key constraint')) {
         delete payload.book_id;
         deckRes = await supabase.from('kraft_decks').insert(payload);
      }
      
      if (deckRes.error) {
        alert(\`Ошибка при сохранении колоды: \${deckRes.error.message}\`);
        set({ decks: previousDecks });
        return;
      }
    }`;

code = code.replace(targetAddDeck, replaceAddDeck);
fs.writeFileSync('src/app/page.tsx', code);
console.log('Updated addDeck');
