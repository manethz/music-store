const frontend = 'http://127.0.0.1:5173';
const debug = 'http://127.0.0.1:9225';
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function connect() {
  let targets;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      targets = await fetch(`${debug}/json/list`).then((response) => response.json());
      break;
    } catch {
      await wait(200);
    }
  }
  if (!targets?.length) throw new Error('Chrome debugging endpoint did not become ready');
  const target = targets.find((item) => item.type === 'page' && !item.url.includes('background'))
    || targets.find((item) => item.type === 'page');
  if (!target) throw new Error('Chrome page target did not become ready');
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  let nextId = 0;
  const pending = new Map();
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const handlers = pending.get(message.id);
    pending.delete(message.id);
    message.error ? handlers.reject(new Error(message.error.message)) : handlers.resolve(message.result);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  return { socket, send };
}

const { socket, send } = await connect();
await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: `${frontend}/login` });
await wait(1000);

const evaluate = (expression) => send('Runtime.evaluate', { expression, returnByValue: true });
const setCredentials = (email, password) => evaluate(`(() => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  const email = document.querySelector('#login-email');
  const password = document.querySelector('#login-password');
  setter.call(email, ${JSON.stringify(email)});
  email.dispatchEvent(new Event('input', { bubbles: true }));
  setter.call(password, ${JSON.stringify(password)});
  password.dispatchEvent(new Event('input', { bubbles: true }));
})()`);

await setCredentials('customer@musicstore.demo', 'WrongPassword');
await evaluate(`document.querySelector('.login-submit').click()`);
await wait(900);
const incorrect = await evaluate(`JSON.stringify({
  error: document.querySelector('.login-alert')?.textContent.trim(),
  passwordCleared: document.querySelector('#login-password')?.value === ''
})`);

await evaluate(`document.querySelector('#staff-login-tab').click()`);
await wait(100);
const switched = await evaluate(`JSON.stringify({
  selected: document.querySelector('[role=tab][aria-selected=true]')?.textContent.trim(),
  errorCleared: !document.querySelector('.login-alert'),
  heading: document.querySelector('h1')?.textContent
})`);

await setCredentials('admin@musicstore.demo', 'Demo123!');
await evaluate(`document.querySelector('.login-submit').click()`);
await wait(1200);
const staffLogin = await evaluate(`JSON.stringify({
  path: location.pathname,
  nameVisible: document.body.textContent.includes('System Administrator'),
  productsVisible: document.body.textContent.includes('Products'),
  reportsVisible: document.body.textContent.includes('Reports')
})`);

await send('Page.reload');
await wait(1100);
const refresh = await evaluate(`JSON.stringify({
  path: location.pathname,
  nameVisible: document.body.textContent.includes('System Administrator')
})`);

console.log(JSON.stringify({
  incorrect: JSON.parse(incorrect.result.value),
  switched: JSON.parse(switched.result.value),
  staffLogin: JSON.parse(staffLogin.result.value),
  refresh: JSON.parse(refresh.result.value)
}, null, 2));
await send('Browser.close');
socket.close();
