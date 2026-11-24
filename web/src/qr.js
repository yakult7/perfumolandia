import qrcode from 'qrcode-generator';

/** QR code em SVG (correção alta, para caber o logo no meio) */
export function qrSvg(text) {
  const q = qrcode(0, 'H');
  q.addData(text);
  q.make();
  return q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
}
