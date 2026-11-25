// Catálogo da loja: molduras de avatar e efeitos de perfil (todos animados em CSS, grátis para resgatar).
export const DECORATIONS = [
  { id: 'neon', name: 'Neon', desc: 'Anel neon girando em rosa, ciano e roxo.', tag: 'Animada' },
  { id: 'arcoiris', name: 'Arco-íris', desc: 'Todas as cores dando a volta.', tag: 'Animada' },
  { id: 'aurora', name: 'Aurora', desc: 'Brilho suave que respira em volta da foto.', tag: 'Animada' },
  { id: 'fogo', name: 'Em chamas', desc: 'Labaredas subindo pela borda.', tag: 'Animada' },
  { id: 'gelo', name: 'Gelo', desc: 'Cristal congelado com reflexo passando.', tag: 'Animada' },
  { id: 'ouro', name: 'Ouro', desc: 'Moldura dourada com brilho de joia.', tag: 'Animada' },
  { id: 'estrelas', name: 'Órbita', desc: 'Estrelinhas girando em volta de você.', tag: 'Animada' },
  { id: 'coracoes', name: 'Apaixonado', desc: 'Coraçõezinhos flutuando.', tag: 'Animada' },
  { id: 'coroa', name: 'Realeza', desc: 'Coroa no topo, balançando.', tag: 'Animada' },
  { id: 'gatinho', name: 'Gatinho', desc: 'Orelhinhas que mexem.', tag: 'Animada' },
  { id: 'perfume', name: 'Frasco', desc: 'Vidro de perfume com bolhas subindo. Exclusiva da Perfumolandia.', tag: 'Exclusiva' },
  { id: 'glitch', name: 'Glitch', desc: 'Borda tremendo em vermelho e ciano.', tag: 'Animada' },
];

export const EFFECTS = [
  { id: 'brilhos', name: 'Brilhos', desc: 'Faíscas piscando pelo cartão.' },
  { id: 'neve', name: 'Neve', desc: 'Flocos caindo devagar.' },
  { id: 'confete', name: 'Confete', desc: 'Festa no seu perfil.' },
  { id: 'bolhas', name: 'Bolhas', desc: 'Bolhas de perfume subindo.' },
  { id: 'petalas', name: 'Pétalas', desc: 'Pétalas de flor caindo.' },
  { id: 'coracoes', name: 'Corações', desc: 'Corações subindo pelo cartão.' },
];

export const itemId = (kind, id) => `${kind}:${id}`;
