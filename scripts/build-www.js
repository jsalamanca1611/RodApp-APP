// Copia la app web a www/ (lo que empaqueta Capacitor en el APK). Sin compilación: son los mismos archivos que sirve Vercel.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), out = path.join(root, 'www');
const incluir = ['index.html', 'styles.css', 'manifest.webmanifest', 'sw.js', 'assets'];
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
const copiar = (a, b) => { const s = fs.statSync(a); if (s.isDirectory()) { fs.mkdirSync(b, { recursive: true }); fs.readdirSync(a).forEach(f => copiar(path.join(a, f), path.join(b, f))); } else fs.copyFileSync(a, b); };
fs.readdirSync(root).filter(f => f.endsWith('.js')).forEach(f => incluir.push(f));
incluir.forEach(f => { const p = path.join(root, f); if (fs.existsSync(p)) copiar(p, path.join(out, f)); });
console.log('www/ listo:', fs.readdirSync(out).length, 'elementos');
