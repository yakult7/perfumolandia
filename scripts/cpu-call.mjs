// Mede a CPU de dois apps numa chamada de voz (microfone falso), cada um contado separado.
// Uso: node scripts/cpu-call.mjs usuarioA usuarioB senha [expressao-js-extra-em-A-e-B]
import { spawn, execSync } from 'node:child_process';
import path from 'node:path';
const [ua, ub, pass, extra = ''] = process.argv.slice(2);
const ROOT = path.join(import.meta.dirname, '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
async function open(port, profile) {
  const p = spawn(path.join(ROOT, 'desktop/node_modules/electron/dist/electron.exe'), ['.', '--remote-debugging-port=' + port], {
    cwd: path.join(ROOT, 'desktop'), env: { ...process.env, PERFUMO_PROFILE: profile, PERFUMO_FAKE_MEDIA: '1' }, stdio: 'ignore' });
  procs.push(p);
  let ws, id = 0; const pending = new Map();
  for (let i = 0; i < 60 && !ws; i++) {
    try { const pg = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page' && t.url.startsWith('app://')); if (pg) { ws = new WebSocket(pg.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r)); } } catch {}
    if (!ws) await sleep(500);
  }
  ws.onmessage = (m) => { const d = JSON.parse(m.data); pending.get(d.id)?.(d); pending.delete(d.id); };
  const cdp = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  await cdp('Runtime.evaluate', { expression: 'new Promise(r=>{const t=setInterval(()=>{if(window.__p){clearInterval(t);r(1)}},100)})', awaitPromise: true });
  return async (expr) => (await cdp('Runtime.evaluate', { expression: `(async()=>{const {api,rtc,S,actions:A,store:ST}=window.__p;${expr}})()`, awaitPromise: true, returnByValue: true })).result?.result?.value;
}
const tag = Date.now().toString(36);
const login = (u) => `await api.login({username:'${u}',password:'${pass}'}); for(let i=0;i<50&&!S.ready;i++) await new Promise(r=>setTimeout(r,200)); for(let i=0;i<40&&!S.connected;i++) await new Promise(r=>setTimeout(r,250)); return S.uid;`;
const A = await open(9391, 'ccA' + tag);
const B = await open(9392, 'ccB' + tag);
await A(login(ua)); await B(login(ub));
const room = await A(`const sv=Object.values(S.servers)[0]; return sv.channels.find(c=>c.type==='voice').id`);
await A(`await rtc.join('${room}'); ${extra}; return 1`);
await B(`await rtc.join('${room}'); ${extra}; return 1`);
await sleep(8000);
const ps = `$n=[Environment]::ProcessorCount; foreach($tag in @('ccA${tag}','ccB${tag}')){ $ids=(Get-CimInstance Win32_Process -Filter "Name='electron.exe'" | Where-Object { $_.CommandLine -match $tag }).ProcessId; $a=@{}; foreach($p in Get-Process -Id $ids -EA SilentlyContinue){$a[$p.Id]=$p.TotalProcessorTime.TotalMilliseconds}; Set-Variable -Name ('a_'+$tag) -Value $a; Set-Variable -Name ('i_'+$tag) -Value $ids }; Start-Sleep 10; foreach($tag in @('ccA${tag}','ccB${tag}')){ $a=Get-Variable -Name ('a_'+$tag) -ValueOnly; $ids=Get-Variable -Name ('i_'+$tag) -ValueOnly; $t=0; foreach($p in Get-Process -Id $ids -EA SilentlyContinue){ $t+=($p.TotalProcessorTime.TotalMilliseconds-$a[$p.Id])/10000/$n*100 }; '{0}: {1:N1}%' -f $tag.Substring(0,3),$t }`;
console.log(execSync(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"')}"`).toString().trim());
await A(`await rtc.leave(true); return 1`); await B(`await rtc.leave(true); return 1`);
procs.forEach((p) => p.kill());
process.exit(0);
