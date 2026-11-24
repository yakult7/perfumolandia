// Converte KeyboardEvent.code (do navegador) para o código de tecla do uiohook (teclado global).
const { UiohookKey: K } = require('uiohook-napi');

const SPECIAL = {
  Space: 'Space', Tab: 'Tab', CapsLock: 'CapsLock', Backquote: 'Backquote', Enter: 'Enter', Escape: 'Escape',
  ControlLeft: 'Ctrl', ControlRight: 'CtrlRight', AltLeft: 'Alt', AltRight: 'AltRight',
  ShiftLeft: 'Shift', ShiftRight: 'ShiftRight', MetaLeft: 'Meta', MetaRight: 'MetaRight',
  Minus: 'Minus', Equal: 'Equal', BracketLeft: 'BracketLeft', BracketRight: 'BracketRight',
  Backslash: 'Backslash', Semicolon: 'Semicolon', Quote: 'Quote', Comma: 'Comma', Period: 'Period', Slash: 'Slash',
  Insert: 'Insert', Delete: 'Delete', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
  ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight',
};

function codeToUiohook(code) {
  let name = null;
  if (/^Key[A-Z]$/.test(code)) name = code.slice(3);
  else if (/^Digit[0-9]$/.test(code)) name = code.slice(5);
  else if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) name = code;
  else if (/^Numpad[0-9]$/.test(code)) name = code;
  else name = SPECIAL[code] || null;
  return name && K[name] != null ? K[name] : null;
}

module.exports = { codeToUiohook };
