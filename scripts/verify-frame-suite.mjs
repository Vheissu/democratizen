// Exercise installed widgets through the TV inspector. Reports remain local.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { selectApps } from '../suite/catalog.mjs';
const workspace = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const selected = selectApps(process.argv[2] || 'all'),
  sdb = process.env.FRAME_SUITE_SDB,
  serial = process.env.FRAME_SUITE_SERIAL;
if (!sdb || !serial) throw Error('Use npm run suite:verify to configure SDB.');
const output = path.join(workspace, 'dist/frame-suite'),
  builds = JSON.parse(
    await fs.readFile(path.join(output, 'builds.json'), 'utf8'),
  ),
  results = [];
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function run(args, strict = true) {
  const r = spawnSync(sdb, ['-s', serial, ...args], {
    cwd: workspace,
    encoding: 'utf8',
    timeout: 20000,
  });
  const text = (r.stdout || '') + (r.stderr || '');
  if (strict && (r.error || r.status !== 0))
    throw Error(r.error?.message || text);
  return text;
}
function check(value, message) {
  if (!value) throw Error(message);
}
async function connect(port) {
  let targets;
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      targets = await (
        await fetch(`http://127.0.0.1:${port}/json/list`, {
          signal: AbortSignal.timeout(2000),
        })
      ).json();
      if (targets.some((t) => t.type === 'page')) break;
    } catch {}
    await pause(200);
  }
  const target = targets?.find((t) => t.type === 'page');
  check(target, 'TV inspector did not expose a page.');
  const url = new URL(target.webSocketDebuggerUrl);
  url.host = `127.0.0.1:${port}`;
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.terminate();
      reject(Error('Inspector connection timed out.'));
    }, 5000);
    socket.once('open', () => {
      clearTimeout(timeout);
      resolve();
    });
    socket.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
  let next = 1;
  const pending = new Map(),
    errors = [];
  socket.on('message', (raw) => {
    const m = JSON.parse(raw);
    if (m.method === 'Runtime.exceptionThrown')
      errors.push(
        m.params.exceptionDetails.exception?.description ||
          m.params.exceptionDetails.text,
      );
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      clearTimeout(p.timer);
      m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result);
    }
  });
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = next++,
        timer = setTimeout(() => {
          pending.delete(id);
          reject(Error(`${method} timed out.`));
        }, 15000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression) {
    const r = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true,
    });
    if (r.exceptionDetails)
      throw Error(
        r.exceptionDetails.exception?.description || r.exceptionDetails.text,
      );
    return r.result.value;
  }
  await send('Runtime.enable');
  return {
    send,
    evaluate,
    errors,
    close() {
      for (const p of pending.values()) {
        clearTimeout(p.timer);
        p.reject(Error('Inspector closed.'));
      }
      pending.clear();
      socket.close();
    },
  };
}
function exercise(id) {
  return `(async()=>{
  const q=s=>document.querySelector(s),wait=ms=>new Promise(r=>setTimeout(r,ms));
  const key=(name,code)=>document.dispatchEvent(new KeyboardEvent('keydown',{key:name,keyCode:code,bubbles:true,cancelable:true}));
  const check=(value,message)=>{if(!value)throw Error(message);};
  for(let i=0;i<100&&!window.FRAME_SUITE_BUILD_ID;i++)await wait(100);
  check(window.FRAME_SUITE_BUILD_ID,"App did not finish starting.");
  await document.fonts.ready;const id=${JSON.stringify(id)};
  const prefix='democratizen:'+id+':',saved=Object.fromEntries(Object.entries(localStorage).filter(([key])=>key.startsWith(prefix)));
  const restore=()=>{for(const key of Object.keys(localStorage))if(key.startsWith(prefix))localStorage.removeItem(key);for(const[key,value]of Object.entries(saved))localStorage.setItem(key,value);};
  try {
  if(id==='snake'){q('[data-mode="expedition"]').click();q('[data-difficulty="mellow"]').click();q('[data-start]').click();key('ArrowDown',40);await wait(250);key('Unidentified',10009);check(!q('.snake-overlay').hidden,'Snake did not pause on Samsung Back');q('[data-overlay-menu]').focus();key('Enter',13);check(!q('.snake-menu').hidden,'Snake menu return failed');}
  if(['blocks','paddle','merge','mines','pairs'].includes(id)){
    q('.arcade-menu button').click();
    if(id==='blocks'){key('ArrowLeft',37);key('ArrowUp',38);key('Enter',13);check(Number(q('[data-stat="score"]').textContent)>0,'Blocks did not drop');}
    if(id==='paddle'){key('Enter',13);key('ArrowRight',39);await wait(250);}
    if(id==='merge'){key('ArrowLeft',37);key('ArrowDown',40);check(q('.merge-tile'),'Merge board missing');}
    if(id==='mines'){key('Enter',13);check(parseInt(q('[data-stat="safe"]').textContent)>0,'Mine reveal failed');}
    if(id==='pairs'){key('Enter',13);check(q('.pair-card.open'),'Memory card did not open');}
    key('Unidentified',10009);check(!q('.arcade-overlay').hidden,'Samsung Back did not pause');
  }
  if(id==='focus'){q('[data-toggle]').click();check(q('[data-state]').textContent==='Running','Focus did not start');key('Unidentified',10009);check(['Ready','Paused'].includes(q('[data-state]').textContent),'Focus did not pause');}
  if(id==='breathe'){q('[data-start]').click();await wait(100);check(q('[data-word]').textContent==='Inhale','Breathing did not begin');key('Unidentified',10009);check(q('[data-word]').textContent==='Ready','Breathing did not stop');}
  if(id==='clocks'){q('[data-edit]').click();check(!q('[data-picker]').hidden,'City picker did not open');key('Unidentified',10009);check(q('[data-picker]').hidden,'City picker did not close');}
  if(id==='pixel'){q('[data-edit]').click();key('ArrowRight',39);key('Enter',13);key('Unidentified',10009);q('[data-save]').click();check(q('[data-status]').textContent==='Saved on this TV.','Drawing did not save');}
  if(id==='life'){q('[data-pattern="glider"]').click();q('[data-step]').click();check(q('[data-status]').textContent.includes('Generation 1'),'Life did not advance');q('[data-edit]').click();key('Enter',13);key('Unidentified',10009);}
  if(id==='soundscape'){
    const Native=window.AudioContext||window.webkitAudioContext;
    window.AudioContext=class extends Native{constructor(...args){super(...args);window.__frameTestAudio=this;}};
    q('[data-play]').click();await wait(1600);check(window.__frameTestAudio?.state==='running','Audio context did not start');check(q('[data-status]').textContent.startsWith('Playing'),'Soundscape did not play');key('Unidentified',10009);await wait(100);check(window.__frameTestAudio.state==='suspended','Audio did not stop on Back');window.AudioContext=Native;
  }
  const main=q('main');return{title:document.title,appId:tizen.application.getCurrentApplication().appInfo.id,buildId:window.FRAME_SUITE_BUILD_ID,width:innerWidth,height:innerHeight,overflow:main.scrollHeight>main.clientHeight+2||main.scrollWidth>main.clientWidth+2,toast:q('#suite-toast').textContent};
  } finally { restore();window.addEventListener('pagehide',restore,{once:true}); }
})()`;
}
for (const [index, app] of selected.entries()) {
  let client;
  const port = 9400 + index;
  try {
    run(['shell', '0', 'was_kill', app.appId], false);
    const launch = run(['shell', '0', 'debug', app.appId]);
    const remote = launch.match(/port:\s*(\d+)/)?.[1];
    check(remote, `No debug port: ${launch}`);
    run(['forward', `tcp:${port}`, `tcp:${remote}`]);
    client = await connect(port);
    const result = await client.evaluate(exercise(app.id));
    check(result.appId === app.appId, 'Inspector belongs to another app.');
    check(
      result.buildId === builds.find((b) => b.id === app.id)?.buildId,
      'Installed build differs from current source build.',
    );
    check(!result.overflow, 'App overflows the TV viewport.');
    check(!client.errors.length, client.errors.join('\n'));
    check(!result.toast, result.toast);
    results.push({ id: app.id, passed: true, ...result });
    console.log(
      `${index + 1}/${selected.length}: ${app.name} renders and responds on the TV.`,
    );
    if (process.env.FRAME_SUITE_SCREENSHOTS === '1') {
      const shot = await client.send('Page.captureScreenshot', {
        format: 'png',
      });
      await fs.writeFile(
        path.join(output, `${app.id}-tv.png`),
        Buffer.from(shot.data, 'base64'),
      );
    }
  } catch (error) {
    results.push({ id: app.id, passed: false, error: error.message });
    console.error(`${app.name}: ${error.message}`);
  } finally {
    client?.close();
    run(['forward', '--remove', `tcp:${port}`], false);
    run(['shell', '0', 'was_kill', app.appId], false);
  }
}
await fs.writeFile(
  path.join(output, 'runtime-results.json'),
  JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2) +
    '\n',
);
const failed = results.filter((r) => !r.passed);
console.log(
  `${results.length - failed.length}/${selected.length} TV runtime checks passed; ${failed.length} errors.`,
);
if (selected.some((a) => a.id === 'snake'))
  run(
    ['shell', '0', 'was_execute', selected.find((a) => a.id === 'snake').appId],
    false,
  );
if (failed.length) process.exitCode = 1;
