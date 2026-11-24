// Markdown leve e seguro: escapa tudo antes de formatar.
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|\s|‍|️)+$/u;

export function isBigEmoji(text) {
  const t = text.trim();
  return t.length > 0 && t.length <= 24 && EMOJI_ONLY.test(t) && !/^[\d#*\s]+$/.test(t);
}

export function md(text, usernames = new Set()) {
  const slots = [];
  const keep = (h) => `\u0000${slots.push(h) - 1}\u0000`;
  let s = esc(text);
  s = s.replace(/```(?:[a-z0-9]+\n)?([\s\S]*?)```/gi, (_, c) => keep(`<pre><code>${c.replace(/^\n|\n$/g, '')}</code></pre>`));
  s = s.replace(/`([^`\n]+)`/g, (_, c) => keep(`<code>${c}</code>`));
  s = s.replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"]/g, (u) => keep(`<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`));
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/__(.+?)__/g, '<u>$1</u>');
  s = s.replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<em>$2</em>');
  s = s.replace(/(^|\W)_(?!\s)(.+?)_(?=\W|$)/g, '$1<em>$2</em>');
  s = s.replace(/~~(.+?)~~/g, '<s>$1</s>');
  s = s.replace(/\|\|(.+?)\|\|/g, '<span class="spoiler" tabindex="0">$1</span>');
  s = s.replace(/(^|\n)&gt; ?([^\n]*)/g, '$1<blockquote>$2</blockquote>');
  s = s.replace(/(^|\s)@([a-z0-9_.]{3,20}|todos)\b/g, (m, pre, name) =>
    name === 'todos' || usernames.has(name) ? `${pre}<span class="mention">@${name}</span>` : m);
  s = s.replace(/\n/g, '<br>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => slots[i]);
}
