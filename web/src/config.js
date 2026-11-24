// Projeto Supabase da Perfumolandia.
// A chave "publishable" é pública por design: a segurança vem das regras RLS do banco (supabase/schema.sql).
export const SUPABASE_URL = 'https://gmaykpohnnfzcscytrpu.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_8JlHS8GgG-nZzHfqNfzB5Q_wWj7aGQb';
export const APP_NAME = 'Perfumolandia';
// usuários entram com "usuario" + senha; por baixo vira um e-mail interno
export const EMAIL_DOMAIN = 'perfumolandia.app';
// Servidor TURN opcional (só se alguém não conseguir conectar em chamadas, ex.: 4G com CGNAT rígido).
// Formato: { urls: 'turn:host:3478', username: '...', credential: '...' }
export const TURN = null;
