// Rolling procedures shared by the game (js/game/flow.js), the headless game (engine/sim.js) and the tools.
// Each one is a generator that follows the 2024 rules step by step and stops (yields) wherever a dice is shown or
// somebody decides, so the game and the tools go through exactly the same steps in exactly the same order:
// the roll, then any re-roll, then modifiers, and Might always last (p. 18, 77). The game drives a procedure with
// the dice tray and its buttons; the tools drive it with run() and the computer's choices (engine/ai.js).
//
// What a procedure yields (a request):
//   { k: 'dice', step, u, die | dice, ... }   a roll to show; nothing to answer
//   { k: 'reroll', step, u, die, was }        a dice was re-rolled; nothing to answer
//   { k: 'raise', step, u, die, from, n }     Might raised a dice by n; nothing to answer
//   { k: 'might', step, u, die, opts, ... }   answer: how many Might Points to spend on the dice (0 keeps it);
//                                             opts: [{ n, to }], the values worth reaching and what each costs
//   { k: 'fate', u, left }                    answer: true to spend a Fate Point
//   { k: 'courage', u, T, short }             answer: 'will', 'might' or null (a failed Courage Test, p. 87)
// Other modules add their own requests (Duel Roll, Heroic Actions); each is documented where it is yielded.
import { d6 } from '../util.js';
import { woundNeed, courageTest, intelligenceTest } from './rules.js';

// Drives a procedure without anybody watching: answer(request) returns the reply for each request.
export function run(gen, answer) {
  let r = gen.next();
  while (!r.done) r = gen.next(answer(r.value));
  return r.value;
}

/* ---------- Might (p. 76–78) ---------- */
export const isHero = u => !!(u && u.T.hero && u.mwf);
// A Might Point raises one of the Hero's own dice by 1, never above 6 (p. 76); die.mt counts the points on that dice.
export function mightUp(u, die) { if (!u.might || die.v >= 6) return false; die.v++; die.mt = (die.mt || 0) + 1; u.might--; return true; }
// The values worth reaching on a dice with Might, cheapest first: [{ n: points, to }].
export const mightOpts = (u, v, goals) => reach(u, v, goals);
const reach = (u, v, goals) => (isHero(u) ? [...new Set(goals)].filter(g => g > v && g <= 6 && g - v <= u.might).sort((a, b) => a - b).map(to => ({ n: to - v, to })) : []);

/* ---------- One D6 test ---------- */
// A D6 test by model u (the one rolling it), passed on `need` or more: To Hit, In The Way, a Jump, Leap, Climb or
// Thrown Rider Test, a Fate Roll. opt: { step, label, reroll: a failed roll may be re-rolled once (Heroic Accuracy for
// In The Way; Expert Rider for a 1 on the Thrown Rider Test), goals: further values worth reaching with Might (a 6 on a
// Jump Test goes on), ctx: anything the deciding side wants to know }. A Hero may raise the dice with Might once the
// re-roll is done. Returns the dice: { v (with Might), n (as rolled), mt, re, ok }.
// opt.mod: added to the roll (Cave Dweller +1 on Jump, Leap and Climb Tests), never above 6.
export function* d6Test(u, need, opt = {}) {
  const die = { n: d6(), v: 0, mt: 0, re: false, ok: false }, mod = opt.mod || 0;
  die.v = Math.min(6, die.n + mod); die.ok = die.v >= need;
  yield { k: 'dice', step: opt.step, u, die, need, label: opt.label, ctx: opt.ctx };
  if (!die.ok && opt.reroll && (!opt.rerollIf || opt.rerollIf(die))) {
    const was = die.v;
    die.n = d6(); die.v = Math.min(6, die.n + mod); die.re = true; die.was = was; die.ok = die.v >= need;
    yield { k: 'reroll', step: opt.step, u, die, was, why: opt.reroll };
  }
  const opts = reach(u, die.v, die.ok ? opt.goals || [] : [need, ...(opt.goals || [])]);
  if (opts.length) {
    const n = Math.min(+((yield { k: 'might', step: opt.step, u, die, need, opts, label: opt.label, ctx: opt.ctx }) || 0), 6 - die.v, u.might);
    if (n > 0) {
      const from = die.v;
      for (let i = 0; i < n; i++) mightUp(u, die);
      die.ok = die.v >= need;
      yield { k: 'raise', step: opt.step, u, die, from, n };
    }
  }
  return die;
}

