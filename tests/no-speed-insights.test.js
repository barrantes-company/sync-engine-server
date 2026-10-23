// Speed Insights de Vercel requiere hosting en Vercel; el proyecto se despliega en Render.
// Verifica que no se publique node_modules ni se cargue el cliente de Vercel.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const leer = (f) => fs.readFileSync(path.join(root, f), 'utf8');

assert.ok(!/node_modules/.test(leer('server.js').replace(/\/\/.*$/gm, '')), 'server.js no debe publicar node_modules');
assert.ok(!leer('server.js').includes('@vercel/speed-insights'));
for (const f of ['public/index.html', 'public/widget.html']) {
  assert.ok(!leer(f).includes('speed-insights'), `${f} no debe cargar Speed Insights`);
}
assert.ok(!fs.existsSync(path.join(root, 'public/speed-insights.js')));
assert.ok(!('@vercel/speed-insights' in (require('../package.json').dependencies || {})));
console.log('OK no-speed-insights');
