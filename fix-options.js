const fs = require('fs');
let code = fs.readFileSync('src/app/page.tsx', 'utf8');

const targetPayload = `      options: { ...(c.options || {}), baseWordInfo: c.baseWordInfo || null },`;
const replacePayload = `      options: { items: c.options || [], baseWordInfo: c.baseWordInfo || null },`;
code = code.replace(targetPayload, replacePayload);

const targetFetch = `                targetWord: c.targetWord || c.targetword || '',
                baseWordInfo: c.options?.baseWordInfo || c.baseWordInfo || null,
                masteryLevel: p ? p.efactor : (c.masteryLevel ?? c.masterylevel ?? 0),`;

const replaceFetch = `                targetWord: c.targetWord || c.targetword || '',
                baseWordInfo: c.options?.baseWordInfo || c.baseWordInfo || null,
                options: Array.isArray(c.options) ? c.options : (c.options?.items || (c.options && typeof c.options === 'object' ? Object.keys(c.options).filter(k => !isNaN(Number(k))).sort((a,b) => Number(a) - Number(b)).map(k => c.options[k]) : [])),
                masteryLevel: p ? p.efactor : (c.masteryLevel ?? c.masterylevel ?? 0),`;

code = code.replace(targetFetch, replaceFetch);

fs.writeFileSync('src/app/page.tsx', code);
console.log('Fixed options');