/* ---------- To Wound (p. 45, 77) ---------- */
// One To Wound dice, re-rolled once where a special rule says so (p. 122–133): opt.reroll 'ones' (Poisoned Attacks,
// Ancient Enemies; opt.poison, a poisoned weapon, the same) re-rolls a natural 1, 'fails' (Bane of Kings, Venom) a dice
// that fails; ok(n) tells whether the natural n succeeds. Returns { n, rr } (rr: the natural first rolled, or 0).
function roll1(opt, ok) {
  const n = d6(), ones = opt.reroll === 'ones' || opt.poison;
  return (ones && n === 1) || (opt.reroll === 'fails' && !ok(n)) ? { n: d6(), rr: n } : { n, rr: 0 };
}
// One To Wound roll by w against t: Strength opt.s against the Defence of the part hit (opt.part 'mount': a Cavalry
// model's steed), opt.bonus on every dice (+1 for a two-handed weapon, +1 for a Heroic Challenge). On 6+/4+ and the like
// the first dice needs a 6 and then the second dice the other value; Might spent on the first dice carries over to the
// second (p. 78). Heroic Defence (p. 86): only a natural 6 wounds that Hero (both natural 6s), whatever the modifiers or
// Might. w is null for a hit nobody makes directly (a fall, a rider Knocked Flying): then nobody may spend Might.
// Returns { need, ok, dice: [{ n, v (with Might), mt, mod (bonus and carried Might), ok }] }.
export function* woundRoll(w, t, opt) {
  const part = opt.part === 'mount' && t.cav ? 'mount' : 'rider', need = woundNeed(opt.s, opt.d != null ? opt.d : (part === 'mount' ? t.mount.d : t.d) + (opt.dPlus || 0));
  if (!need) return { need: null, ok: false, dice: [] };
  const nat6 = !!(t.def6 && part === 'rider'), bonus = opt.bonus || 0, dice = [];
  let carry = 0;
  for (let i = 0; i < need.length; i++) {
    const want = need.length === 1 ? need[0] : i === 0 ? 6 : need[1];
    const r1 = roll1(opt, n => (nat6 ? n === 6 : Math.min(6, n + bonus + carry) >= want));
    const die = { n: r1.n, v: r1.n, mt: 0, mod: bonus + carry, ok: false, ...(r1.rr ? { rr: r1.rr } : {}) };
    const ok = () => (nat6 ? die.n === 6 : Math.min(6, die.v + die.mod) >= want);
    die.ok = ok();
    dice.push(die);
    yield { k: 'dice', step: 'wound', u: w, t, die, i, need, want, nat6, label: opt.label };
    const opts = !die.ok && !nat6 ? reach(w, Math.min(6, die.v + die.mod), [want]) : [];
    if (opts.length) {
      const n = Math.min(+((yield { k: 'might', step: 'wound', u: w, t, die, need, want, i, opts, label: opt.label }) || 0), w.might);
      if (n > 0) {
        const from = die.v;
        for (let j = 0; j < n && die.v < 6; j++) mightUp(w, die);
        die.ok = ok();
        yield { k: 'raise', step: 'wound', u: w, die, from, n: die.v - from };
      }
    }
    if (!die.ok) return { need, ok: false, dice };
    carry = die.mt;
  }
  return { need, ok: true, dice };
}
// n To Wound rolls by w at t, as for Strikes (two rolls each against a Trapped or Prone model: the caller counts them).
// A striker that cannot spend Might rolls them all at once, as on the table; a Hero with Might rolls them one by one,
// so that it can raise each dice. opt as for woundRoll. Returns { need, rolls (every dice), wounds, rollsN }.
export function* woundRolls(w, t, n, opt) {
  const part = opt.part === 'mount' && t.cav ? 'mount' : 'rider', need = woundNeed(opt.s, opt.d != null ? opt.d : part === 'mount' ? t.mount.d : t.d);
  const R = { need, rolls: [], wounds: 0, rollsN: need ? n : 0 };
  if (!need || !n) return R;
  if (isHero(w) && w.might > 0 && !(t.def6 && part === 'rider')) {
    for (let i = 0; i < n; i++) { const r = yield* woundRoll(w, t, opt); R.rolls.push(...r.dice); if (r.ok) R.wounds++; }
    return R;
  }
  // All at once: the first dice of every roll, then the second dice of those that need one.
  const nat6 = !!(t.def6 && part === 'rider'), bonus = opt.bonus || 0;
  for (let i = 0; i < n; i++) {
    const first = need.length === 1 ? need[0] : 6, okN = want => n => (nat6 ? n === 6 : Math.min(6, n + bonus) >= want);
    const ra = roll1(opt, okN(first)), a = { n: ra.n, v: ra.n, mt: 0, mod: bonus, ...(ra.rr ? { rr: ra.rr } : {}) };
    const okA = okN(first)(a.n);
    a.ok = okA && need.length === 1;
    R.rolls.push(a);
    if (!okA) continue;
    if (need.length === 1) { R.wounds++; continue; }
    a.ok = true;
    const rb = roll1(opt, okN(need[1])), b = { n: rb.n, v: rb.n, mt: 0, mod: bonus, ...(rb.rr ? { rr: rb.rr } : {}) };
    b.ok = okN(need[1])(b.n);
    R.rolls.push(b);
    if (b.ok) R.wounds++;
  }
  yield { k: 'dice', step: 'wounds', u: w, t, dice: R.rolls, need, wounds: R.wounds, label: opt.label };
  return R;
}

