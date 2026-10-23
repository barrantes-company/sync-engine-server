'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const layers = ['public/utilities.css', 'public/theme.css', 'public/sync-effects.css'];

function compilerCommand() {
  const cli = path.join(root, 'node_modules', 'tailwindcss', 'lib', 'cli.js');
  if (fs.existsSync(cli)) return { command: process.execPath, args: [cli] };
  const shim = process.platform === 'win32' ? 'tailwindcss.cmd' : 'tailwindcss';
  return { command: path.join(root, 'node_modules', '.bin', shim), args: [] };
}

function buildCss() {
  const compiler = compilerCommand();
  const compiled = spawnSync(compiler.command, [
    ...compiler.args,
    '-c', 'tailwind.config.js',
    '-i', 'public/tailwind.input.css',
    '-o', 'public/utilities.css',
    '--minify'
  ], { cwd: root, stdio: 'inherit', shell: false });
  if (compiled.error) {
    console.error('No se pudo iniciar el compilador CSS:', compiled.error.message);
    return 1;
  }
  if (compiled.status !== 0) {
    console.error('El compilador CSS terminó con código', compiled.status);
    return compiled.status || 1;
  }
  const css = layers.map((file) => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
  fs.writeFileSync(path.join(root, 'public/style.css'), css);
  return 0;
}

if (require.main === module) {
  process.exit(buildCss());
}

module.exports = { buildCss };
