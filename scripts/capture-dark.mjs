import fs from 'node:fs';
import path from 'node:path';

const port = Number(process.env.CDP_PORT ?? 9222);
const appUrl = process.env.APP_URL ?? 'http://127.0.0.1:8787';
const outFile = process.env.OUT_FILE ?? path.join(process.cwd(), 'preview-dark-cdp.png');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
const page = targets.find((target) => target.type === 'page');
if (!page) throw new Error('No page target.');

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let id = 0;
const pending = new Map();
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (!message.id) return;
  const entry = pending.get(message.id);
  if (!entry) return;
  pending.delete(message.id);
  if (message.error) entry.reject(new Error(JSON.stringify(message.error)));
  else entry.resolve(message.result);
});

function send(method, params = {}) {
  const current = ++id;
  return new Promise((resolve, reject) => {
    pending.set(current, { resolve, reject });
    socket.send(JSON.stringify({ id: current, method, params }));
  });
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  return result.result?.value;
}

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: 1440,
  height: 1000,
  deviceScaleFactor: 1,
  mobile: false,
  screenWidth: 1440,
  screenHeight: 1000,
});
await send('Page.navigate', { url: appUrl });
await sleep(2500);

await evaluate(`(() => {
  const stored = JSON.parse(localStorage.getItem('moyu.settings.v1') || '{}');
  stored.theme = 'dark';
  localStorage.setItem('moyu.settings.v1', JSON.stringify(stored));
  return true;
})()`);
await send('Page.reload');
await sleep(3000);

const state = await evaluate(`({
  theme: document.documentElement.dataset.theme,
  status: document.querySelector('.connection-pill')?.innerText,
  overflow: document.documentElement.scrollWidth > innerWidth
})`);
console.log('dark state:', state);

const shot = await send('Page.captureScreenshot', {
  format: 'png',
  fromSurface: true,
  captureBeyondViewport: false,
});
fs.writeFileSync(outFile, Buffer.from(shot.data, 'base64'));
console.log('screenshot:', outFile, fs.statSync(outFile).size, 'bytes');
socket.close();
