const fs = require('fs');
let code = fs.readFileSync('src/components/admin/AdminDashboard.tsx', 'utf8');

const targetUseEffect = `  useEffect(() => {
    fetchUsers();
  }, []);`;

const replaceUseEffect = `  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    const originalStyle = window.getComputedStyle(document.body).overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalStyle;
    };
  }, []);`;

code = code.replace(targetUseEffect, replaceUseEffect);

fs.writeFileSync('src/components/admin/AdminDashboard.tsx', code);
console.log('Added body scroll lock to AdminDashboard');
