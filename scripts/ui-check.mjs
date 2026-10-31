import fs from 'node:fs';
import path from 'node:path';

const cdpPort = Number(process.env.CDP_PORT ?? 9222);
const appUrl = process.env.APP_URL ?? 'http://127.0.0.1:8787';
const outDir = process.env.OUT_DIR ?? process.cwd();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const targets = await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then((response) => response.json());
const page = targets.find((target) => target.type === 'page');
if (!page) throw new Error('No CDP page target found.');

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let commandId = 0;
const pending = new Map();
const exceptions = [];
const consoleErrors = [];
const eventWaiters = new Map();

socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id) {
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    if (message.error) entry.reject(new Error(JSON.stringify(message.error)));
    else entry.resolve(message.result);
    return;
  }

  if (message.method === 'Runtime.exceptionThrown') {
    exceptions.push(message.params.exceptionDetails?.exception?.description ?? 'Unknown exception');
  }
  if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
    consoleErrors.push(
      message.params.args
        .map((arg) => arg.value ?? arg.description ?? '')
        .join(' ')
        .slice(0, 500),
    );
  }
  if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
    consoleErrors.push(message.params.entry.text.slice(0, 500));
  }

  const waiters = eventWaiters.get(message.method);
  if (waiters?.length) {
    eventWaiters.delete(message.method);
    for (const waiter of waiters) waiter(message.params);
  }
});

function send(method, params = {}) {
  const id = ++commandId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

function once(method, timeout = 15_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${method}`)), timeout);
    const waiters = eventWaiters.get(method) ?? [];
    waiters.push((params) => {
      clearTimeout(timer);
      resolve(params);
    });
    eventWaiters.set(method, waiters);
  });
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? 'Evaluation failed');
  }
  return result.result?.value;
}

async function screenshot(name) {
  const result = await send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
  });
  const file = path.join(outDir, name);
  fs.writeFileSync(file, Buffer.from(result.data, 'base64'));
  console.log('screenshot:', file, fs.statSync(file).size, 'bytes');
}

async function setViewport(width, height, mobile) {
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile,
    screenWidth: width,
    screenHeight: height,
  });
}

async function loadApp() {
  const loaded = once('Page.loadEventFired');
  await send('Page.navigate', { url: appUrl });
  await loaded;
  await sleep(2200);
}

await send('Page.enable');
await send('Runtime.enable');
await send('Log.enable');

// Start from a clean profile state so screenshots and checks are deterministic.
await send('Page.navigate', { url: appUrl });
await sleep(1200);
await evaluate(`localStorage.clear()`);

await setViewport(1440, 1000, false);
await loadApp();

const initial = await evaluate(`({
  title: document.title,
  model: document.querySelector('.model-trigger')?.innerText,
  status: document.querySelector('.connection-pill')?.innerText,
  heading: document.querySelector('h1')?.innerText,
  overflow: document.documentElement.scrollWidth > window.innerWidth
})`);
console.log('initial:', initial);
await screenshot('preview-home-cdp.png');

await evaluate(`(() => {
  const textarea = document.querySelector('.composer textarea');
  if (!textarea) throw new Error('composer not found');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  setter.call(textarea, '你好，请用三句话介绍你自己，并告诉我你能帮我做什么。');
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`);
await sleep(350);
await evaluate(`document.querySelector('.send-button:not(.stop)')?.click()`);

let answer = '';
let errorText = '';
for (let attempt = 0; attempt < 120; attempt += 1) {
  await sleep(1000);
  const state = await evaluate(`(() => {
    const assistant = [...document.querySelectorAll('.message-row.assistant')].pop();
    return {
      text: assistant?.querySelector('.markdown')?.innerText ?? '',
      error: assistant?.querySelector('.message-error')?.innerText ?? '',
      streaming: Boolean(document.querySelector('.send-button.stop')),
      status: document.querySelector('.connection-pill')?.innerText ?? '',
    };
  })()`);
  answer = state.text;
  errorText = state.error;
  if ((answer.length > 0 || errorText) && !state.streaming) break;
  if (attempt === 3) await screenshot('preview-streaming.png');
}

console.log('answer preview:', answer.slice(0, 500));
if (errorText) console.log('answer error:', errorText);
await sleep(400);
await screenshot('preview-chat.png');

await evaluate(`document.querySelector('[aria-label="打开设置"]')?.click()`);
await sleep(450);
await screenshot('preview-settings.png');
await evaluate(`document.querySelector('.dialog-close')?.click()`);

await setViewport(390, 844, true);
await loadApp();
const mobile = await evaluate(`({
  width: window.innerWidth,
  overflow: document.documentElement.scrollWidth > window.innerWidth,
  menuVisible: getComputedStyle(document.querySelector('.mobile-menu')).display,
  composerWidth: document.querySelector('.composer')?.getBoundingClientRect().width
})`);
console.log('mobile:', mobile);
await screenshot('preview-mobile-cdp.png');

console.log('exceptions:', exceptions);
console.log('console errors:', consoleErrors);
socket.close();
