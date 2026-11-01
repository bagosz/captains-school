// Dice tray: dice are thrown in from the side, tumble and land on results the game rolled already.
// With "One by one" on (the default, in Options) the player throws their own dice one at a time, by the Throw button or
// a click on the tray; the enemy's dice follow all at once. A banner re-roll lets the player click one of their dice (pickFrom).
import { gen, ABORT, prefs } from '../state.js';
import { $, TAU, RM, frac, rr, uiScale } from '../util.js';
import { sfx } from './audio.js';

const DICE_COL = {
  good: { body: '#f5f1e7', shade: '#d4cbb5', edge: '#9a8f77', pip: '#1f3f6a' },
  evil: { body: '#b53d2d', shade: '#862a1f', edge: '#5a1910', pip: '#f8f0e4' },
  neutral: { body: '#e6c066', shade: '#c19a40', edge: '#7a5e24', pip: '#2a2112' },
};
const PIPS = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] };
const TRAY_KEY = 'captains-school-dice-anim';
const ONE_KEY = 'captains-school-dice-one';
// A dice that counts (ringed) goes first when a row is sorted high to low.
const counts = d => (d.ok === true || d.top ? 1 : 0);

export const tray = {
  cv: $('#trayCanvas'), ctx: null, rows: [], spins: [], ask: null, W: 0, H: 0, dpr: 1, U: 1, D: 28, animated: true, oneByOne: true,
  pick: null, hover: null,   // pick: the row whose dice the player may click (a banner re-roll); hover: the dice under the pointer
  onAsk: null,   // set by main.js: called with { i, n } while the tray waits for the player to throw dice i of n, then with null
  onPick: null,  // set by main.js: called with a picked dice's ref

  init() {
    this.ctx = this.cv.getContext('2d');
    try { this.animated = localStorage.getItem(TRAY_KEY) !== 'off'; } catch (e) { /* no browser storage */ }
    const box = $('#trayAnim');
    box.checked = this.animated;
    box.addEventListener('change', () => { this.animated = box.checked; try { localStorage.setItem(TRAY_KEY, box.checked ? 'on' : 'off'); } catch (e) { /* ignore */ } });
    try { this.oneByOne = localStorage.getItem(ONE_KEY) !== 'off'; } catch (e) { /* no browser storage */ }
    const one = $('#trayOne');
    one.checked = this.oneByOne;
    one.addEventListener('change', () => { this.oneByOne = one.checked; try { localStorage.setItem(ONE_KEY, one.checked ? 'on' : 'off'); } catch (e) { /* ignore */ } });
    // A click on the tray throws the next dice, or settles the dice that are still rolling.
    this.cv.addEventListener('click', e => {
      if (this.pick) { const d = this.dieAt(e); if (d && this.onPick) this.onPick(d.ref); return; }
      if (this.ask) this.ask.go('one'); else this.settle();
    });
    this.cv.addEventListener('pointermove', e => { this.hover = this.pick ? this.dieAt(e) : null; this.cv.style.cursor = this.hover ? 'pointer' : ''; });
    this.cv.addEventListener('pointerleave', () => { this.hover = null; });
    $('#trayGo').addEventListener('click', () => { if (this.ask) this.ask.go('one'); });
    $('#trayRest').addEventListener('click', () => { if (this.ask) this.ask.go('rest'); });
    const ro = new ResizeObserver(() => this.layout());
    ro.observe(this.cv.parentElement);
    if (this.cv.closest('.side')) ro.observe(this.cv.closest('.side'));
    this.layout();
  },

  reset(title) {
    if (this.ask) this.ask.go(ABORT);
    this.pickFrom(null);
    this.settle();
    this.rows = [];
    this.title = title || '';
    $('#trayTitle').textContent = title || 'Dice tray'; $('#trayTitle').title = title || '';
    this.layout();
  },
  begin(title) { this.reset(title); },

  layout() {
    // Dice, gaps and labels grow with the UI scale (see uiScale). Long labels wrap onto more lines instead of shrinking.
    // The tray has a fixed least height; when the dice need more room it grows downwards over the unit card, then
    // upwards (keepInView scrolls the panel), up to the panel's height. Only past that is everything drawn smaller.
    const U0 = uiScale(), W = Math.max(200, this.cv.clientWidth || 320), H0 = Math.round(150 * U0);
    const side = this.cv.closest('.side'), tray = this.cv.closest('.tray');
    const chrome = tray ? tray.offsetHeight - this.cv.offsetHeight : 0;
    const Hmax = Math.max(H0, Math.round((side && side.clientHeight ? side.clientHeight : window.innerHeight * 0.6) - chrome - 8));
    let U = U0;
    for (let k = 0; k < 12 && this.place(U, W) > Hmax; k++) U *= 0.9;
    const H = Math.min(Hmax, Math.max(H0, Math.ceil(this.place(U, W))));
    this.place(U, W);
    const dpr = window.devicePixelRatio || 1;
    if (W !== this.W || H !== this.H || dpr !== this.dpr) {
      this.W = W; this.H = H; this.dpr = dpr;
      this.cv.width = Math.round(W * dpr); this.cv.height = Math.round(H * dpr); this.cv.style.height = H + 'px';
    }
    this.U = U;
    this.keepInView(side);
  },
  // When the tray reaches past the bottom of the scrolling panel, scroll the panel so its bottom shows: the tray then
  // grows upwards over the orders. (On narrow screens the panel does not scroll by itself; nothing to do there.)
  keepInView(side) {
    if (!side || getComputedStyle(side).overflowY === 'visible') return;
    const over = this.cv.getBoundingClientRect().bottom + 8 - side.getBoundingClientRect().bottom;
    if (over > 0) side.scrollTop += over;
  },
  // Places the rows and dice at scale U across width W; returns the height they take.
  place(U, W) {
    const D = this.D = Math.round(28 * U), GAP = 8 * U, PAD = 10 * U, LH = 18 * U;
    const per = Math.max(1, Math.floor((W - PAD * 2 + GAP) / (D + GAP)));
    const c = this.ctx;
    let y = PAD;
    for (const r of this.rows) {
      r.y = y;
      if (c) { c.font = this.font(r, U); r.lines = wrapText(c, r.l, W - PAD * 2 - (r.res ? c.measureText(r.res).width + 14 * U : 0)); } else r.lines = [r.l];
      const top = y + r.lines.length * LH + 4 * U, tagH = r.dice.some(d => d.mod || d.re || d.mt) ? 14 * U : 0;   // room for tags under the dice
      r.dice.forEach((d, i) => { d.fx = PAD + (i % per) * (D + GAP) + D / 2; d.fy = top + Math.floor(i / per) * (D + GAP + tagH) + D / 2; });
      y = top + (r.note ? 2 * U : Math.ceil(Math.max(1, r.dice.length) / per) * (D + GAP + tagH) + 2);
    }
    return y + PAD - 6 * U;
  },

  font(r, U = this.U) { return `${r.note ? 500 : 600} ${Math.round(14 * U)}px "Alegreya Sans", "Segoe UI", sans-serif`; },

  // A line of text without dice, e.g. why a Duel Roll was won. tone: 'good' | 'bad' | undefined.
  note(text, tone) {
    this.rows.push({ l: text, note: true, tone, res: '', settled: true, dice: [] });
    this.layout();
  },

  // groups: [{ l: label, side: 'good'|'evil'|'neutral', d: [{ v, ok, top, ref, mod }], res: text shown after landing, sort }]
  // ref: the game's own dice object (for re-rolls); mod: a modifier already in v, shown as a small tag.
  // ok true: a success (green ring); ok false: does not count (faded); top: the dice that counts on a losing side (light ring).
  // sort: show the row high to low (before the throw, or once the row has landed when its dice come one by one).
  // opt.primed: the player has just pressed a Roll button, so their first dice flies without another click.
  async throw(groups, opt = {}) {
    const speed = RM ? 0 : this.animated ? 1 : 0.3;
    const rows = groups.map(gr => ({ l: gr.l, side: gr.side || 'neutral', res: gr.res || '', sort: !!gr.sort, settled: false,
      dice: gr.d.map((x, i) => ({ v: x.v, ok: x.ok, top: x.top, ref: x.ref, mod: x.mod || 0, re: false, seed: Math.random() * 1000, delay: speed === 1 ? i * 55 + Math.random() * 70 : 0, t0: null, dur: 0,
        spin: (Math.random() < 0.5 ? -1 : 1) * (7 + Math.random() * 6), tilt: (Math.random() - 0.5) * 0.35, hops: 2 + Math.floor(Math.random() * 2), sx: 0, sy: 0 })) }));
    // With Auto roll (Options) nobody waits for a click: every dice flies at once.
    const mine = this.oneByOne && !prefs.autoRoll ? rows.filter(r => r.side === 'good').flatMap(r => r.dice) : [];
    const late = r => mine.length && r.side === 'good';
    rows.forEach(r => { if (r.sort && !late(r)) this.sortRow(r); });
    this.rows.push(...rows);
    this.layout();
    for (const r of rows) for (const d of r.dice) { d.sx = this.W + (24 + Math.random() * 30) * this.U; d.sy = this.H * (0.3 + Math.random() * 0.6); }
    this.settle();
    // The player's dice first, one per click (a click during a roll throws the next dice at once); then everything else.
    const landing = [];
    for (let i = 0; i < mine.length; i++) {
      if (i || !opt.primed) {
        const how = await this.wait(i, mine.length);
        if (how === 'rest') { landing.push(this.spin(mine.slice(i), speed)); break; }
      }
      landing.push(this.spin([mine[i]], speed));
    }
    await Promise.all(landing);
    const rest = rows.flatMap(r => r.dice).filter(d => d.t0 === null);
    if (rest.length) await this.spin(rest, speed);
    rows.forEach(r => { r.settled = true; });
    // Rows thrown one by one are put in order now; the dice slide to their new places.
    rows.filter(r => r.sort && late(r)).forEach(r => this.sortRow(r, true));
    return rows;
  },
  // Puts a row in order, high to low; slide: the dice glide to their new places.
  sortRow(r, slide) {
    const now = performance.now();
    if (slide) r.dice.forEach(d => { d.mv = { x: d.fx, y: d.fy, t0: now }; });
    r.dice.sort((a, b) => b.v - a.v || counts(b) - counts(a));
    if (slide) this.layout();
  },
  // After a Duel Roll: the highest dice of the row counts (green ring if its side won, light ring if not), the rest fade.
  markTop(r, won) {
    this.sortRow(r, true);
    r.dice.forEach((d, i) => { if (i) { d.ok = false; d.top = false; } else if (won) { d.ok = true; d.top = false; } else { d.ok = undefined; d.top = true; } });
  },
  // The player may click one of the row's dice (null ends it).
  pickFrom(r) { this.pick = r; this.hover = null; if (this.cv) this.cv.style.cursor = ''; },
  dieAt(e) {
    if (!this.pick) return null;
    const b = this.cv.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top, h = this.D / 2 + 4 * this.U;
    return this.pick.dice.find(d => Math.abs(d.fx - x) <= h && Math.abs(d.fy - y) <= h) || null;
  },
  // Re-rolls the dice of the game's dice object ref (its new value is already in ref.v): it jumps up and lands again.
  async reroll(ref) {
    const r = this.rows.find(x => x.dice.some(d => d.ref === ref)); if (!r) return;
    const d = r.dice.find(x => x.ref === ref), speed = RM ? 0 : this.animated ? 1 : 0.3;
    d.re = true;
    this.layout();
    Object.assign(d, { v: ref.v, ok: typeof ref.ok === 'boolean' ? ref.ok : undefined, top: false, mv: null, delay: 0, sx: d.fx + 18 * this.U, sy: d.fy - 34 * this.U, seed: Math.random() * 1000 });
    r.settled = false;
    await this.spin([d], speed);
    r.settled = true;
  },

  // Starts dice rolling; resolves once they have all landed (or were settled by a click on the tray).
  spin(dice, speed) {
    const g = gen, now = performance.now(), dur = 1000 * speed;
    for (const d of dice) { d.t0 = now; d.dur = dur; if (dice.length === 1) d.delay = 0; }
    sfx.dice(dice, dur);
    const total = dur + Math.max(0, ...dice.map(d => d.delay));
    return new Promise((res, rej) => {
      const sp = { dice, end: null };
      sp.end = () => {
        const k = this.spins.indexOf(sp); if (k < 0) return;
        this.spins.splice(k, 1);
        for (const d of dice) d.t0 = -1e9;
        if (g === gen) res(); else rej(ABORT);
      };
      this.spins.push(sp);
      if (!total) sp.end();
      // The game must not depend on frames being drawn: hidden tabs pause requestAnimationFrame.
      else setTimeout(sp.end, total + 60);
    });
  },
  settle() { [...this.spins].forEach(sp => sp.end()); },

  // Waits for the player to throw dice i of n: 'one' throws it, 'rest' throws all that are left. A restart rejects.
  wait(i, n) {
    const g = gen;
    return new Promise((res, rej) => {
      if (g !== gen) { rej(ABORT); return; }
      this.ask = { i, n, go: v => { this.ask = null; this.showAsk(null); if (v === ABORT || g !== gen) rej(ABORT); else res(v); } };
      this.showAsk(this.ask);
    });
  },
  showAsk(a) {
    const go = $('#trayGo'), rest = $('#trayRest');
    $('#trayThrow').hidden = !a;
    if (a) {
      go.textContent = a.n > 1 ? `Throw dice ${a.i + 1} of ${a.n}` : 'Throw your dice';
      rest.hidden = a.n - a.i < 2;
      rest.textContent = `Throw the other ${a.n - a.i}`;
      // Keyboard players can keep pressing Space or Enter (the Roll button they used is disabled now).
      const f = document.activeElement;
      if (!f || f === document.body || f.disabled || f.closest('#trayThrow')) go.focus({ preventScroll: true });
    }
    if (this.onAsk) this.onAsk(a ? { i: a.i, n: a.n } : null);
  },

  draw(now) {
    const c = this.ctx; if (!c) return;
    for (const sp of [...this.spins]) if (sp.dice.every(d => now - d.t0 - d.delay >= d.dur)) sp.end();
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, this.W, this.H);
    if (!this.rows.length) {
      c.fillStyle = 'rgba(235,228,205,0.45)'; c.font = `500 ${Math.round(14 * this.U)}px "Alegreya Sans", "Segoe UI", sans-serif`;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('Dice land here', this.W / 2, this.H / 2);
      return;
    }
    const pad = 10 * this.U, LH = 18 * this.U;
    // The player's next dice to throw pulses gently; dice not thrown yet are dashed outlines.
    const next = this.ask && this.rows.find(r => r.side === 'good' && r.dice.some(d => d.t0 === null));
    const nextDie = next && next.dice.find(d => d.t0 === null);
    for (const r of this.rows) {
      c.font = this.font(r); c.textBaseline = 'top'; c.textAlign = 'left';
      c.fillStyle = r.tone === 'good' ? '#b9ecb3' : r.tone === 'bad' ? '#ffb3a3' : 'rgba(242,235,214,0.92)';
      (r.lines || [r.l]).forEach((ln, k) => c.fillText(ln, pad, r.y + 2 + k * LH));
      if (r.settled && r.res) {
        c.textAlign = 'right';
        c.fillStyle = r.dice.some(d => d.ok === true) ? '#b9ecb3' : 'rgba(242,235,214,0.72)';
        c.fillText(r.res, this.W - pad, r.y + 2);
      }
      for (const d of r.dice) {
        if (d.t0 === null) { this.ghost(d, r.side, d === nextDie, now); continue; }
        const t = d.dur ? (now - d.t0 - d.delay) / d.dur : 1;
        if (t < 0) continue;
        this.die(d, Math.min(1, t), r.settled, r.side, now);
        if (r === this.pick && t >= 1) this.pickRing(d, now);
        if ((d.mod || d.re || d.mt) && t >= 1 && !d.mv) this.tag(d, r.side);   // not while it slides to a new place
      }
    }
  },

  // A dice the player may click to re-roll: a pulsing gold outline (solid under the pointer).
  pickRing(d, now) {
    const c = this.ctx, D = this.D, U = this.U, on = d === this.hover;
    c.save();
    c.globalAlpha = on || RM ? 1 : 0.55 + 0.45 * Math.sin(now / 240);
    c.lineWidth = (on ? 3 : 2) * U; c.strokeStyle = '#f2c45c';
    rr(c, d.fx - D / 2 - 5 * U, d.fy - D / 2 - 5 * U, D + 10 * U, D + 10 * U, D * 0.3); c.stroke();
    c.restore();
  },
  // A dice raised with Might (ref.v and ref.mt are the new value and the points spent): it hops and shows its tag.
  // ref.ok, when the game has settled it, is the dice's new success ring (a test passed now, for example).
  async bump(ref) {
    const r = this.rows.find(x => x.dice.some(d => d.ref === ref)); if (!r) return;
    const d = r.dice.find(x => x.ref === ref), speed = RM ? 0 : this.animated ? 1 : 0.3;
    Object.assign(d, { v: ref.v, mt: ref.mt || 0, ok: typeof ref.ok === 'boolean' ? ref.ok : undefined, top: false, mv: null, delay: 0, sx: d.fx, sy: d.fy - 22 * this.U, seed: Math.random() * 1000, hops: 1 });
    r.settled = false;
    await this.spin([d], speed);
    r.settled = true;
  },
  // A small tag under a dice: its modifier (e.g. −1, already in the pips), ↻ for a re-rolled dice, ★ for Might spent.
  tag(d, side) {
    const c = this.ctx, U = this.U, txt = [d.mod ? (d.mod > 0 ? '+' : '−') + Math.abs(d.mod) : '', d.re ? '↻' : '', d.mt ? `★+${d.mt}` : ''].filter(Boolean).join(' ');
    c.save();
    c.font = `700 ${Math.round(12 * U)}px "Alegreya Sans", "Segoe UI", sans-serif`; c.textAlign = 'center'; c.textBaseline = 'top';
    c.fillStyle = d.re ? '#f2c45c' : '#ffb3a3';
    c.fillText(txt, d.fx, d.fy + this.D / 2 + 3 * U);
    c.restore();
  },

  ghost(d, side, next, now) {
    const c = this.ctx, D = this.D, U = this.U, col = DICE_COL[side] || DICE_COL.neutral;
    c.save();
    c.translate(d.fx, d.fy);
    c.globalAlpha = next ? (RM ? 0.95 : 0.7 + 0.3 * Math.sin(now / 260)) : 0.55;
    c.setLineDash([4 * U, 3 * U]); c.lineWidth = 1.5 * U; c.strokeStyle = col.body;
    rr(c, -D / 2, -D / 2, D, D, D * 0.2); c.stroke();
    c.restore();
  },

  die(d, t, settled, side, now) {
    const c = this.ctx, D = this.D, U = this.U, col = DICE_COL[side] || DICE_COL.neutral;
    const e = 1 - Math.pow(1 - t, 3);
    let x = d.sx + (d.fx - d.sx) * e, y = d.sy + (d.fy - d.sy) * e;
    if (d.mv) {   // sliding to its place in a row sorted after landing
      const k = RM ? 1 : Math.min(1, (now - d.mv.t0) / 240), q = 1 - Math.pow(1 - k, 3);
      x = d.mv.x + (x - d.mv.x) * q; y = d.mv.y + (y - d.mv.y) * q;
      if (k >= 1) d.mv = null;
    }
    const hop = Math.pow(1 - t, 1.4) * Math.abs(Math.sin(t * Math.PI * d.hops)) * 16 * U;
    const rot = d.tilt + d.spin * Math.pow(1 - e, 2);
    const face = t < 0.82 ? 1 + Math.floor(frac(Math.sin(d.seed * 78.233 + Math.floor(now / 70) * 12.9898) * 43758.5453) * 6) : d.v;
    const sc = 1 + hop / (70 * U);
    c.save();
    c.globalAlpha = settled && d.ok === false ? 0.42 : 1;
    c.save();
    c.translate(x + 2 * U + hop * 0.35, y + 3 * U + hop * 0.6); c.rotate(rot);
    c.fillStyle = 'rgba(0,0,0,0.4)'; rr(c, -D / 2, -D / 2, D, D, D * 0.2); c.fill();
    c.restore();
    c.translate(x, y - hop); c.rotate(rot); c.scale(sc, sc);
    const gr = c.createLinearGradient(-D / 2, -D / 2, D / 2, D / 2);
    gr.addColorStop(0, col.body); gr.addColorStop(1, col.shade);
    rr(c, -D / 2, -D / 2, D, D, D * 0.2); c.fillStyle = gr; c.fill();
    c.lineWidth = 1.2 * U; c.strokeStyle = col.edge; c.stroke();
    c.fillStyle = col.pip;
    for (const [px, py] of PIPS[face]) { c.beginPath(); c.arc(px * D * 0.26, py * D * 0.26, D * 0.085, 0, TAU); c.fill(); }
    if (settled && (d.ok === true || d.top)) {
      c.lineWidth = 2.5 * U; c.strokeStyle = d.ok === true ? '#8fe08a' : 'rgba(242,235,214,0.85)';
      rr(c, -D / 2 - 3.5 * U, -D / 2 - 3.5 * U, D + 7 * U, D + 7 * U, D * 0.28); c.stroke();
    }
    c.restore();
  },
};

// Splits text into lines that fit maxW pixels in the context's current font.
function wrapText(c, text, maxW) {
  const lines = [];
  let cur = '';
  for (const w of text.split(' ')) {
    const t = cur ? cur + ' ' + w : w;
    if (cur && c.measureText(t).width > maxW) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}
