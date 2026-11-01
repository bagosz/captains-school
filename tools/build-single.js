// Packs the game into one self-contained HTML file that opens by double-click (no server needed).
// Usage: node tools/build-single.js   (or: npm run build)   -> dist/captains-school.html
// Every ES module stays a module of its own: it is embedded as a data: URL under a name in an import map, so the
// modules keep their own scopes and live bindings, and the browser loads them exactly as it does from the server.
// The shared file carries no comments or indentation, and keeps its saved data (options, lessons seen, progress)
// under its own prefix: raise the number in SAVE_PREFIX to start everyone who opened an earlier file from defaults.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const JS = path.join(ROOT, 'js');
const OUT = path.join(ROOT, 'dist', 'captains-school.html');
const SAVE_PREFIX = 'captains-school-shared-1-';
// Words that must never reach the shared file (local paths, tools, the dev server). Private words (names, folders)
// can be listed one per line in tools/.private-words, which is not in git.
const PRIVATE = (() => {
  try { return fs.readFileSync(path.join(__dirname, '.private-words'), 'utf8').split(/\s+/).filter(Boolean).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '|').join(''); } catch { return ''; }
})();
const BANNED = new RegExp(PRIVATE + /localhost|127\.0\.0\.1|balance\.mjs|(?<!\w)(?-i:[A-Z]):\\\\?(?![ntru])\w/.source, 'i');
const IMPORT = /^(import\s*(?:\{[^}]*\}|\*\s*as\s+[A-Za-z_$][\w$]*)\s*from\s*)'([^']+)'/gm;   // named or namespace (import * as N)
const NAME = file => '@game/' + path.relative(JS, file).replace(/\\/g, '/');

// Removes comments and indentation from JavaScript. Strings, template literals and regular expressions are copied
// as they are, and a removed comment or run of spaces leaves one space or line break, so tokens never merge.
const BEFORE_EXPR = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);
function stripJs(src) {
  let out = '', ws = '', i = 0, prev = '', prev2 = '';
  const subs = [];   // brace depth inside each open ${...} of a template literal
  const put = s => {
    if (ws && out && !out.endsWith('\n') && !(ws === ' ' && out.endsWith(' '))) out += ws;
    ws = ''; out += s;
  };
  const token = t => { prev2 = prev; prev = t; };
  const template = () => {   // from just after ` or }, up to the closing ` or the next ${
    const start = i;
    while (i < src.length) {
      if (src[i] === '\\') { i += 2; continue; }
      if (src[i] === '`') { i++; out += src.slice(start, i); token('`'); return; }
      if (src[i] === '$' && src[i + 1] === '{') { i += 2; out += src.slice(start, i); subs.push(0); token('{'); return; }
      i++;
    }
    throw new Error('Unclosed template literal');
  };
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (/\s/.test(c)) { if (c === '\n') ws = '\n'; else if (!ws) ws = ' '; i++; continue; }
    if (c === '/' && d === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') {
      const end = src.indexOf('*/', i + 2);
      if (end < 0) throw new Error('Unclosed comment');
      if (src.slice(i, end).includes('\n')) ws = '\n'; else if (!ws) ws = ' ';
      i = end + 2; continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (src[j] !== c) { if (src[j] === '\\') j++; if (src[j] === '\n' || j >= src.length) throw new Error('Broken string'); j++; }
      put(src.slice(i, j + 1)); token('str'); i = j + 1; continue;
    }
    if (c === '`') { put('`'); i++; template(); continue; }
    if (c === '}' && subs.length && subs[subs.length - 1] === 0) { subs.pop(); put('}'); i++; template(); continue; }
    if (c === '/') {
      const word = /^[\w$]+$/.test(prev);
      const division = word ? !BEFORE_EXPR.has(prev) : /^[)\]}`]$/.test(prev) || prev === 'str' || ((prev === '+' || prev === '-') && prev2 === prev);
      if (!division) {
        let j = i + 1, cls = false;
        while (cls || src[j] !== '/') {
          if (src[j] === '\\') j++; else if (src[j] === '[') cls = true; else if (src[j] === ']') cls = false;
          if (src[j] === '\n' || j >= src.length) throw new Error('Broken regular expression near: ' + src.slice(i - 30, i + 30));
          j++;
        }
        j++;
        while (/[a-z]/.test(src[j] || '')) j++;
        put(src.slice(i, j)); token('re'); i = j; continue;
      }
    }
    if (/[\w$]/.test(c)) {
      let j = i; while (j < src.length && /[\w$]/.test(src[j])) j++;
      put(src.slice(i, j)); token(src.slice(i, j)); i = j; continue;
    }
    if (c === '{' && subs.length) subs[subs.length - 1]++;
    if (c === '}' && subs.length) subs[subs.length - 1]--;
    put(c); token(c); i++;
  }
  return out.trim() + '\n';
}

// Removes comments from CSS and squeezes its white space; strings are kept as they are.
function stripCss(src) {
  let out = '', i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '*') { const end = src.indexOf('*/', i + 2); if (end < 0) throw new Error('Unclosed CSS comment'); i = end + 2; continue; }
    if (c === '"' || c === "'") { let j = i + 1; while (src[j] !== c) { if (src[j] === '\\') j++; j++; } out += src.slice(i, j + 1); i = j + 1; continue; }
    if (/\s/.test(c)) { let j = i, nl = false; while (j < src.length && /\s/.test(src[j])) { if (src[j] === '\n') nl = true; j++; } out += nl ? '\n' : ' '; i = j; continue; }
    out += c; i++;
  }
  return out.trim() + '\n';
}

// Every module main.js reaches, with its imports renamed to import-map names and its comments removed.
const modules = new Map();
let keys = 0;
(function visit(file) {
  if (modules.has(file)) return;
  modules.set(file, null);
  let src = fs.readFileSync(file, 'utf8').replace(IMPORT, (_, head, spec) => {
    const dep = path.join(path.dirname(file), spec);
    visit(dep);
    return `${head}'${NAME(dep)}'`;
  });
  if (/^\s*(import|export)\b[^\n]*\bfrom\s*'\./m.test(src) || /^\s*import\s*['(]/m.test(src)) throw new Error(`Unhandled import form in ${file}`);
  src = src.replace(/'captains-school-/g, () => { keys++; return `'${SAVE_PREFIX}`; });
  modules.set(file, stripJs(src));
})(path.join(JS, 'main.js'));

