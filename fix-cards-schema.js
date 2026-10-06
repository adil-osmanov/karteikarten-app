const fs = require('fs');
let code = fs.readFileSync('src/app/page.tsx', 'utf8');

const targetPayload = `    const cardsToInsert = deck.cards.map(c => ({
      id: c.id,
      deck_id: deck.id,
      targetWord: c.targetWord,
      sentence: c.sentence,
      translation: c.translation,
      options: c.options,
      masteryLevel: c.masteryLevel,
      isArchived: c.isArchived,
      nextReviewDate: c.nextReviewDate,
      interval: c.interval,
      repetitions: c.repetitions,
      baseWordInfo: c.baseWordInfo || null
    }));`;

const replacePayload = `    const cardsToInsert = deck.cards.map(c => ({
      id: c.id,
      deck_id: deck.id,
      targetword: c.targetWord,
      sentence: c.sentence,
      translation: c.translation,
      options: { ...(c.options || {}), baseWordInfo: c.baseWordInfo || null },
      masterylevel: c.masteryLevel,
      isarchived: c.isArchived,
      nextreviewdate: c.nextReviewDate ? new Date(c.nextReviewDate).toISOString() : null,
      interval: c.interval,
      repetitions: c.repetitions
    }));`;

code = code.replace(targetPayload, replacePayload);

const targetFetch = `              return {
                ...c,
                baseWordInfo: c.baseWordInfo || null,
                masteryLevel: p ? p.efactor : (c.masteryLevel || 0), // Fallback to global if no local progress (though we map efactor to masteryLevel in this app's UI)
                isArchived: p ? p.is_correct : (c.isArchived || false), // hacky map for now
                nextReviewDate: p ? new Date(p.due_date).getTime() : (c.nextReviewDate || null),
                interval: p ? p.interval : (c.interval || 0),
                repetitions: p ? p.repetition : (c.repetitions || 0)
              }`;

const replaceFetch = `              return {
                ...c,
                targetWord: c.targetWord || c.targetword || '',
                baseWordInfo: c.options?.baseWordInfo || c.baseWordInfo || null,
                masteryLevel: p ? p.efactor : (c.masteryLevel ?? c.masterylevel ?? 0),
                isArchived: p ? p.is_correct : (c.isArchived ?? c.isarchived ?? false),
                nextReviewDate: p ? new Date(p.due_date).getTime() : (c.nextReviewDate ? new Date(c.nextReviewDate).getTime() : (c.nextreviewdate ? new Date(c.nextreviewdate).getTime() : null)),
                interval: p ? p.interval : (c.interval ?? 0),
                repetitions: p ? p.repetition : (c.repetitions ?? 0)
              }`;

code = code.replace(targetFetch, replaceFetch);

fs.writeFileSync('src/app/page.tsx', code);
console.log('Fixed cards schema mappings');
