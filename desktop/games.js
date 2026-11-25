// Detecta o jogo aberto no Windows (para o status "Jogando ...").
// - Jogos da Steam: nome e capa oficiais (appmanifest + CDN da Steam).
// - Outros (Epic, Riot, Xbox, Ubisoft, EA, Battle.net, Minecraft, Roblox...): nome do executável e ícone dele.
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

// pastas onde as lojas instalam jogos
const GAME_DIRS = /\\steamapps\\common\\|\\Epic Games\\|\\Riot Games\\|\\XboxGames\\|\\WindowsApps\\.*(Minecraft|Xbox)|\\Ubisoft Game Launcher\\games\\|\\EA Games\\|\\Electronic Arts\\|\\GOG Galaxy\\Games\\|\\Battle\.net\\|\\Rockstar Games\\|\\Program Files( \(x86\))?\\(Blizzard|Activision|Overwolf\\.*Games)/i;
// programas dessas pastas que não são o jogo em si
const NOT_GAME = /launcher|crash|report|helper|service|setup|install|update|anticheat|easyanticheat|beservice|vc_?redist|dxsetup|uninst|riotclient|epicgames|steamwebhelper|overlay|cefprocess|webview|unitycrash|battle\.net|agent|eadesktop|eabackground|origin|ubisoftconnect|^upc$|galaxyclient|xboxpcapp|gamebar|socialclub/i;
// jogos conhecidos fora dessas pastas: processo -> nome
const KNOWN = {
  robloxplayerbeta: 'Roblox',
  'minecraft.windows': 'Minecraft',
  'league of legends': 'League of Legends',
  'valorant-win64-shipping': 'VALORANT',
  'fortniteclient-win64-shipping': 'Fortnite',
  gta5: 'Grand Theft Auto V',
  osu: 'osu!',
};

const PS = `
$ErrorActionPreference='SilentlyContinue'
Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.Path } | ForEach-Object {
  [pscustomobject]@{ n=$_.ProcessName; i=$_.Id; p=$_.Path; t=$_.MainWindowTitle; d=$_.MainModule.FileVersionInfo.FileDescription }
} | ConvertTo-Json -Compress`;

function listWindows() {
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', PS], { windowsHide: true, timeout: 15000, maxBuffer: 4 << 20 }, (err, out) => {
      try { const j = JSON.parse(out || '[]'); resolve(Array.isArray(j) ? j : [j]); } catch { resolve([]); }
    });
  });
}

// Steam: acha o appid pelo appmanifest da biblioteca onde o jogo está
const steamCache = new Map();
function steamInfo(exePath) {
  const m = exePath.match(/^(.*\\steamapps)\\common\\([^\\]+)/i);
  if (!m) return null;
  const key = m[1] + '|' + m[2].toLowerCase();
  if (steamCache.has(key)) return steamCache.get(key);
  let info = null;
  try {
    for (const f of fs.readdirSync(m[1])) {
      if (!/^appmanifest_\d+\.acf$/.test(f)) continue;
      const txt = fs.readFileSync(path.join(m[1], f), 'utf8');
      const dir = txt.match(/"installdir"\s+"([^"]+)"/)?.[1];
      if (dir && dir.toLowerCase() === m[2].toLowerCase()) {
        info = { appid: txt.match(/"appid"\s+"(\d+)"/)?.[1], name: txt.match(/"name"\s+"([^"]+)"/)?.[1] || m[2] };
        break;
      }
    }
  } catch {}
  info ||= { appid: null, name: m[2] };
  steamCache.set(key, info);
  return info;
}

function pick(list) {
  for (const w of list) {
    const n = String(w.n || '').toLowerCase();
    const p = String(w.p || '');
    if (KNOWN[n]) return { w, name: KNOWN[n] };
    if ((n === 'javaw' || n === 'java') && /^Minecraft/i.test(w.t || '')) return { w, name: 'Minecraft' };
    if (GAME_DIRS.test(p) && !NOT_GAME.test(n) && !NOT_GAME.test(path.basename(p))) return { w, name: null };
  }
  return null;
}

