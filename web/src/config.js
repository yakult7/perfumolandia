// Projeto Supabase da Perfumolandia.
// A chave "publishable" é pública por design: a segurança vem das regras RLS do banco (supabase/schema.sql).
export const SUPABASE_URL = 'https://gmaykpohnnfzcscytrpu.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_8JlHS8GgG-nZzHfqNfzB5Q_wWj7aGQb';
export const APP_NAME = 'Perfumolandia';
// site público (apresentação + downloads) e arquivos das versões
export const SITE_URL = 'https://yakult7.github.io/perfumolandia/';
export const DOWNLOAD_BASE = 'https://github.com/yakult7/perfumolandia/releases/latest/download/';
// usuários entram com "usuario" + senha; por baixo vira um e-mail interno
export const EMAIL_DOMAIN = 'perfumolandia.app';
// Servidor TURN opcional (só se alguém não conseguir conectar em chamadas, ex.: 4G com CGNAT rígido).
// Formato: { urls: 'turn:host:3478', username: '...', credential: '...' }
export const TURN = null;
