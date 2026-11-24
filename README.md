# Perfumolandia

Comunicador para a turma: amizades, servidores com canais de texto e voz, conversas diretas,
chamadas de voz e vídeo, e transmissão de tela em até **4K 60 fps**. Visual de vidro líquido,
feito para PC e celular.

Não precisa de servidor no seu PC: tudo roda no **Supabase** (grátis) e as chamadas são
direto entre os aparelhos (WebRTC).

## Onde baixar

Tudo sai pronto na página de versões do GitHub (compila sozinho a cada atualização):

- **Página de downloads:** https://github.com/yakult7/perfumolandia/releases/tag/latest
- **Link do app (iPhone, Android ou navegador):** https://yakult7.github.io/perfumolandia/

| Aparelho | Arquivo | Como instalar |
|---|---|---|
| Windows | `Perfumolandia-Setup-*.exe` | Abra e pronto. Também tem a versão portátil. |
| Android | `Perfumolandia.apk` | Baixe no celular, permita "instalar apps desconhecidos". |
| iPhone | link acima no **Safari** | Compartilhar → **Adicionar à Tela de Início**. |
| iPhone (app nativo) | `Perfumolandia.ipa` | Instale com o [Sideloadly](https://sideloadly.io) pelo PC usando seu Apple ID (renovar a cada 7 dias). |

**Código de convite para criar conta:** fica em Configurações → *Sobre e convites* (só quem já tem conta vê).

## O que tem

- Contas com usuário e senha, protegidas por código de convite
- Amigos: pedir, aceitar, recusar, remover, ver quem está online/ausente/não perturbe/invisível
- Servidores com convite, canais de texto e de voz, membros, dono pode remover gente
- Mensagens com **negrito**, *itálico*, `código`, ||spoiler||, links, menções `@usuario` e `@todos`,
  respostas, edição, apagar, reações com emoji, fotos/vídeos/arquivos (até 50 MB), "digitando…"
- Chamadas em canal de voz e ligação direta (toca no outro aparelho, atender/recusar)
- Mudo, ensurdecer, câmera (frontal/traseira no celular), quem está falando fica destacado
- Volume individual por pessoa e por transmissão, tela cheia, janela flutuante (PiP)
- Aperte-para-falar com tecla configurável — no app do Windows funciona **com o jogo em foco**
- Supressão de ruído, cancelamento de eco, escolha de microfone/saída/câmera, teste de microfone
- Transmissão de tela 720p até **4K 60**, com áudio do PC, escolha de tela ou janela/jogo
- Estatísticas ao vivo (resolução, fps, Mbps, codificador)
- Modo desempenho (desliga efeitos de vidro para não pesar no jogo)
- Notificações, sons, app instalável (PWA) e minimizar na bandeja no Windows

## Sobre a transmissão em 4K

- Só sai 4K de verdade se o **monitor de quem transmite for 4K** (testado aqui: 3840×2160 transmitido e recebido).
- O padrão usa **H.264 pela placa de vídeo** (testado com NVIDIA: `NVIDIA H.264 Encoder MFT`), então quase não pesa no jogo.
  Em Configurações → Transmissão dá para trocar para H.265, AV1 ou VP9.
- Cada pessoa que clica em "Assistir" consome o upload da qualidade escolhida (4K60 ≈ até 30 Mbps cada).
  Quem não assiste não gasta nada.
- Celular **assiste** transmissões e usa câmera/microfone. **Transmitir a tela do celular:**
  - **Android (APK):** sim, até 1080p 30 fps, sem o áudio do jogo.
  - **iPhone:** ainda não. A Apple não deixa o Safari capturar a tela, e o app nativo precisa de um
    módulo ReplayKit à parte (próxima etapa).

## Para quem mexe no código

```bash
npm install
npm run dev            # app no navegador em http://localhost:5173
npm run desktop        # abre o app do Windows (Electron)
npm run test:backend -- CODIGO   # testa o banco no Supabase
```

- `web/` — o app (Preact + htm, Vite). Visual em `web/src/app.css`, vidro líquido em `web/src/glass.js`
- `web/src/rtc.js` — chamadas (WebRTC em malha, tela só para quem assiste)
- `web/src/api.js` — Supabase (login, banco, tempo real, presença, arquivos)
- `supabase/schema.sql` — tabelas e regras de segurança (rode no SQL Editor do Supabase)
- `desktop/` — app do Windows (seletor de tela/janela, áudio do PC, atalho global de falar, bandeja)
- `android/`, `ios/` — apps nativos (Capacitor). Tela do Android: `ScreenSharePlugin.java`
- `.github/workflows/build.yml` — compila site, APK, IPA e instalador do Windows

### Chave de assinatura do APK

A chave fica em `keys/` (fora do Git). Guarde `keys/perfumolandia.p12` e `keys/senha.txt` em lugar seguro.
Para o GitHub assinar o APK com ela (senão sai um APK de teste), rode uma vez:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("keys\perfumolandia.p12")) | gh secret set ANDROID_KEYSTORE_B64 -R yakult7/perfumolandia
(Get-Content keys\senha.txt -Raw).Trim() | gh secret set ANDROID_KEYSTORE_PASSWORD -R yakult7/perfumolandia
```

### Se alguém não conseguir conectar na chamada

Algumas redes 4G bloqueiam conexão direta. Nesse caso configure um servidor TURN em `web/src/config.js` (`TURN`).
