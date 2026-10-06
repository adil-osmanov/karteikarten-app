const fs = require('fs');
let code = fs.readFileSync('src/app/page.tsx', 'utf8');

const targetBookCard = `const BookCard = React.memo(({ book, onClick, onEdit, onDelete }: { book: BookMeta, onClick: () => void, onEdit?: (e:any)=>void, onDelete?: (e:any)=>void }) => {
  const initialCoverStr = book.coverImage || (book.coverType === 'image' ? book.coverValue : null);
  let lightCover = initialCoverStr;
  let darkCover = initialCoverStr;
  
  if (initialCoverStr && initialCoverStr.startsWith('{"light":')) {
    try {
      const parsed = JSON.parse(initialCoverStr);
      lightCover = parsed.light || null;
      darkCover = parsed.dark || null;
    } catch {}
  }
  
  const isImage = !!(lightCover || darkCover);`;

const replaceBookCard = `const BookCard = React.memo(({ book, onClick, onEdit, onDelete }: { book: BookMeta, onClick: () => void, onEdit?: (e:any)=>void, onDelete?: (e:any)=>void }) => {
  const initialCoverStr = book.coverImage || (book.coverType === 'image' ? book.coverValue : null);
  let lightCover = initialCoverStr;
  let darkCover = initialCoverStr;
  
  if (initialCoverStr && initialCoverStr.startsWith('{"light":')) {
    try {
      const parsed = JSON.parse(initialCoverStr);
      lightCover = parsed.light || null;
      darkCover = parsed.dark || null;
    } catch {}
  }

  // Fallback for local public images missing absolute path
  if (lightCover && !lightCover.startsWith('data:') && !lightCover.startsWith('http') && !lightCover.startsWith('/')) {
    lightCover = '/' + lightCover;
  }
  if (darkCover && !darkCover.startsWith('data:') && !darkCover.startsWith('http') && !darkCover.startsWith('/')) {
    darkCover = '/' + darkCover;
  }
  
  const isImage = !!(lightCover || darkCover);`;

code = code.replace(targetBookCard, replaceBookCard);

const targetImg = `        <div className="relative w-full aspect-[2/3] shrink-0" style={{ backgroundColor: tintColor }}>
          {lightCover && (
            <img src={lightCover} className={cn("absolute inset-0 w-full h-full object-cover", lightCover !== darkCover ? "dark:hidden" : "")} alt="Light Cover" />
          )}
          {darkCover && (
            <img src={darkCover} className={cn("absolute inset-0 w-full h-full object-cover", lightCover !== darkCover ? "hidden dark:block" : "")} alt="Dark Cover" />
          )}
          
          {!lightCover && !darkCover && (
            <div className="absolute inset-0 flex flex-col justify-end p-5 z-20">
              <h3 className="text-white font-bold text-xl leading-tight drop-shadow-md line-clamp-3">{book.title}</h3>
            </div>
          )}`;

const replaceImg = `        <div className="relative w-full aspect-[2/3] shrink-0" style={{ backgroundColor: tintColor }}>
          {!lightCover && !darkCover ? (
            <div className="absolute inset-0 flex flex-col justify-end p-5 z-20">
              <h3 className="text-white font-bold text-xl leading-tight drop-shadow-md line-clamp-3">{book.title}</h3>
            </div>
          ) : (
            <>
              {/* Fallback skeleton layer */}
              <div className="absolute inset-0 bg-black/10 dark:bg-white/5" />
              {lightCover && (
                <img 
                  src={lightCover} 
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  className={cn("absolute inset-0 w-full h-full object-cover", lightCover !== darkCover ? "dark:hidden" : "")} 
                  alt="Light Cover" 
                />
              )}
              {darkCover && (
                <img 
                  src={darkCover} 
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  className={cn("absolute inset-0 w-full h-full object-cover", lightCover !== darkCover ? "hidden dark:block" : "")} 
                  alt="Dark Cover" 
                />
              )}
            </>
          )}`;

code = code.replace(targetImg, replaceImg);
fs.writeFileSync('src/app/page.tsx', code);
console.log('Updated BookCard');
