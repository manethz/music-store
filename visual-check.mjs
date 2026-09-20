import {writeFile} from 'fs/promises';

const frontend='http://127.0.0.1:5173';
const debug='http://127.0.0.1:9223';
const wait=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));

async function connect(){
  let targets;
  for(let attempt=0;attempt<30;attempt++){
    try{targets=await fetch(`${debug}/json/list`).then(response=>response.json());break;}catch{await wait(200);}
  }
  if(!targets?.length)throw new Error('Chrome debugging endpoint did not become ready');
  const socket=new WebSocket(targets[0].webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  let nextId=0;
  const pending=new Map();
  socket.onmessage=event=>{const message=JSON.parse(event.data);if(message.id&&pending.has(message.id)){const {resolve,reject}=pending.get(message.id);pending.delete(message.id);message.error?reject(new Error(message.error.message)):resolve(message.result);}};
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++nextId;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
  return {socket,send};
}

const {socket,send}=await connect();
await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate',{url:`${frontend}/staff/login`});
await wait(800);

const login=await fetch('http://127.0.0.1:5000/api/auth/staff-login',{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({email:'admin@musicstore.demo',password:'Demo123!'})
});
if(!login.ok)throw new Error(`Staff login failed with ${login.status}`);
const {token}=await login.json();
await send('Runtime.evaluate',{expression:`localStorage.setItem('token',${JSON.stringify(JSON.stringify(token))})`});

async function capture(name,width,height,mobile){
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile});
  await send('Page.navigate',{url:`${frontend}/staff/products/new`});
  await wait(1400);
  const state=await send('Runtime.evaluate',{returnByValue:true,expression:`JSON.stringify({title:document.querySelector('h1')?.textContent,save:[...document.querySelectorAll('button')].some(button=>button.textContent.includes('Save Product')),categories:document.querySelectorAll('#category option').length,scrollWidth:document.documentElement.scrollWidth,innerWidth:window.innerWidth,bodyHeight:document.body.scrollHeight})`});
  const values=JSON.parse(state.result.value);
  const layout=await send('Page.getLayoutMetrics');
  const screenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:Math.min(layout.cssContentSize.width,width),height:layout.cssContentSize.height,scale:1}});
  await writeFile(name,Buffer.from(screenshot.data,'base64'));
  return values;
}

const desktop=await capture('staff-product-desktop.png',1440,1000,false);
const mobile=await capture('staff-product-mobile.png',390,844,true);
console.log(JSON.stringify({desktop,mobile},null,2));
await send('Browser.close');
socket.close();
