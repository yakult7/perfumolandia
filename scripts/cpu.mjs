// Mede a CPU do app do Windows (renderer + GPU + principal) numa tela parada.
// Uso: node scripts/cpu.mjs usuario senha [expressao-js-antes-de-medir]
import { spawn, execSync } from 'node:child_process';
import path from 'node:path';

const [user, pass, setup = ''] = process.argv.slice(2);
const ROOT = path.join(import.meta.dirname, '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PROFILE = 'cpu' + Date.now().toString(36);
const proc = spawn(path.join(ROOT, 'desktop/node_modules/electron/dist/electron.exe'), ['.', '--remote-debugging-port=9361', ...(process.env.EXTRA_ARGS ? process.env.EXTRA_ARGS.split(' ') : [])], {
  cwd: path.join(ROOT, 'desktop'), env: { ...process.env, PERFUMO_PROFILE: PROFILE }, stdio: 'ignore',
});
let ws, id = 0;
const pending = new Map();
for (let i = 0; i < 60 && !ws; i++) {
  try {
    const page = (await (await fetch('http://127.0.0.1:9361/json')).json()).find((t) => t.type === 'page' && t.url.startsWith('app://'));
    if (page) { ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r)); }
  } catch {}
  if (!ws) await sleep(500);
}
ws.onmessage = (m) => { const d = JSON.parse(m.data); pending.get(d.id)?.(d); pending.delete(d.id); };
const cdp = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => (await cdp('Runtime.evaluate', { expression: `(async()=>{const {api,rtc,S,actions:A,store:ST}=window.__p;${expr}})()`, awaitPromise: true, returnByValue: true })).result?.result?.value;
await cdp('Runtime.evaluate', { expression: 'new Promise(r=>{const t=setInterval(()=>{if(window.__p){clearInterval(t);r(1)}},100)})', awaitPromise: true });
await ev(`await api.login({username:'${user}',password:'${pass}'}); for(let i=0;i<50&&!S.ready;i++) await new Promise(r=>setTimeout(r,200)); return 1;`);
if (setup) await ev(setup);
await sleep(6000);

function sample(sec) {
  const ps = `$procs = Get-CimInstance Win32_Process -Filter "Name='electron.exe'" | Where-Object { $_.CommandLine -match '${PROFILE}' -or $_.ProcessId -eq ${proc.pid} };
$a=@{}; foreach($p in Get-Process -Id $procs.ProcessId -EA SilentlyContinue){$a[$p.Id]=$p.TotalProcessorTime.TotalMilliseconds};
Start-Sleep ${sec}; $n=[Environment]::ProcessorCount; $t=0;
foreach($p in Get-Process -Id $procs.ProcessId -EA SilentlyContinue){$d=($p.TotalProcessorTime.TotalMilliseconds-$a[$p.Id])/(${sec}*1000)/$n*100; $t+=$d; $cl=($procs|?{$_.ProcessId -eq $p.Id}).CommandLine; $ty=if($cl -match '--type=([a-z-]+)'){$matches[1]}else{'main'}; if($d -gt 0.2){'{0,6:N1}% {1}' -f $d,$ty}};
'TOTAL {0:N1}%' -f $t`;
  return execSync(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`).toString().trim();
}
if (process.env.LIST) console.log(await ev(process.env.LIST)); else console.log(sample(10));
proc.kill();
process.exit(0);
