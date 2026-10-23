'use strict';

const { buildCss } = require('./build-css');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
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
  const status = buildCss();
  if (status === 0) console.log('style.css actualizado');
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
