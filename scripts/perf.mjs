// Mede fluidez do app do Windows: CPU parado (com foco), FPS e travadas rolando o chat e abrindo os ajustes.
// Uso: node scripts/perf.mjs usuario senha
import { spawn, execSync } from 'node:child_process';
import path from 'node:path';

const [user, pass] = process.argv.slice(2);
const ROOT = path.join(import.meta.dirname, '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PROFILE = 'perf' + Date.now().toString(36);
const proc = spawn(path.join(ROOT, 'desktop/node_modules/electron/dist/electron.exe'), ['.', '--remote-debugging-port=9362'], {
  cwd: path.join(ROOT, 'desktop'), env: { ...process.env, PERFUMO_PROFILE: PROFILE }, stdio: 'ignore',
});
let ws, id = 0;
const pending = new Map();
for (let i = 0; i < 60 && !ws; i++) {
  try {
    const page = (await (await fetch('http://127.0.0.1:9362/json')).json()).find((t) => t.type === 'page' && t.url.startsWith('app://'));
    if (page) { ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r)); }
  } catch {}
  if (!ws) await sleep(500);
}
ws.onmessage = (m) => { const d = JSON.parse(m.data); pending.get(d.id)?.(d); pending.delete(d.id); };
const cdp = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => (await cdp('Runtime.evaluate', { expression: `(async()=>{const {api,rtc,S,actions:A,store:ST}=window.__p;${expr}})()`, awaitPromise: true, returnByValue: true })).result?.result?.value;
await cdp('Runtime.evaluate', { expression: 'new Promise(r=>{const t=setInterval(()=>{if(window.__p){clearInterval(t);r(1)}},100)})', awaitPromise: true });
await cdp('Emulation.setFocusEmulationEnabled', { enabled: true });
await ev(`await api.login({username:'${user}',password:'${pass}'}); for(let i=0;i<50&&!S.ready;i++) await new Promise(r=>setTimeout(r,200)); document.querySelectorAll('button').forEach(b=>b.innerText==='Agora não'&&b.click()); return 1;`);
await sleep(4000);

function cpu(sec) {
  const ps = `$procs = Get-CimInstance Win32_Process -Filter "Name='electron.exe'" | Where-Object { $_.CommandLine -match '${PROFILE}' -or $_.ProcessId -eq ${proc.pid} };
$a=@{}; foreach($p in Get-Process -Id $procs.ProcessId -EA SilentlyContinue){$a[$p.Id]=$p.TotalProcessorTime.TotalMilliseconds};
Start-Sleep ${sec}; $n=[Environment]::ProcessorCount; $t=0; $s='';
foreach($p in Get-Process -Id $procs.ProcessId -EA SilentlyContinue){$d=($p.TotalProcessorTime.TotalMilliseconds-$a[$p.Id])/(${sec}*1000)/$n*100; $t+=$d; $cl=($procs|?{$_.ProcessId -eq $p.Id}).CommandLine; $ty=if($cl -match '--type=([a-z-]+)'){$matches[1]}else{'main'}; if($d -gt 0.2){$s+=('{0}={1:N1}% ' -f $ty,$d)}};
'TOTAL {0:N1}%  ({1})' -f $t,$s`;
  return execSync(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`).toString().trim();
}
// FPS e quadros longos durante uma ação
const frames = (action, ms) => ev(`
  const lt=[]; const po=new PerformanceObserver(l=>{for(const e of l.getEntries()) lt.push(e.duration)}); po.observe({type:'longtask',buffered:false});
  let n=0, worst=0, last=performance.now(); let on=true;
  const tick=(t)=>{ if(!on) return; n++; worst=Math.max(worst,t-last); last=t; requestAnimationFrame(tick); }; requestAnimationFrame(tick);
  const t0=performance.now(); ${action}
  await new Promise(r=>setTimeout(r,${ms})); on=false; po.disconnect();
  const dt=(performance.now()-t0)/1000;
  return { fps: Math.round(n/dt), piorQuadroMs: Math.round(worst), travadas: lt.length, travadaMaiorMs: Math.round(Math.max(0,...lt)) };`);

console.log('parado com foco:', cpu(8));
const dm = await ev(`const id=Object.keys(S.dms)[0]; A.go(null,id); await new Promise(r=>setTimeout(r,2500)); return id;`);
console.log('rolando o chat:', JSON.stringify(await frames(`
  const el=document.querySelector('.msgs'); let d=-1;
  const iv=setInterval(()=>{ if(!el) return; el.scrollTop += d*60; if(el.scrollTop<=0) d=1; if(el.scrollTop+el.clientHeight>=el.scrollHeight-2) d=-1; },16);
  setTimeout(()=>clearInterval(iv),4000);`, 4200)));
console.log('abrindo ajustes:', JSON.stringify(await frames(`A.openModal('settings',{tab:'look'}); setTimeout(()=>A.closeModal(),1200); setTimeout(()=>A.openModal('settings',{tab:'voice'}),1600); setTimeout(()=>A.closeModal(),2600);`, 3000)));
console.log('busca Ctrl+K:', JSON.stringify(await frames(`A.openModal('search'); setTimeout(()=>A.closeModal(),1200);`, 1500)));
console.log('mouse passando nas conversas:', JSON.stringify(await frames(`
  const rows=[...document.querySelectorAll('.dm, .ch')]; let i=0; const iv=setInterval(()=>{ rows.forEach(r=>r.classList.remove('hovertest')); const r=rows[i++%rows.length]; r?.dispatchEvent(new MouseEvent('mouseover',{bubbles:true})); },50);
  setTimeout(()=>clearInterval(iv),2000);`, 2200)));
console.log('chat no fim ao abrir:', await ev(`const ids=[...Object.keys(S.dms),...Object.keys(S.groups)]; const out=[]; for (const id of ids.slice(0,4)) { A.go(null,id); await new Promise(r=>setTimeout(r,2500)); const el=document.querySelector('.msgs'); out.push(el? Math.round(el.scrollHeight-el.scrollTop-el.clientHeight) : 'sem'); } return 'distancia do fim (px): '+out.join(', ');`));
console.log('parado depois:', cpu(8));
proc.kill();
process.exit(0);
