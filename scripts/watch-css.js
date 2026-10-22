'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const compiler = path.join(root, 'node_modules', '.bin', 'tailwindcss');
const layers = ['public/utilities.css', 'public/theme.css', 'public/sync-effects.css'];
const inputs = [
  'public/index.html',
  'public/widget.html',
  'public/theme.css',
  'public/sync-effects.css',
  'public/tailwind.input.css',
  'tailwind.config.js'
];
let timer = null;
let running = false;
let queued = false;

function build() {
  if (running) {
    queued = true;
    return;
  }
  running = true;
  const compiled = spawnSync(compiler, [
    '-c', 'tailwind.config.js',
    '-i', 'public/tailwind.input.css',
    '-o', 'public/utilities.css',
    '--minify'
  ], { cwd: root, stdio: 'inherit' });
  if (compiled.status === 0) {
    const css = layers.map((file) => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
    fs.writeFileSync(path.join(root, 'public/style.css'), css);
    console.log('style.css actualizado');
  }
  running = false;
  if (queued) {
    queued = false;
    build();
  }
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(build, 80);
}

build();
for (const file of inputs) {
  fs.watch(path.join(root, file), schedule);
}
console.log('Vigilando HTML, tema y configuración. Ctrl+C para salir.');
