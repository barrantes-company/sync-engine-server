'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const output = path.join(root, 'public/style.css');
const sources = ['public/utilities.css', 'public/theme.css', 'public/sync-effects.css'];
let timer = null;

function assemble() {
  const css = sources.map((file) => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
  fs.writeFileSync(output, css);
  console.log('style.css actualizado');
}

const compiler = spawn(path.join(root, 'node_modules', '.bin', 'tailwindcss'), [
  '-c', 'tailwind.config.js',
  '-i', 'public/tailwind.input.css',
  '-o', 'public/utilities.css',
  '--watch'
], { cwd: root, stdio: 'inherit' });

for (const file of sources) {
  fs.watch(path.join(root, file), () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        assemble();
      } catch (error) {
        console.error(error.message);
      }
    }, 100);
  });
}

if (fs.existsSync(path.join(root, 'public/utilities.css'))) assemble();

function stop() {
  compiler.kill('SIGINT');
  process.exit(0);
}

compiler.on('exit', (code) => process.exit(code || 0));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