const allJs = [...modules.values()].join('');
if (/captains-school-(?!shared)/.test(allJs)) throw new Error('A storage key does not start with \'captains-school-\'');

// Parse every stripped module with Node, so a mistake in stripping stops the build instead of the game.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'build-single-'));
try {
  for (const [file, src] of modules) {
    const t = path.join(tmp, 'm.mjs');
    fs.writeFileSync(t, src);
    try { execFileSync(process.execPath, ['--check', t], { stdio: 'pipe' }); }
    catch (e) { throw new Error(`${path.relative(ROOT, file)} does not parse after stripping:\n${e.stderr}`); }
  }
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }

const importMap = { imports: {} };
for (const [file, src] of modules) importMap.imports[NAME(file)] = 'data:text/javascript;base64,' + Buffer.from(src, 'utf8').toString('base64');

const css = stripCss(fs.readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8'));
let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace(/<!--[\s\S]*?-->\s*/g, '');
const swap = (from, to) => {
  if (!html.includes(from)) throw new Error(`index.html no longer contains: ${from}`);
  html = html.replace(from, () => to);
};
swap('<link rel="stylesheet" href="css/style.css">', `<style>\n${css}</style>`);
const banned = (html + allJs).match(BANNED);
if (banned) throw new Error(`The shared file would contain "${banned[0]}" near: ${(html + allJs).slice(banned.index - 60, banned.index + 60)}`);
swap('<script type="module" src="js/main.js"></script>',
  `<script type="importmap">${JSON.stringify(importMap)}</script>\n<script type="module">import '${NAME(path.join(JS, 'main.js'))}';</script>`);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);
console.log(`Wrote ${path.relative(ROOT, OUT)} (${modules.size} modules, ${keys} storage keys, ${Math.round(html.length / 1024)} KB)`);
