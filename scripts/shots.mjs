// Tira capturas de tela do app do Windows em resoluÃ§Ã£o real (para revisar o visual).
// Uso: node scripts/shots.mjs usuario senha pasta-de-saida
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [user, pass, outDir = '.'] = process.argv.slice(2);
const ROOT = path.join(import.meta.dirname, '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(outDir, { recursive: true });

const proc = spawn(path.join(ROOT, 'desktop/node_modules/electron/dist/electron.exe'), ['.', '--remote-debugging-port=9331'], {
  cwd: path.join(ROOT, 'desktop'), env: { ...process.env, PERFUMO_PROFILE: 'shots-' + Date.now().toString(36), PERFUMO_FAKE_MEDIA: '1', PERFUMO_HIDDEN: '1' }, stdio: 'ignore',
});
let ws, id = 0;
const pending = new Map();
for (let i = 0; i < 60 && !ws; i++) {
  try {
    const page = (await (await fetch('http://127.0.0.1:9331/json')).json()).find((t) => t.type === 'page' && t.url.startsWith('app://'));
    if (page) { ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r)); }
  } catch {}
  if (!ws) await sleep(500);
}
ws.onmessage = (m) => { const d = JSON.parse(m.data); pending.get(d.id)?.(d); pending.delete(d.id); };
const cdp = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => {
  const r = await cdp('Runtime.evaluate', { expression: `(async()=>{const {api,rtc,S,actions:A,store:ST}=window.__p;${expr}})()`, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) console.error('  erro:', r.result.exceptionDetails.exception?.description?.split('\n')[0]);
  return r.result?.result?.value;
};
const chans = () => ev("return api.sb.getChannels().map(c => c.topic.slice(9, 20) + '=' + c.state).join(' ') + ' conn=' + S.connected");
const shot = async (name, w = 1440, h = 900) => {
  console.log('  ', name, '|', await chans());
  await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
  await sleep(1300);
  const r = await cdp('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(outDir, name + '.png'), Buffer.from(r.result.data, 'base64'));
  console.log('ok', name);
};

await cdp('Runtime.evaluate', { expression: 'new Promise(r=>{const t=setInterval(()=>{if(window.__p){clearInterval(t);r(1)}},100)})', awaitPromise: true });
const theme = (t) => ev(`ST.setSettings({theme:'${t}'}); return 1;`);

await theme('dark'); await shot('01-login-escuro');
await theme('light'); await shot('02-login-claro');
await ev(`await api.login({username:'${user}',password:'${pass}'}); for(let i=0;i<50&&!S.ready;i++) await new Promise(r=>setTimeout(r,200)); return 1;`);
await theme('dark');
await ev(`A.goHome('online'); return 1;`); await shot('03-amigos-escuro');
await ev(`const id=Object.keys(S.dms)[0]; A.go(null,id); return 1;`); await shot('04-conversa-escuro');
await theme('light'); await shot('05-conversa-claro');
await theme('dark');
await ev(`const sv=Object.values(S.servers)[0]; if(sv) A.go(sv.id); return 1;`); await shot('06-servidor-escuro');
await ev(`A.openModal('settings',{tab:'account'}); return 1;`); await shot('07-perfil-editor');
await ev(`A.openModal('settings',{tab:'look'}); return 1;`); await shot('08-aparencia');
await ev(`A.closeModal(); A.openModal('profile',{id:S.uid}); return 1;`); await shot('09-cartao-perfil');
await ev(`A.closeModal(); const sv=Object.values(S.servers)[0]; const vc=sv?.channels.find(c=>c.type==='voice'); if(vc){ await rtc.join(vc.id); ST.setUI({stage:true}); } return 1;`); await shot('10-chamada-sozinho');
await ev(`await rtc.toggleCamera(); return 1;`); await shot('11-chamada-camera');
await ev(`await rtc.leave(true); ST.setUI({stage:false}); const id=Object.keys(S.dms)[0]; A.go(null,id); await rtc.join(id); return 1;`); await shot('12-chamada-na-conversa');
await ev(`await rtc.leave(true); A.goHome('online'); ST.setUI({tab:'dms'}); return 1;`);
console.log('estado:', await ev(`await new Promise(r=>setTimeout(r,2500)); return JSON.stringify({connected:S.connected, chans: api.sb.getChannels().map(c=>c.topic+':'+c.state), voice:Object.keys(S.voice)})`));
await shot('13-celular', 390, 844);
console.log('estado apÃ³s celular:', await ev(`return JSON.stringify({connected:S.connected, chans: api.sb.getChannels().map(c=>c.topic+':'+c.state), hidden: document.hidden})`));
await ev(`const id=Object.keys(S.dms)[0]; A.go(null,id); return 1;`); await shot('14-celular-conversa', 390, 844);
await theme('light'); await ev(`ST.setUI({pane:'list', tab:'me'}); return 1;`); await shot('15-celular-voce-claro', 390, 844);
proc.kill();
process.exit(0);




