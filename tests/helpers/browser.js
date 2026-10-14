'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const WebSocket = require('ws');

class DevTools {
  constructor(socket) {
    this.socket = socket;
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    socket.on('message', (raw) => {
      const message = JSON.parse(raw);
      if (!message.id) { this.events.push(message); return; }
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(JSON.stringify(message.error)));
      else pending.resolve(message.result);
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 20000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  async wait(expression) {
    return this.evaluate(`new Promise((resolve, reject) => {
      const start = Date.now();
      const timer = setInterval(() => {
        if (${expression}) { clearInterval(timer); resolve(true); }
        else if (Date.now() - start > 12000) { clearInterval(timer); reject(new Error('Browser condition timed out')); }
      }, 30);
    })`);
  }
  close() { this.socket.close(); }
}

const STARTUP_TIMEOUT_MS = 20000;
const EXIT_TIMEOUT_MS = 5000;
const STDERR_TAIL_CHARS = 2000;

function findChromium() {
  return [process.env.CHROME_PATH,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/chromium', '/usr/bin/google-chrome'].find((file) => file && fs.existsSync(file)) || null;
}

function isAlive(child) { return child.exitCode === null && child.signalCode === null; }

function exited(child, ms) {
  if (!isAlive(child)) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => { child.off('exit', done); resolve(false); }, ms);
    function done() { clearTimeout(timer); resolve(true); }
    child.once('exit', done);
  });
}

// Guarantees the process is gone (SIGTERM first when a grace period is given, then SIGKILL)
// and releases its stderr pipe, so a wedged browser can neither leak nor keep Node alive.
async function terminate(child, graceMs = 0) {
  if (isAlive(child) && graceMs > 0) {
    try { child.kill('SIGTERM'); } catch (_) {}
    await exited(child, graceMs);
  }
  if (isAlive(child)) {
    try { child.kill('SIGKILL'); } catch (_) {}
    await exited(child, EXIT_TIMEOUT_MS);
  }
  if (child.stderr) child.stderr.destroy();
}

// Starts one Chromium with its own fresh profile directory and resolves once DevTools is listening.
// Every failed attempt kills its own process before rejecting, so a retry or a later test can never
// find a previous attempt still holding the profile (SingletonLock) or the event loop.
async function startChromium(tempDir, { startupTimeoutMs = STARTUP_TIMEOUT_MS } = {}) {
  const executable = findChromium();
  if (!executable) return null;
  const profile = fs.mkdtempSync(path.join(tempDir, 'browser-profile-'));
  const sandboxArgs = (process.env.CI || process.env.CHROMIUM_SANDBOX_DISABLED) ? ['--no-sandbox'] : [];
  const child = spawn(executable, [...sandboxArgs, '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--remote-debugging-port=0', '--user-data-dir=' + profile,
    '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  let browserUrl;
  try {
    browserUrl = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Chromium startup timeout after ' + startupTimeoutMs + ' ms')), startupTimeoutMs);
      const fail = (error) => { clearTimeout(timer); reject(error); };
      child.once('error', fail);
      child.once('exit', (code, signal) => fail(new Error('Chromium exited before DevTools was ready (code=' + code + ', signal=' + signal + ')')));
      child.stderr.on('data', (chunk) => {
        stderr += chunk;
        const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
    });
  } catch (error) {
    await terminate(child);
    error.message += '\nexecutable: ' + executable + '\nprofile: ' + profile +
      '\nstderr (last ' + STDERR_TAIL_CHARS + ' chars): ' + stderr.slice(-STDERR_TAIL_CHARS);
    throw error;
  }
  return { child, executable, profile, browserUrl, stop: (graceMs = 3000) => terminate(child, graceMs) };
}

async function launchBrowser(tempDir) {
  const chromium = await startChromium(tempDir);
  if (!chromium) return null;
  const { browserUrl } = chromium;
  const debuggerBase = browserUrl.replace(/^ws:/, 'http:').replace(/\/devtools\/browser\/.+$/, '');
  const pages = [];
  let browser;
  try {
    const rootSocket = new WebSocket(browserUrl);
    await once(rootSocket, 'open');
    browser = new DevTools(rootSocket);
  } catch (error) {
    await chromium.stop();
    throw error;
  }
  return {
    browser,
    async page(url, token) {
      const { browserContextId } = await browser.send('Target.createBrowserContext');
      const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank', browserContextId });
      const targets = await (await fetch(debuggerBase + '/json/list')).json();
      const target = targets.find((item) => item.id === targetId);
      const ws = new WebSocket(target.webSocketDebuggerUrl);
      await once(ws, 'open');
      const page = new DevTools(ws);
      page.contextId = browserContextId;
      pages.push(page);
      await page.send('Page.enable');
      await page.send('Runtime.enable');
      await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
      await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `
        window.alert = (value) => { throw new Error('Unexpected alert: ' + value); };
        ${token ? `localStorage.setItem('sync_engine_auth_token', ${JSON.stringify(token)});` : ''}
      ` });
      await page.send('Page.navigate', { url });
      await page.wait("document.readyState === 'complete'");
      return page;
    },
    async close() {
      for (const page of pages) {
        try { page.close(); } catch (_) {}
      }
      try { await browser.send('Browser.close'); } catch (_) {}
      try { browser.close(); } catch (_) {}
      await chromium.stop();
    }
  };
}

module.exports = launchBrowser;
module.exports.startChromium = startChromium;
