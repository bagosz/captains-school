// Glossary check: the short texts and aliases of the rule glossary (js/data/rules-text.js), which feed rule terms in
// orders, the log and cards. Lists entries whose short text is too long or too short and aliases that clash.
// Usage: node tools/glossary-check.mjs [--all]   (--all prints every short text)
import { RULES, ruleShort, ruleAliases } from '../js/data/rules-text.js';

const words = s => s.trim().split(/\s+/).filter(Boolean).length;
const all = process.argv.includes('--all');
// A short text must define the term: not too long, not a bare fragment, not shared with another entry, and not only
// say when it is declared (the first sentence of every Heroic Action).
const texts = new Map();
for (const k of Object.keys(RULES)) { const s = ruleShort(k); texts.set(s, [...(texts.get(s) || []), k]); }
let long = 0, short = 0;
for (const k of Object.keys(RULES)) {
  const s = ruleShort(k), n = words(s);
  const bad = n > 30 ? 'LONG' : n < 6 ? 'SHORT' : texts.get(s).length > 1 ? 'SAME' : /^Declared in\b/.test(s) ? 'WHEN' : '';
  if (bad === 'LONG') long++; else if (bad) short++;
  if (bad || all) console.log(`${bad.padEnd(5)} ${k} (${n}${RULES[k].s ? ', own' : ', first sentence'}): ${s}`);
}
const clashes = [];
const seen = new Map();
for (const k of Object.keys(RULES)) for (const a of ruleAliases(k)) {
  const key = a.toLowerCase();
  if (seen.has(key) && seen.get(key) !== k) clashes.push(`"${a}": ${seen.get(key)} and ${k}`);
  else seen.set(key, k);
}
console.log(`${Object.keys(RULES).length} entries, ${long} with a short text over 30 words, ${short} too short, shared or only saying when; ${seen.size} terms; ${clashes.length} clashes.`);
for (const c of clashes) console.log('CLASH ' + c);
process.exit(long || short || clashes.length ? 1 : 0);
