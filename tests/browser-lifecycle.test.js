'use strict';

// Lifecycle contract of the Chromium test helper, checked with fake executables (no real browser needed):
// a failed or wedged start must never leave a live process, and no two attempts may share a profile.
const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { startChromium } = require('./helpers/browser');

const skip = process.platform === 'win32' ? 'fake executables are POSIX shell scripts' : false;
const previousChromePath = process.env.CHROME_PATH;
let tempDir;

function fakeBrowser(name, body) {
  const file = path.join(tempDir, name);
  fs.writeFileSync(file, '#!/bin/sh\n' + body + '\n', { mode: 0o755 });
  process.env.CHROME_PATH = file;
  return file;
}
function isRunning(pid) {
  try { process.kill(pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; }
}
function readPid(file) { return Number(fs.readFileSync(file, 'utf8').trim()); }

before(() => { tempDir = fs.mkdtempSync(path.join(process.env.SYNC_TEST_TMP || os.tmpdir(), 'sync-lifecycle-')); });
after(() => {
  if (previousChromePath === undefined) delete process.env.CHROME_PATH; else process.env.CHROME_PATH = previousChromePath;
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

test('a start that never reports DevTools is killed before the rejection and names executable, profile and stderr', { skip }, async () => {
  const pidFile = path.join(tempDir, 'silent.pid');
  const executable = fakeBrowser('silent.sh', `echo $$ > "${pidFile}"\necho "starting up" >&2\nexec sleep 600`);
  await assert.rejects(startChromium(tempDir, { startupTimeoutMs: 400 }), (error) => {
    assert.match(error.message, /Chromium startup timeout after 400 ms/);
    assert.ok(error.message.includes('executable: ' + executable));
    assert.match(error.message, /profile: .*browser-profile-/);
    assert.match(error.message, /starting up/);
    return true;
  });
  assert.equal(isRunning(readPid(pidFile)), false, 'the stalled browser must be gone once startChromium rejects');
});

test('an early exit rejects immediately with its exit code, and attempts never share a profile', { skip }, async () => {
  fakeBrowser('crash.sh', 'echo "boom" >&2\nexit 3');
  const profiles = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const started = Date.now();
    await assert.rejects(startChromium(tempDir, { startupTimeoutMs: 15000 }), (error) => {
      assert.match(error.message, /exited before DevTools was ready \(code=3/);
      assert.match(error.message, /boom/);
      profiles.push(error.message.match(/profile: (.+)/)[1].trim());
      return true;
    });
    assert.ok(Date.now() - started < 5000, 'an exited browser must not wait for the startup timeout');
  }
  assert.notEqual(profiles[0], profiles[1]);
});

test('stop() ends a browser that ignores SIGTERM', { skip }, async () => {
  const pidFile = path.join(tempDir, 'stubborn.pid');
  fakeBrowser('stubborn.sh', `trap '' TERM\necho $$ > "${pidFile}"\necho "DevTools listening on ws://127.0.0.1:9/devtools/browser/fake" >&2\nexec sleep 600`);
  const started = await startChromium(tempDir, { startupTimeoutMs: 5000 });
  assert.equal(started.browserUrl, 'ws://127.0.0.1:9/devtools/browser/fake');
  assert.equal(isRunning(readPid(pidFile)), true);
  await started.stop(200);
  assert.equal(isRunning(readPid(pidFile)), false, 'SIGKILL must follow when SIGTERM is ignored');
});
