const fs = require('fs');
let code = fs.readFileSync('src/app/page.tsx', 'utf8');

const target = `    const payload = {
      id: book.id, language: book.language, title: book.title, subtitle: book.subtitle || null,
      tintColor: book.tintColor || '#000000', coverImage: book.coverImage || null,
      activeLevels: book.activeLevels || ['A1']
    };
    
    let { error } = await supabase.from('kraft_books').insert(payload);
    
    if (error && error.message.includes('does not exist')) {
       const fallbackPayload = {
         id: book.id, language: book.language, title: book.title, subtitle: book.subtitle || null,
         tintcolor: book.tintColor || '#000000', coverimage: book.coverImage || null,
         activelevels: book.activeLevels || ['A1']
       };
       const fallbackRes = await supabase.from('kraft_books').insert(fallbackPayload);
       error = fallbackRes.error;
    }`;

const replacement = `    const payload = {
      id: book.id, language: book.language, title: book.title, subtitle: book.subtitle || null,
      tintcolor: book.tintColor || '#000000', coverimage: book.coverImage || null,
      activelevels: book.activeLevels || ['A1']
    };
    const { error } = await supabase.from('kraft_books').insert(payload);`;

code = code.replace(target, replacement);

const targetUpdate = `    const payload = {
      language: book.language, title: book.title, subtitle: book.subtitle || null,
      tintColor: book.tintColor || '#000000', coverImage: book.coverImage || null,
      activeLevels: book.activeLevels || ['A1']
    };
    
    let { error } = await supabase.from('kraft_books').update(payload).eq('id', book.id);
    
    if (error && error.message.includes('does not exist')) {
       const fallbackPayload = {
         language: book.language, title: book.title, subtitle: book.subtitle || null,
         tintcolor: book.tintColor || '#000000', coverimage: book.coverImage || null,
         activelevels: book.activeLevels || ['A1']
       };
       const fallbackRes = await supabase.from('kraft_books').update(fallbackPayload).eq('id', book.id);
       error = fallbackRes.error;
    }`;

const replacementUpdate = `    const payload = {
      language: book.language, title: book.title, subtitle: book.subtitle || null,
      tintcolor: book.tintColor || '#000000', coverimage: book.coverImage || null,
      activelevels: book.activeLevels || ['A1']
    };
    const { error } = await supabase.from('kraft_books').update(payload).eq('id', book.id);`;

code = code.replace(targetUpdate, replacementUpdate);
fs.writeFileSync('src/app/page.tsx', code);
console.log('Fixed book inserts');
