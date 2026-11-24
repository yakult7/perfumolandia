// Teste de chamada de ponta a ponta: abre 2 apps Electron (contas de teste) com mídia simulada,
// liga um para o outro e mede áudio, câmera e transmissão de tela.
// Uso: node scripts/e2e-call.mjs usuarioA usuarioB senha
import { spawn } from 'node:child_process';
import path from 'node:path';

const [userA, userB, pass] = process.argv.slice(2);
const ROOT = path.join(import.meta.dirname, '..');
const electron = path.join(ROOT, 'desktop', 'node_modules', 'electron', 'dist', 'electron.exe');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function launch(profile, port) {
  const p = spawn(electron, ['.', `--remote-debugging-port=${port}`], {
    cwd: path.join(ROOT, 'desktop'),
    env: { ...process.env, PERFUMO_PROFILE: profile, PERFUMO_FAKE_MEDIA: '1' },
    stdio: 'ignore',
  });
  return p;
}

async function connect(port) {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const page = list.find((t) => t.type === 'page' && t.url.startsWith('app://'));
      if (page) {
        const ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
        let id = 0;
        const pending = new Map();
        ws.onmessage = (m) => { const d = JSON.parse(m.data); if (pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
        const evaluate = (expr) => new Promise((res, rej) => {
          const i2 = ++id;
          pending.set(i2, (d) => (d.result?.exceptionDetails ? rej(new Error(d.result.exceptionDetails.exception?.description || 'erro')) : res(d.result?.result?.value)));
          ws.send(JSON.stringify({ id: i2, method: 'Runtime.evaluate', params: { expression: `(async()=>{${expr}})()`, awaitPromise: true, returnByValue: true } }));
        });
        return { evaluate, close: () => ws.close() };
      }
    } catch {}
    await sleep(500);
  }
  throw new Error('não conectou na porta ' + port);
}

const A = launch('testeA', 9301);
const B = launch('testeB', 9302);
try {
  const a = await connect(9301);
  const b = await connect(9302);
  const waitP = `for(let i=0;i<50&&!window.__p;i++) await new Promise(r=>setTimeout(r,200));`;
  const login = (u) => `${waitP} const {api,S}=window.__p; if(!S.authed) await api.login({username:'${u}',password:'${pass}'}); for(let i=0;i<50&&!S.ready;i++) await new Promise(r=>setTimeout(r,200)); return S.me.username;`;
  console.log('login A:', await a.evaluate(login(userA)));
  console.log('login B:', await b.evaluate(login(userB)));

  const dmExpr = `const {S}=window.__p; const d=Object.values(S.dms).find(d=>d.members.every(m=>S.users[m])); return d.id;`;
  const dm = await a.evaluate(dmExpr);
  console.log('sala (DM):', dm);
  await a.evaluate(`await window.__p.rtc.join('${dm}'); return 1;`);
  await b.evaluate(`await window.__p.rtc.join('${dm}'); return 1;`);
  await sleep(9000);

  const peerInfo = `const {rtc,api,S}=window.__p; const parts=(S.voice['${dm}']||[]).filter(p=>p.sid!==api.clientId);
    const out=[]; for(const p of parts){ const peer=rtc.peerOf(p.sid); if(!peer){out.push({sid:p.sid,peer:false});continue;}
      const st=await peer.pc.getStats(); let inAudio=0, inVideo=[]; st.forEach(r=>{ if(r.type==='inbound-rtp'&&r.kind==='audio') inAudio+=r.bytesReceived; if(r.type==='inbound-rtp'&&r.kind==='video') inVideo.push({w:r.frameWidth,h:r.frameHeight,fps:r.framesPerSecond,bytes:r.bytesReceived}); });
      out.push({sid:p.sid, conn:peer.pc.connectionState, inAudioBytes:inAudio, inVideo}); } return JSON.stringify(out);`;
  console.log('\n[1] VOZ  A vê:', await a.evaluate(peerInfo));
  console.log('[1] VOZ  B vê:', await b.evaluate(peerInfo));

  await a.evaluate(`await window.__p.rtc.toggleCamera(); return 1;`);
  await sleep(7000);
  console.log('\n[2] CÂMERA de A, B recebe:', await b.evaluate(peerInfo));

  const sidA = await a.evaluate(`return window.__p.api.clientId;`);
  const src = await a.evaluate(`const l=await window.perfumolandiaDesktop.getSources(); return l.find(x=>x.id.startsWith('screen'))?.id;`);
  if (process.env.CODEC) await a.evaluate(`window.__p.S.settings.codec='${process.env.CODEC}'; return 1;`);
  await a.evaluate(`await window.__p.rtc.startScreen({quality:'4k60',priority:'resolution',audio:true,sourceId:'${src}'}); return window.__p.S.call.screenLabel;`).then((l) => console.log('\n[3] TELA capturada em A:', l));
  await sleep(2500);
  await b.evaluate(`window.__p.rtc.watch('${sidA}', true); return 1;`);
  for (let i = 0; i < 4; i++) {
    await sleep(3000);
    const rx = await b.evaluate(`return JSON.stringify(await window.__p.rtc.videoStats('${sidA}','screen'));`);
    const tx = await a.evaluate(`return JSON.stringify(await window.__p.rtc.videoStats('${sidA}','screen'));`);
    console.log(`[3] t=${(i + 1) * 3}s  B recebe: ${rx}\n           A envia:  ${tx}`);
  }
  await a.evaluate(`await window.__p.rtc.leave(true); return 1;`);
  await b.evaluate(`await window.__p.rtc.leave(true); return 1;`);
  a.close(); b.close();
} catch (e) {
  console.error('ERRO:', e.message);
} finally {
  A.kill(); B.kill();
  process.exit(0);
}
