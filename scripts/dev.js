'use strict';

const { spawn } = require('child_process');

const children = [
  spawn(process.execPath, ['scripts/watch-css.js'], { stdio: 'inherit' }),
  spawn(process.execPath, ['server.js'], {
    stdio: 'inherit',
    env: { ...process.env, LIVE_RELOAD: '1' }
  })
];

function stop() {
  for (const child of children) child.kill('SIGTERM');
}

process.on('SIGINT', stop);
process.on('SIGTERM', stop);
children.forEach((child) => child.on('exit', (code) => {
  stop();
  process.exit(code || 0);
}));