// capa oficial da loja (jogos novos têm endereço com hash, por isso pergunta para a Steam)
const headerCache = new Map();
async function steamHeader(appid) {
  if (headerCache.has(appid)) return headerCache.get(appid);
  let url = `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appid}/header.jpg`;
  try {
    const r = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appid}&filters=basic`, { signal: AbortSignal.timeout(8000) });
    const j = await r.json();
    if (j?.[appid]?.data?.header_image) url = j[appid].data.header_image;
    headerCache.set(appid, url);
  } catch {}
  return url;
}

// ---------- música (Spotify) ----------
// Tocando, a janela do Spotify tem o título "Artista - Música"; pausado, fica "Spotify", "Spotify Premium"...
const artCache = new Map();
async function albumArt(artist, title) {
  const k = artist + '|' + title;
  if (artCache.has(k)) return artCache.get(k);
  let url = null;
  try {
    const q = encodeURIComponent(`${artist} ${title}`.slice(0, 120));
    // artista + música; se não achar, a música mais conhecida do artista (melhor que nada)
    const tries = [[q, null], [encodeURIComponent(artist.slice(0, 80)), artist]];
    outer: for (const [term, mustArtist] of tries) {
      for (const country of ['BR', 'US']) {
        const r = await fetch(`https://itunes.apple.com/search?term=${term}&entity=song&limit=5&country=${country}`, { signal: AbortSignal.timeout(6000) });
        const j = await r.json();
        const hit = (j?.results || []).find((x) => !mustArtist || String(x.artistName || '').toLowerCase().includes(mustArtist.toLowerCase().split(/[,&]/)[0].trim()));
        url = hit?.artworkUrl100?.replace('100x100bb', '300x300bb') || null;
        if (url) break outer;
      }
    }
  } catch {}
  artCache.set(k, url);
  return url;
}
async function detectMusic(list) {
  const w = list.find((x) => String(x.n || '').toLowerCase() === 'spotify' && / - /.test(x.t || '') && !/^spotify/i.test(x.t || ''));
  if (!w) return null;
  const t = String(w.t);
  const i = t.indexOf(' - ');
  const artist = t.slice(0, i).trim(), title = t.slice(i + 3).trim();
  return { key: 'spotify:' + t, app: 'Spotify', artist: artist.slice(0, 80), title: title.slice(0, 100), art: await albumArt(artist, title), pid: w.i };
}

/** devolve { name, img, key } ou null */
async function detectGame(app, listIn) {
  const hit = pick(listIn || (await listWindows()));
  if (!hit) return null;
  const { w } = hit;
  const steam = steamInfo(w.p);
  if (steam?.appid) {
    return { key: 'steam:' + steam.appid, name: steam.name, img: await steamHeader(steam.appid), wide: true };
  }
  const desc = String(w.d || '').trim();
  const name = hit.name || steam?.name || (desc && !/^(game|launcher)$/i.test(desc) ? desc : '') || (w.t || '').trim() || path.basename(w.p, '.exe');
  let img = null;
  try { img = (await app.getFileIcon(w.p, { size: 'large' })).toDataURL(); } catch {}
  return { key: 'exe:' + w.p.toLowerCase(), name: name.slice(0, 60), img };
}

/** procura a cada 15 s e avisa só quando muda */
/** procura a cada 6 s (jogo e música) e avisa só quando muda */
function watchGames(app, onChange, onMusic) {
  if (process.platform !== 'win32') return;
  let last = null, lastMusic = null, busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const list = await listWindows();
      const g = await detectGame(app, list).catch(() => null);
      const k = g?.key || null;
      if (k !== last) { last = k; onChange(g); }
      const m = await detectMusic(list).catch(() => null);
      const mk = m?.key || null;
      if (mk !== lastMusic) { lastMusic = mk; onMusic?.(m); }
    } finally { busy = false; }
  };
  tick();
  setInterval(tick, 6000);
}

module.exports = { watchGames, detectGame, detectMusic };
