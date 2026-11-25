// Catálogo da loja: molduras de avatar (arte em SVG, estilo "avatar decoration") e efeitos de perfil. Tudo grátis.
export const DECORATIONS = [
  { id: 'rosas', name: 'Jardim de Prata', desc: 'Rosas de prata em filigrana com brilho correndo.', tag: 'Sofisticada' },
  { id: 'sakura', name: 'Sakura', desc: 'Galho de cerejeira em flor com pétalas caindo.', tag: 'Animada' },
  { id: 'tinta', name: 'Tinta Oceano', desc: 'Pinceladas de tinta ciano envolvendo a foto.', tag: 'Animada' },
  { id: 'nebulosa', name: 'Nebulosa', desc: 'Pinceladas magenta e violeta, como fumaça.', tag: 'Animada' },
  { id: 'louros', name: 'Louros de Ouro', desc: 'Coroa de louros dourada com estrela e reflexo.', tag: 'Sofisticada' },
  { id: 'ondas', name: 'Safira Real', desc: 'Aro de esmalte azul com filigrana e pedras em ouro.', tag: 'Sofisticada' },
  { id: 'frasco', name: 'Frasco de Cristal', desc: 'Aro de vidro e o frasquinho da Perfumolandia. Exclusiva.', tag: 'Exclusiva' },
  { id: 'borboletas', name: 'Borboletas', desc: 'Duas borboletas batendo asas em volta de você.', tag: 'Animada' },
  { id: 'constelacao', name: 'Constelação', desc: 'Estrelas ligadas piscando ao redor.', tag: 'Animada' },
  { id: 'chamas', name: 'Chama Azul', desc: 'Anel de fogo azul dançando em volta da foto.', tag: 'Animada' },
  { id: 'raiva', name: 'Pistola', desc: 'Pincelada vermelha e o símbolo de raiva pulsando.', tag: 'Divertida' },
  { id: 'gotas', name: 'Nervoso', desc: 'Gotinhas de suor balançando.', tag: 'Divertida' },
];

export const EFFECTS = [
  { id: 'petalas', name: 'Chuva de Sakura', desc: 'Pétalas de cerejeira caindo pelo cartão.' },
  { id: 'jardim', name: 'Jardim de Prata', desc: 'Rosas de prata nos cantos do banner, com brilho.' },
  { id: 'bokeh', name: 'Luzes', desc: 'Luzes desfocadas flutuando, como numa foto noturna.' },
  { id: 'estrelas', name: 'Céu Estrelado', desc: 'Estrelas piscando e cadentes.' },
  { id: 'neve', name: 'Inverno', desc: 'Flocos de neve caindo devagar.' },
  { id: 'aurora', name: 'Aurora Boreal', desc: 'Faixas de luz verde e violeta se movendo.' },
];

export const itemId = (kind, id) => `${kind}:${id}`;
