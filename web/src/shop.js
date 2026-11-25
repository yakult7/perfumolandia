// Catálogo da loja (tudo grátis): pacotes como na loja do Discord, molduras de avatar,
// molduras do cartão de perfil e efeitos de perfil.
export const DECORATIONS = [
  { id: 'filigrana', name: 'Filigrana de Rosas', desc: 'Rosas brancas e lilás em filigrana, com brilho.', tag: 'Sofisticada' },
  { id: 'lua', name: 'Lua Negra', desc: 'Lua crescente em pincelada, preto e prata.', tag: 'Sofisticada' },
  { id: 'coelhinho', name: 'Coelhinho Gótico', desc: 'Tiara de renda com orelhinhas e laços.', tag: 'Sofisticada' },
  { id: 'rosas', name: 'Jardim de Prata', desc: 'Rosas de prata em filigrana com brilho correndo.', tag: 'Sofisticada' },
  { id: 'louros', name: 'Louros de Ouro', desc: 'Coroa de louros dourada com estrela e reflexo.', tag: 'Sofisticada' },
  { id: 'ondas', name: 'Safira Real', desc: 'Aro de esmalte azul com filigrana e pedras em ouro.', tag: 'Sofisticada' },
  { id: 'sakura', name: 'Sakura', desc: 'Galho de cerejeira em flor com pétalas caindo.', tag: 'Animada' },
  { id: 'tinta', name: 'Tinta Oceano', desc: 'Pinceladas de tinta ciano envolvendo a foto.', tag: 'Animada' },
  { id: 'nebulosa', name: 'Nebulosa', desc: 'Pinceladas magenta e violeta, como fumaça.', tag: 'Animada' },
  { id: 'frasco', name: 'Frasco de Cristal', desc: 'Aro de vidro e o frasquinho da Perfumolandia.', tag: 'Exclusiva' },
  { id: 'borboletas', name: 'Borboletas', desc: 'Duas borboletas batendo asas em volta de você.', tag: 'Animada' },
  { id: 'constelacao', name: 'Constelação', desc: 'Estrelas ligadas piscando ao redor.', tag: 'Animada' },
  { id: 'chamas', name: 'Chama Azul', desc: 'Anel de fogo azul dançando em volta da foto.', tag: 'Animada' },
  { id: 'raiva', name: 'Pistola', desc: 'Pincelada vermelha e o símbolo de raiva pulsando.', tag: 'Divertida' },
  { id: 'gotas', name: 'Nervoso', desc: 'Gotinhas de suor balançando.', tag: 'Divertida' },
];

export const FRAMES = [
  { id: 'rosas', name: 'Filigrana de Rosas', desc: 'Arco de rosas brancas e filigrana lilás brilhando.' },
  { id: 'lua', name: 'Lua Negra', desc: 'Lua cheia, galhos retorcidos e corvos de olhos vermelhos.' },
  { id: 'coelhinho', name: 'Coelhinho Gótico', desc: 'Renda preta e branca, pérolas, laços e orelhinhas.' },
  { id: 'barroco', name: 'Ouro Barroco', desc: 'Volutas douradas, coroa e rubi no centro.' },
  { id: 'sakura', name: 'Sakura', desc: 'Galhos de cerejeira florindo pelos cantos.' },
];

export const EFFECTS = [
  { id: 'lilas', name: 'Brilho Lilás', desc: 'Faíscas e luzes lilás flutuando suavemente.' },
  { id: 'nevoa', name: 'Névoa da Lua', desc: 'Névoa passando e cinzas caindo.' },
  { id: 'noir', name: 'Corações Noir', desc: 'Corações preto e branco subindo.' },
  { id: 'ouro', name: 'Pó de Ouro', desc: 'Purpurina dourada caindo e brilhando.' },
  { id: 'petalas', name: 'Chuva de Sakura', desc: 'Pétalas de cerejeira caindo pelo cartão.' },
  { id: 'bokeh', name: 'Luzes', desc: 'Luzes desfocadas flutuando, como numa foto noturna.' },
  { id: 'estrelas', name: 'Céu Estrelado', desc: 'Estrelas piscando e cadentes.' },
  { id: 'neve', name: 'Inverno', desc: 'Flocos de neve caindo devagar.' },
  { id: 'aurora', name: 'Aurora Boreal', desc: 'Faixas de luz verde e violeta se movendo.' },
];

/** pacotes: moldura de avatar + moldura do cartão + efeito (resgata e usa tudo de uma vez) */
export const BUNDLES = [
  { id: 'rosas', name: 'Filigrana de Rosas', deco: 'filigrana', frame: 'rosas', effect: 'lilas', c1: '#2a2440', c2: '#6f62a8' },
  { id: 'lua', name: 'Lua Negra', deco: 'lua', frame: 'lua', effect: 'nevoa', c1: '#0e1116', c2: '#3b4252' },
  { id: 'coelhinho', name: 'Coelhinho Gótico', deco: 'coelhinho', frame: 'coelhinho', effect: 'noir', c1: '#0c0c0f', c2: '#3a3a44' },
  { id: 'barroco', name: 'Ouro Barroco', deco: 'louros', frame: 'barroco', effect: 'ouro', c1: '#2a1d08', c2: '#7a5513' },
  { id: 'sakura', name: 'Sakura', deco: 'sakura', frame: 'sakura', effect: 'petalas', c1: '#3a1f2c', c2: '#d46a92' },
];

export const itemId = (kind, id) => `${kind}:${id}`;
