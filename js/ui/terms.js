// Rule terms as links: the first time a glossary term (as the rulebook writes it, capitalised: "Control Zone",
// "Charge", "In The Way") appears in a piece of text it is marked; pointing at it shows the rule's short text and its
// Rules Manual link, a click (or Enter) opens the entry in the Rules tab. One level only: the tag has no terms of its
// own. The listeners are delegated, so a term keeps working when the orders are drawn again.
import { RULES, MANUAL, ruleShort, ruleTerms } from '../data/rules-text.js';
import { esc } from '../util.js';

let RX = null, KEY = null, open = null;
function build() {
  const list = ruleTerms();
  KEY = new Map(list);
  RX = new RegExp(`(?<![\\w-])(${list.map(([t]) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![\\w-])`, 'g');
}
const SKIP = 'a, button, .term, .rchip, .cline, script, style, .no-terms';

// Marks the terms in the text of el (each term once per call; seen: terms already marked by an earlier call).
export function linkTerms(el, seen = new Set()) {
  if (!el) return;
  if (!RX) build();
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: n => (n.parentElement && n.parentElement.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
  const nodes = [];
  for (let n = walk.nextNode(); n; n = walk.nextNode()) nodes.push(n);
  for (const n of nodes) {
    const s = n.nodeValue;
    RX.lastIndex = 0;
    let m, last = 0, frag = null;
    while ((m = RX.exec(s))) {
      const k = KEY.get(m[1]);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      frag = frag || document.createDocumentFragment();
      frag.append(s.slice(last, m.index));
      const t = document.createElement('span');
      t.className = 'term'; t.dataset.rule = k; t.tabIndex = 0; t.textContent = m[1];
      frag.append(t);
      last = m.index + m[1].length;
    }
    if (frag) { frag.append(s.slice(last)); n.replaceWith(frag); }
  }
}
export const termsHTML = (html, seen) => { const d = document.createElement('div'); d.innerHTML = html; linkTerms(d, seen); return d.innerHTML; };

// onOpen(k): opens rule k in the Rules tab (panel.js: showRule).
export function initTerms(onOpen) {
  const tip = document.createElement('div');
  tip.id = 'termTip'; tip.className = 'term-tip'; tip.hidden = true; tip.setAttribute('role', 'tooltip');
  document.body.append(tip);
  let hideT = 0;
  const show = t => {
    const k = t.dataset.rule, r = RULES[k];
    if (!r) return;
    clearTimeout(hideT); open = t;
    const ref = r.refs && r.refs[0];
    tip.innerHTML = `<b>${esc(r.t)}</b><span>${esc(ruleShort(k))}</span><span class="tt-links"><button class="linkbtn" type="button" data-tt-open="${k}">Open in Rules</button>${ref ? ` · <a href="${MANUAL + ref[0]}" target="_blank" rel="noopener">Rules Manual ↗</a>` : ''}</span>`;
    tip.hidden = false;
    const b = t.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
    const x = Math.max(8, Math.min(innerWidth - w - 8, b.left + b.width / 2 - w / 2));
    const y = b.top - h - 6 > 4 ? b.top - h - 6 : b.bottom + 6;
    tip.style.left = `${x + scrollX}px`; tip.style.top = `${y + scrollY}px`;
  };
  const hide = () => { hideT = setTimeout(() => { tip.hidden = true; open = null; }, 250); };
  document.addEventListener('pointerover', e => { const t = e.target.closest && e.target.closest('.term'); if (t) show(t); else if (e.target.closest && e.target.closest('#termTip')) clearTimeout(hideT); });
  document.addEventListener('pointerout', e => { if (e.target.closest && (e.target.closest('.term') || e.target.closest('#termTip'))) hide(); });
  document.addEventListener('focusin', e => { const t = e.target.closest && e.target.closest('.term'); if (t) show(t); });
  document.addEventListener('focusout', e => { if (e.target.closest && e.target.closest('.term')) hide(); });
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-tt-open]');
    if (b) { tip.hidden = true; onOpen(b.dataset.ttOpen); return; }
    const t = e.target.closest && e.target.closest('.term');
    if (t) { e.preventDefault(); tip.hidden = true; onOpen(t.dataset.rule); }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !tip.hidden) { e.stopPropagation(); tip.hidden = true; return; }
    const t = e.key === 'Enter' && e.target.closest && e.target.closest('.term');
    if (t) { e.preventDefault(); onOpen(t.dataset.rule); }
  }, true);
}
export const termTipOpen = () => open;
