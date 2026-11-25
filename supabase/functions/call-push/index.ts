// Função "call-push" (Supabase Edge Function): faz o celular tocar quando alguém liga, mesmo com o app fechado.
//   POST { dmId, action: 'ring' | 'cancel' }   (com o login de quem está ligando)
// Manda para todos os aparelhos dos outros membros da conversa:
//   - Web Push (iPhone/Android com o app na tela inicial)  -> segredos VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY
//   - Firebase (app Android)                               -> segredo FCM_SERVICE_ACCOUNT (JSON da conta de serviço)
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';
import webpush from 'npm:web-push@3.6.7';
import { SignJWT, importPKCS8 } from 'npm:jose@5.9.6';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const URL_ = Deno.env.get('SUPABASE_URL')!;
// chave de serviço: a antiga (service_role) ou a nova (sb_secret_...)
const firstKey = (name: string) => { try { const v = JSON.parse(Deno.env.get(name) || '{}'); return Object.values(v)[0] as string | undefined; } catch { return undefined; } };
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || firstKey('SUPABASE_SECRET_KEYS') || '';
const VAPID_PUB = Deno.env.get('VAPID_PUBLIC_KEY');
const VAPID_PRIV = Deno.env.get('VAPID_PRIVATE_KEY');
const FCM_SA = Deno.env.get('FCM_SERVICE_ACCOUNT');
if (VAPID_PUB && VAPID_PRIV) webpush.setVapidDetails('https://yakult7.github.io/perfumolandia/', VAPID_PUB, VAPID_PRIV);

// token de acesso do Firebase (vale 1 hora)
let fcmToken: { value: string; exp: number } | null = null;
async function fcmAccess(sa: { client_email: string; private_key: string }) {
  if (fcmToken && fcmToken.exp > Date.now() + 60_000) return fcmToken.value;
  const key = await importPKCS8(sa.private_key, 'RS256');
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/firebase.messaging' })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(sa.client_email).setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt(now).setExpirationTime(now + 3600).sign(key);
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('firebase: ' + JSON.stringify(j));
  fcmToken = { value: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return fcmToken.value;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'método' }, 405);
  const db = createClient(URL_, SERVICE, { auth: { persistSession: false } });
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: { user: me } } = await db.auth.getUser(jwt);
  if (!me) return json({ error: 'login' }, 401);
  const { dmId, action } = await req.json().catch(() => ({}));
  if (typeof dmId !== 'string' || !['ring', 'cancel'].includes(action)) return json({ error: 'dados' }, 400);

  // quem está na conversa (só manda se quem liga é membro)
  let members: string[] = [];
  let title = '';
  const { data: dm } = await db.from('dms').select('user_a,user_b').eq('id', dmId).maybeSingle();
  if (dm) members = [dm.user_a, dm.user_b];
  else {
    const { data: gm } = await db.from('group_members').select('user_id').eq('group_id', dmId);
    members = (gm || []).map((x) => x.user_id);
    const { data: g } = await db.from('groups').select('name').eq('id', dmId).maybeSingle();
    title = g?.name || 'Grupo';
  }
  if (!members.includes(me.id)) return json({ error: 'conversa' }, 403);
  let to = members.filter((id) => id !== me.id);
  // não toca para quem bloqueou quem está ligando nem para quem está em "Não perturbe"
  const { data: blocks } = await db.from('blocks').select('blocker').eq('blocked', me.id).in('blocker', to);
  const { data: profs } = await db.from('profiles').select('id,display_name,status').in('id', [me.id, ...to]);
  const blocked = new Set((blocks || []).map((b) => b.blocker));
  to = to.filter((id) => !blocked.has(id) && profs?.find((p) => p.id === id)?.status !== 'dnd');
  if (!to.length) return json({ sent: 0 });
  const name = profs?.find((p) => p.id === me.id)?.display_name || 'Alguém';

  const { data: subs } = await db.from('push_subs').select('id,kind,token,keys').in('user_id', to);
  const payload = { type: action === 'ring' ? 'call' : 'cancel', dmId, from: me.id, name, group: title, at: String(Date.now()) };
  const dead: string[] = [];
  let sent = 0;
  await Promise.all((subs || []).map(async (s) => {
    try {
      if (s.kind === 'web') {
        if (!VAPID_PUB || !VAPID_PRIV) return;
        await webpush.sendNotification({ endpoint: s.token, keys: s.keys }, JSON.stringify(payload), { TTL: 45, urgency: 'high', topic: 'call' });
        sent++;
      } else {
        if (!FCM_SA) return;
        const sa = JSON.parse(FCM_SA);
        const r = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${await fcmAccess(sa)}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: { token: s.token, data: payload, android: { priority: 'HIGH', ttl: '45s' } } }),
        });
        if (r.status === 404 || r.status === 400) { const t = await r.text(); if (/UNREGISTERED|INVALID_ARGUMENT|not a valid FCM/i.test(t)) dead.push(s.id); }
        else if (r.ok) sent++;
      }
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) dead.push(s.id); // inscrição vencida
      else console.warn('push', s.kind, String(e).slice(0, 200));
    }
  }));
  if (dead.length) await db.from('push_subs').delete().in('id', dead);
  return json({ sent });
});