/* ---------- Odds with Might ---------- */
// The chance that a run of rolls all succeed when a Hero has m Might Points to spend wherever a roll falls short: a
// roll that fails ends the run, so spending there is always right. steps: [{ need, reroll }] for D6 tests (reroll:
// a failure is re-rolled first), or { wound: [a] or [6, b], bonus, nat6 } for a To Wound roll (Might on the first
// dice of 6+/b carries over to the second; with nat6, Heroic Defence, only natural 6s count and Might cannot help).
export function chainOdds(steps, m = 0) {
  const memo = new Map();
  const go = (i, m) => {
    if (i >= steps.length) return 1;
    const key = i * 32 + m;
    if (memo.has(key)) return memo.get(key);
    const st = steps[i];
    let p = 0;
    if (st.wound === null) p = 0;
    else if (st.wound && st.nat6) p = (1 / 6) ** st.wound.length * go(i + 1, m);
    else if (st.wound && st.wound.length === 2) {
      const b0 = st.bonus || 0;
      for (let a = 1; a <= 6; a++) {
        const k = Math.max(0, 6 - Math.min(6, a + b0));
        if (k > m) continue;
        for (let b = 1; b <= 6; b++) {
          const k2 = Math.max(0, st.wound[1] - Math.min(6, b + b0 + k));
          if (k + k2 <= m) p += go(i + 1, m - k - k2) / 36;
        }
      }
    } else {
      const need = st.wound ? st.wound[0] : st.need, bonus = st.bonus || 0, fails = [1, 2, 3, 4, 5, 6].filter(v => v + bonus < need).length / 6;
      for (let v = 1; v <= 6; v++) {
        const pass = Math.min(6, v + bonus) >= need, pv = st.reroll ? (pass ? 1 / 6 : 0) + fails / 6 : 1 / 6;
        const k = pass ? 0 : need - Math.min(6, v + bonus);
        if (k <= m && need <= 6) p += pv * go(i + 1, m - k);
      }
    }
    memo.set(key, p);
    return p;
  };
  return go(0, Math.max(0, m | 0));
}

/* ---------- Fate (p. 88) ---------- */
// A Hero that suffers a Wound may spend a Fate Point and roll a D6: 4+ prevents it. One point at a time, each roll
// settled before the next; Might may raise a Fate Roll, decided before the next point (it is part of d6Test).
// Returns { rolls: [dice], saved }.
export function* fateSeq(t) {
  const rolls = [];
  while (isHero(t) && t.fate > 0) {
    if (!(yield { k: 'fate', u: t, left: t.fate, rolls })) break;
    t.fate--; t.fateUsed = true;
    // Narya and Nenya re-roll a failed Fate Roll, a Mithril Coat a 1.
    const g = (t.T.gear || []).map(x => x.toLowerCase()), ring = g.includes('narya') ? 'Narya' : g.includes('nenya') ? 'Nenya' : null, coat = g.includes('mithril coat');
    const r = yield* d6Test(t, 4, { step: 'fate', label: `Fate Roll: ${t.name}, 4+`, reroll: ring || (coat ? 'Mithril Coat' : null), rerollIf: ring ? null : d => d.n === 1 });
    rolls.push(r);
    if (r.ok) return { rolls, saved: true };
  }
  return { rolls, saved: false };
}

/* ---------- Intelligence (p. 62, 77) ---------- */
// An Intelligence Test: 2D6 (+ mod) against the model's Intelligence. A Hero that fails may raise the total by 1 for each
// Might Point it spends (Will does not help here), one point at a time. why: the rule that called for it.
// Returns { dice, total, need, ok, might }.
export function* intelligenceSeq(u, why, mod = 0) {
  const T = intelligenceTest(u, mod);
  T.might = 0;
  yield { k: 'dice', step: 'intelligence', u, T, why };
  while (!T.ok && isHero(u) && (u.might || 0) > 0) {
    const a = yield { k: 'intelligence', u, T, short: T.need - T.total, why };
    if (a !== 'might' || !(u.might > 0)) break;
    u.might--; T.might++; T.total++; T.ok = T.total >= T.need;
  }
  return T;
}

/* ---------- Courage (p. 60, 87) ---------- */
// A Courage Test: 2D6 against the model's Courage. A Hero that fails may raise the total by 1 for each Will Point and
// each Might Point it spends (p. 87), one point at a time. Returns { dice, total, need, ok, will, might }.
export function* courageSeq(u, why) {
  const T = courageTest(u);
  T.will = 0; T.might = 0;
  yield { k: 'dice', step: 'courage', u, T, why };
  while (!T.ok && isHero(u) && ((u.will || 0) + (u.might || 0)) > 0) {
    const a = yield { k: 'courage', u, T, short: T.need - T.total, why };
    if (a === 'will' && u.will > 0) { u.will--; T.will++; }
    else if (a === 'might' && u.might > 0) { u.might--; T.might++; }
    else break;
    T.total++; T.ok = T.total >= T.need;
  }
  return T;
}
