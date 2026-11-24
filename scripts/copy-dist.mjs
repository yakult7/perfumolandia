// Compila o app web e copia para dentro do app do Windows (desktop/dist) e o ícone.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..');
execSync('npx vite build', { cwd: ROOT, stdio: 'inherit' });
const dst = path.join(ROOT, 'desktop', 'dist');
fs.rmSync(dst, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'dist'), dst, { recursive: true });
fs.copyFileSync(path.join(ROOT, 'assets', 'icon-512.png'), path.join(ROOT, 'desktop', 'icon.png'));
console.log('dist copiado para desktop/dist');
