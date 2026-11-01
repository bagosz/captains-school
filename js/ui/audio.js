// Music and sound effects, all synthesised with the Web Audio API: there are no audio files, so the single-file
// build has sound too. Two original pieces in the spirit of the music of the horse-lords, in D minor (Dorian):
// "Before the battle" for the menu and briefings (a lone horn call, a Hardanger-style fiddle over held strings) and
// "Battle" while a mission runs, a cavalry piece in 12/8: galloping low strings and timpani, horn fanfares on open
// fifths, the fiddle theme, and the whole orchestra at the charge. It grows with the game: steady while models move
// and shoot, at full gallop in the Fight phase. Music and sounds can be switched off in Options and the choice is
// remembered. Browsers start audio only after a click or key press.
import { $ } from '../util.js';

const SOUND_KEY = 'captains-school-sound';
export const soundPrefs = { music: true, sfx: true };
try { Object.assign(soundPrefs, JSON.parse(localStorage.getItem(SOUND_KEY) || '{}')); } catch (e) { /* no browser storage */ }
function saveSound() { try { localStorage.setItem(SOUND_KEY, JSON.stringify(soundPrefs)); } catch (e) { /* ignore */ } }

const MUSIC_VOL = 0.3, SFX_VOL = 0.8;
let AC = null;          // the AudioContext, made on the first click or key press
const BUS = {};         // out (compressor), master, music, sfx, far (sfx with more hall), verb (the hall)
let noiseBuf = null;
const ksCache = new Map();

/* ---------- Notes ---------- */
const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
// 'F#4' -> 66 (MIDI note number)
function midi(s) {
  const m = /^([A-G])([#b]?)(\d)$/.exec(s);
  return 12 * (+m[3] + 1) + NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const notes = s => s.split(' ').map(midi);
// A melody: bars split by '|', each note 'name:length in eighths' (length 1 if left out), '-' is a rest.
function melody(s) {
  return s.split('|').map(bar => bar.trim().split(/\s+/).map(tok => { const [n, len] = tok.split(':'); return [n === '-' ? null : midi(n), +(len || 1)]; }));
}

// Chords: the bass root and a voicing for the horns and strings.
const CHORDS = {};
for (const [k, b, v] of [
  ['Dm', 'D2', 'D3 A3 D4 F4'], ['C', 'C2', 'C3 G3 C4 E4'], ['Am', 'A1', 'A2 E3 A3 C4'], ['F', 'F2', 'C3 F3 A3 C4'],
  ['G', 'G2', 'D3 G3 B3 D4'], ['Bb', 'Bb1', 'D3 F3 Bb3 D4'], ['A', 'A1', 'E3 A3 C#4 E4'],
]) CHORDS[k] = { b: midi(b), v: notes(v) };
const DORIAN = [2, 4, 5, 7, 9, 11, 0];   // D E F G A B C: the pitch classes of the mode
const OPEN = notes('A4 D4 E5 G3');                               // the fiddle's open strings, for its drone

// Themes (original), in bars of 12/8: a horn fanfare on open fourths and fifths, and a lilting fiddle tune.
const FANFARE = melody('A3:3 D4:3 A4:6 | G4:2 F4 E4:3 D4:6 | G3:3 C4:3 G4:6 | A4:2 G4 F4:3 E4:6 | F4:3 Bb4:3 D5:6 | C5:2 Bb4 A4:3 G4:3 E4:3 | F4:3 A4:3 D5:6 | C#5:6 A4:6');
const FIDDLE = melody('D5:2 A4 D5:2 E5 F5:3 E5:2 D5 | E5:2 C5 G4:3 C5:3 E5:3 | F5:2 E5 D5:2 F5 A5:6 | G5:2 F5 E5:3 A4:6 | A4:2 C5 F5:3 E5:2 D5 C5:3 | D5:2 E5 G5:3 E5:3 C5:3 | B4:2 D5 G5:3 F5:2 E5 D5:3 | D5:12');

// Sections play in order and loop, one chord per bar of 12/8 (four beats of three eighths). Parts:
//   gallop: cellos and basses in the horses' rhythm; low: cellos and basses holding the root
//   hold: a held chord ('strings' or 'horns'); stabs: horns and trombones on the beats in a fight
//   timp: timpani; drum: bass drum ('far' before the battle); snare: field drum in a fight
//   crash: a cymbal on the first beat of the section from this level on; build: a timpani roll and a rising cymbal
//   in the last bar; lead and mel: the melody.
const SONGS = {
  eve: {
    bpm: 52,
    sections: [
      { chords: 'Dm Dm C C', low: 1, hold: 'strings', drum: 'far', lead: 'horn', mel: FANFARE.slice(0, 4) },
      { chords: 'Dm C Dm Am F C G Dm', low: 1, hold: 'strings', drum: 'far', lead: 'fiddle', mel: FIDDLE },
      { chords: 'Dm Dm C C Bb C Dm A', low: 1, hold: 'strings', timp: 1, lead: 'horns', mel: FANFARE },
    ],
  },
  battle: {
    bpm: 96,
    sections: [
      { chords: 'Dm Dm C C Dm Dm Bb A', gallop: 1, hold: 'horns', timp: 1, drum: 'war', crash: 1 },
      { chords: 'Dm Dm C C Bb C Dm A', gallop: 1, hold: 'strings', timp: 1, drum: 'war', snare: 1, crash: 2, lead: 'horns', mel: FANFARE },
      { chords: 'Dm C Dm Am F C G Dm', gallop: 1, hold: 'strings', timp: 1, lead: 'fiddle', mel: FIDDLE },
      { chords: 'Dm Dm C C Bb C Dm A', gallop: 1, stabs: 1, timp: 1, drum: 'war', snare: 1, crash: 1, build: 1, lead: 'tutti', mel: FANFARE },
    ],
  },
};
for (const S of Object.values(SONGS)) for (const sec of S.sections) sec.chords = sec.chords.split(' ');

// The gallop, by level: [eighth, interval above the root, loudness, length in eighths]. Long-short while models move
// and shoot (the horses' "DUM-da"), every eighth in a fight.
const GALLOP = {
  1: [[0, 0, 1, 2], [2, 0, 0.6, 1], [3, 0, 0.85, 2], [5, 0, 0.6, 1], [6, 0, 1, 2], [8, 0, 0.6, 1], [9, 12, 0.85, 2], [11, 0, 0.6, 1]],
  2: [1, 0.5, 0.75, 0.9, 0.5, 0.75, 1, 0.5, 0.75, 0.9, 0.5, 0.75].map((v, i) => [i, i === 9 || i === 10 ? 12 : 0, v, 1]),
};
// Timpani [eighth, 0 root or 1 fifth, loudness], bass drum and field drum [eighth, loudness], by level.
const TIMP = { 0: [[0, 0, 0.35]], 1: [[0, 0, 0.5], [6, 1, 0.32]], 2: [[0, 0, 0.6], [2, 0, 0.22], [3, 0, 0.38], [6, 1, 0.5], [8, 1, 0.22], [9, 0, 0.42]] };
const BASS_DRUM = { far: [[0, 0.3]], war1: [[0, 0.5]], war2: [[0, 0.7], [6, 0.5]] };
const FIELD_DRUM = [[3, 0.22], [5, 0.1], [9, 0.28], [11, 0.12]];
const STABS = [[0, 2], [3, 2], [6, 2], [9, 3]];

/* ---------- Audio graph ---------- */
function makeAudio() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return false;
  AC = new Ctx();
  const comp = BUS.out = AC.createDynamicsCompressor();
  comp.threshold.value = -10; comp.knee.value = 10; comp.ratio.value = 3; comp.attack.value = 0.005; comp.release.value = 0.2;
  comp.connect(AC.destination);
  BUS.master = amp(0.9, comp);
  BUS.verb = AC.createConvolver();
  BUS.verb.buffer = hall(3);
  BUS.verb.connect(amp(0.8, BUS.master));
  BUS.music = amp(MUSIC_VOL, BUS.master);
  BUS.music.connect(amp(0.6, BUS.verb));
  BUS.sfx = amp(soundPrefs.sfx ? SFX_VOL : 0, BUS.master);
  BUS.sfx.connect(amp(0.14, BUS.verb));
  BUS.far = amp(1, BUS.sfx);
  BUS.far.connect(amp(0.5, BUS.verb));
  noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return true;
}

// A large hall: stereo noise that fades out and grows darker as it fades.
function hall(sec) {
  const sr = AC.sampleRate, n = Math.floor(sr * sec), b = AC.createBuffer(2, n, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const x = i / n;
      lp += (0.55 - 0.47 * x) * (Math.random() * 2 - 1 - lp);
      d[i] = lp * Math.pow(1 - x, 3) * Math.min(1, i / (sr * 0.012));
    }
  }
  return b;
}

/* ---------- Building blocks ---------- */
function amp(v, to) { const g = AC.createGain(); g.gain.value = v; if (to) g.connect(to); return g; }
function tone(type, f, t, end, to) { const o = AC.createOscillator(); o.type = type; o.frequency.value = f; o.connect(to); o.start(t); o.stop(end); return o; }
function hiss(t, end, to) { const s = AC.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.connect(to); s.start(t, Math.random() * 0.9); s.stop(end); return s; }
function filter(type, f, q, to, gain = 0) { const b = AC.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; b.gain.value = gain; b.connect(to); return b; }
// Percussive envelope: up to v in a seconds, then an exponential fade with time constant d.
function perc(v, t, a, d, to) { const g = amp(0, to); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + a); g.gain.setTargetAtTime(0, t + a, d); return g; }
// Held envelope: up to v in a seconds, held until t + dur, then a fade with time constant r.
function held(v, t, a, dur, r, to) {
  const g = amp(0, to), h = t + Math.max(a, dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + a); g.gain.setValueAtTime(v, h); g.gain.setTargetAtTime(0, h, r);
  return g;
}
// Where a player sits on the stage, from -1 (left) to 1 (right).
function seat(x, to) {
  if (!AC.createStereoPanner) return to;
  const p = AC.createStereoPanner(); p.pan.value = x; p.connect(to);
  return p;
}
function vibrato(o, t, f, depth, rate, end) {
  const l = AC.createOscillator(), lg = AC.createGain();
  l.frequency.value = rate;
  lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * depth, t + 0.35);
  l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(end);
}
// Harmonic spectra (amplitudes of harmonics 1, 2, 3...): the mellow horn and the brighter trombone.
const SPECTRA = { horn: [1, 0.55, 0.32, 0.2, 0.12, 0.07, 0.04, 0.025, 0.015], bone: [1, 0.75, 0.55, 0.42, 0.32, 0.24, 0.17, 0.12, 0.08, 0.05, 0.03] };
const waves = {};
function wave(k) {
  if (!waves[k]) { const H = SPECTRA[k], im = new Float32Array(H.length + 1); H.forEach((a, i) => { im[i + 1] = a; }); waves[k] = AC.createPeriodicWave(new Float32Array(H.length + 1), im); }
  return waves[k];
}
function voice(k, f, t, end, to) { const o = AC.createOscillator(); o.setPeriodicWave(wave(k)); o.frequency.value = f; o.connect(to); o.start(t); o.stop(end); return o; }

// Plucked string (Karplus-Strong), computed once per note and cached. damp: how long it rings; soft: rounder attack.
function ksBuffer(m, damp, soft, sec) {
  const key = `${m}:${damp}:${soft}:${sec}`;
  if (ksCache.has(key)) return ksCache.get(key);
  const sr = AC.sampleRate, f = mtof(m), N = Math.max(4, Math.round(sr / f - 0.5)), len = Math.floor(sr * sec);
  const ring = new Float32Array(N);
  for (let i = 0; i < N; i++) ring[i] = Math.random() * 2 - 1;
  for (let s = 0; s < soft; s++) for (let i = 0; i < N; i++) ring[i] = 0.5 * (ring[i] + ring[(i + 1) % N]);
  const b = AC.createBuffer(1, len, sr), d = b.getChannelData(0), fade = Math.floor(sr * 0.25);
  let p = 0, peak = 1e-6;
  for (let i = 0; i < len; i++) {
    const q = (p + 1) % N, a = ring[p];
    ring[p] = damp * 0.5 * (a + ring[q]);
    d[i] = a; p = q;
    peak = Math.max(peak, Math.abs(a));
  }
  for (let i = 0; i < len; i++) d[i] = d[i] / peak * Math.min(1, (len - i) / fade);
  const k = { b, rate: f / (sr / (N + 0.5)) };   // the loop is N + 0.5 samples long: playbackRate puts it in tune
  ksCache.set(key, k);
  return k;
}
function pluck(t, m, v, to, damp = 0.996, soft = 2, sec = 2.5) {
  const k = ksBuffer(m, damp, soft, sec), s = AC.createBufferSource();
  s.buffer = k.b; s.playbackRate.value = k.rate;
  s.connect(amp(v, to)); s.start(t);
  return s;
}

/* ---------- Instruments ---------- */
// Solo horn: a mellow spectrum, the lips sliding up into the note, the bell opening as it swells, a faint vibrato.
// bend < 1 lets the note sag at the end; k 'bone' gives the brassier trombone (the orc horn uses both).
function horn(t, m, dur, v, to, bend = 1, bright = 1, k = 'horn') {
  const f = mtof(m), end = t + dur + 1, g = held(v, t, 0.08, dur, 0.16, to);
  const lp = filter('lowpass', f * 1.5, 0.5, g);
  lp.frequency.setValueAtTime(f * 1.5, t); lp.frequency.linearRampToValueAtTime(f * 5 * bright, t + 0.12); lp.frequency.setTargetAtTime(f * 3.5 * bright, t + 0.12, 0.5);
  const o = voice(k, f, t, end, lp);
  o.detune.setValueAtTime(-35, t); o.detune.linearRampToValueAtTime(0, t + 0.06);
  vibrato(o, t, f, 0.002, 4.5, end);
  if (bend !== 1) { o.frequency.setValueAtTime(f, t + dur * 0.6); o.frequency.linearRampToValueAtTime(f * bend, t + dur); }
}
// A section of three horns (or trombones) on one note, a few cents and milliseconds apart.
function brass(t, m, dur, v, to, k = 'horn', x = -0.3) {
  const f = mtof(m), end = t + dur + 1, short = dur < 0.4;
  const g = held(v, t, short ? 0.03 : 0.07, dur, short ? 0.06 : 0.14, seat(x, to));
  const top = Math.min(6000, f * (k === 'bone' ? 7 : 4.5)), lp = filter('lowpass', f * 1.5, 0.5, g);
  lp.frequency.setValueAtTime(f * 1.5, t); lp.frequency.linearRampToValueAtTime(top, t + 0.08); lp.frequency.setTargetAtTime(top * 0.7, t + 0.08, 0.4);
  for (let i = 0; i < 3; i++) {
    const d = i * 0.006 + Math.random() * 0.008, cents = (i - 1) * 4 + (Math.random() - 0.5) * 3;
    const o = voice(k, f, t + d, end, amp(0.34, lp));
    o.detune.setValueAtTime(cents - 30, t + d); o.detune.linearRampToValueAtTime(cents, t + d + 0.05);
  }
}
// String section holding notes: four players a note, a little out of tune with each other and with their own
// vibrato, through warm, body-like tone (lifted low mids, no harsh top). a: how slowly the bows come in.
function strings(t, ms, dur, v, to, a = 0.35, x = 0) {
  const end = t + dur + 2.5, g = held(v / ms.length, t, a, dur, 0.45, seat(x, to));
  const body = filter('peaking', 380, 1, filter('lowpass', 3000, 0.5, g), 4);
  const lfos = [5.2, 6.1].map(r => { const l = AC.createOscillator(), lg = amp(0); l.frequency.value = r; l.connect(lg); l.start(t); l.stop(end); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(10, t + 0.6); return lg; });
  for (const m of ms) for (let i = 0; i < 4; i++) {
    const o = tone('sawtooth', mtof(m), t, end, body);
    o.detune.value = (i - 1.5) * 5 + (Math.random() - 0.5) * 6;
    lfos[i % 2].connect(o.detune);
  }
}
// Cellos and basses bowing short notes in the horses' rhythm, re-bowed for every note by one set of players.
// seq: [[eighth, midi, loudness, length in eighths]].
function gallop(t, seq, step, to) {
  const end = t + 12 * step + 1, g = amp(0, seat(0.3, to));
  const body = filter('peaking', 200, 1.2, filter('lowpass', 1500, 0.5, g), 5);
  const players = [[1, -8], [1, 6], [2, -3], [2, 5]].map(([k, det]) => { const o = tone('sawtooth', 110, t, end, body); o.detune.value = det; return [o, k]; });
  for (const [i, m, v, len] of seq) {
    const ti = t + i * step + Math.random() * 0.008, f = mtof(m);
    for (const [o, k] of players) o.frequency.setValueAtTime(f * k, ti);
    g.gain.setTargetAtTime(v, ti, 0.007);                       // the bow bites
    g.gain.setTargetAtTime(v * 0.4, ti + 0.035, 0.06);          // and travels on
    g.gain.setTargetAtTime(0, ti + len * step * 0.75, 0.03);    // and lifts
    hiss(ti, ti + 0.06, filter('bandpass', 2400, 0.8, perc(v * 0.12, ti, 0.002, 0.015, g)));   // rosin on the string
  }
}
// Hardanger-style fiddle: a bowed string through the resonances of its body, vibrato that comes in late, a breath of
// bow noise and, on long notes, a quick grace note from the note above.
function fiddle(t, m, dur, v, to, grace = false) {
  const f = mtof(m), end = t + dur + 0.8, g = held(v, t, 0.05, dur, 0.12, seat(0.05, to));
  const body = filter('peaking', 290, 2, filter('peaking', 1100, 1.5, filter('peaking', 2900, 2, filter('lowpass', 4500, 0.5, g), 3), 3), 6);
  const o = tone('sawtooth', f, t, end, body);
  if (grace) {
    let up = m + 1;
    while (!DORIAN.includes(up % 12)) up++;
    o.frequency.setValueAtTime(mtof(up), t); o.frequency.setValueAtTime(f, t + 0.07);
  }
  const l = AC.createOscillator(), lg = amp(0);
  l.frequency.value = 5.8; l.connect(lg); lg.connect(o.detune); l.start(t); l.stop(end);
  lg.gain.setValueAtTime(0, t + 0.15); lg.gain.linearRampToValueAtTime(16, t + 0.45);
  hiss(t, end, filter('bandpass', Math.min(6000, f * 4), 0.8, held(v * 0.05, t, 0.05, dur, 0.1, seat(0.05, to))));
}
function timpani(t, m, v, to) {
  const f = mtof(m), out = seat(-0.1, to);
  for (const [r, a, d] of [[1, 1, 0.9], [1.504, 0.45, 0.5], [1.742, 0.25, 0.35], [2, 0.2, 0.3], [2.245, 0.1, 0.22]]) {
    const o = tone('sine', f * r, t, t + 3.5, perc(v * a, t, 0.004, d, out));
    o.frequency.setValueAtTime(f * r * 1.02, t); o.frequency.exponentialRampToValueAtTime(f * r, t + 0.06);
  }
  hiss(t, t + 0.1, filter('lowpass', 500, 0.7, perc(v * 0.5, t, 0.001, 0.02, out)));   // the felt mallet
}
function bassDrum(t, v, to) {
  const out = seat(0.1, to), o = tone('sine', 66, t, t + 2.5, perc(v, t, 0.008, 0.45, out));
  o.frequency.setValueAtTime(66, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.5);
  hiss(t, t + 0.8, filter('lowpass', 180, 0.7, perc(v * 0.6, t, 0.01, 0.25, out)));
}
// Field drum: the head, then the snares buzzing underneath.
function snare(t, v, to) {
  const out = seat(0.15, to);
  hiss(t, t + 0.4, filter('bandpass', 2200, 0.6, perc(v, t, 0.001, 0.09, out)));
  hiss(t, t + 0.4, filter('highpass', 4500, 0.5, perc(v * 0.5, t + 0.004, 0.002, 0.12, out)));
  tone('triangle', 185, t, t + 0.25, perc(v * 0.6, t, 0.001, 0.035, out));
}
// Orchestral cymbals: a wash of filtered noise. swell > 0 plays a rising roll over swell seconds, ending at t.
function cymbal(t, v, to, swell = 0) {
  const t0 = t - swell, end = t + (swell ? 0.2 : 4), g = amp(0, seat(0.3, to));
  if (swell) { g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(v, t); g.gain.setTargetAtTime(0, t, 0.03); }
  else { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.003); g.gain.setTargetAtTime(0, t + 0.003, 0.9); }
  hiss(t0, end, filter('highpass', 3500, 0.5, g)).connect(filter('bandpass', 7500, 0.7, amp(0.6, g)));
}
// Kept for the charge horns and the end of a mission.
function drum(t, v, p, to) {
  const o = tone('sine', 120 * p, t, t + 1.6, perc(v, t, 0.004, 0.24, to));
  o.frequency.setValueAtTime(120 * p, t); o.frequency.exponentialRampToValueAtTime(46 * p, t + 0.3);
  hiss(t, t + 0.2, filter('lowpass', 1100 * p, 0.7, perc(v * 0.45, t, 0.002, 0.03, to)));
}
// Melody instruments. v scales with the level of the battle; lv 2 doubles the horns with trombones.
const LEAD = {
  horn: (t, m, d, v, to) => horn(t, m, d, 0.4 * v, seat(-0.2, to)),
  horns: (t, m, d, v, to, lv) => { brass(t, m, d, 0.85 * v, to, 'horn', -0.3); if (lv === 2) brass(t, m - 12, d, 0.45, to, 'bone', 0.25); },
  fiddle: (t, m, d, v, to, lv, len) => fiddle(t, m, d, 0.45 * v, to, len >= 3),
  tutti: (t, m, d, v, to) => { strings(t, [m + 12], d, 0.24 * v, to, 0.06, -0.4); brass(t, m, d, 0.7 * v, to, 'horn', -0.3); },
};

/* ---------- Music ---------- */
const MUS = { want: 'eve', level: 1, cur: null, timer: 0, quietUntil: 0 };

// mood: 'eve' (before the battle) or 'battle'; level 2 is a fight. Cheap to call every frame.
export function setMusic(mood, level) {
  MUS.level = level || 1;
  if (mood === MUS.want) return;
  MUS.want = mood;
  if (AC && soundPrefs.music) startSong();
}

function startSong() {
  stopSong(1.2);
  const song = SONGS[MUS.want];
  if (!song) return;
  const g = amp(0, BUS.music), t = Math.max(AC.currentTime + 0.15, MUS.quietUntil);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + 0.8);
  MUS.cur = { song, g, sec: 0, bar: 0, next: t };
  if (!MUS.timer) MUS.timer = setInterval(musicTick, 200);
  musicTick();
}
function stopSong(fade) {
  const c = MUS.cur;
  if (!c) return;
  MUS.cur = null;
  const now = AC.currentTime;
  c.g.gain.cancelScheduledValues(now); c.g.gain.setValueAtTime(c.g.gain.value, now); c.g.gain.linearRampToValueAtTime(0, now + fade);
  setTimeout(() => c.g.disconnect(), (fade + 6) * 1000);
}
// Schedules whole bars a little ahead of time, on the audio clock. A bar is four dotted quarters.
function musicTick() {
  const c = MUS.cur;
  if (!c) { clearInterval(MUS.timer); MUS.timer = 0; return; }
  if (c.next < AC.currentTime - 0.2) c.next = AC.currentTime + 0.05;   // fell behind (a busy or hidden tab): skip ahead
  while (c.next < AC.currentTime + 0.5) {
    playBar(c, c.next);
    c.next += 240 / c.song.bpm;
    if (++c.bar >= c.song.sections[c.sec].chords.length) { c.bar = 0; c.sec = (c.sec + 1) % c.song.sections.length; }
  }
}
function playBar(c, t) {
  const S = c.song, sec = S.sections[c.sec], e = 20 / S.bpm, bar = 12 * e, to = c.g, ch = CHORDS[sec.chords[c.bar]];
  const lv = S === SONGS.eve ? 0 : MUS.level;   // 0 before the battle, 1 moving and shooting, 2 fighting
  const loud = [0.55, 0.8, 1][lv], loose = () => (Math.random() - 0.5) * 0.014;
  let tr = ch.b;
  while (tr < 38) tr += 12;                       // timpani are tuned within D2 to C#3...
  const tf = tr + 7 > 52 ? tr - 5 : tr + 7;       // ...with a second drum on the fifth
  if (c.bar === 0 && sec.crash && lv >= sec.crash) cymbal(t, 0.25 * loud, to);
  if (sec.low) strings(t, [ch.b, ch.b + 12], bar, 0.16 * loud, to, 0.5, 0.3);
  if (sec.hold === 'strings') strings(t, ch.v.map(m => m + 12), bar, 0.26 * loud, to, 0.4, -0.3);
  if (sec.hold === 'horns' || (sec.stabs && lv < 2)) for (const m of ch.v.slice(0, 3)) brass(t, m, bar * 0.95, 0.2 * loud, to, 'horn', -0.3);
  if (sec.stabs && lv === 2) for (const [i, len] of STABS) for (const m of ch.v) brass(t + i * e, m, len * e * 0.7, 0.32, to, 'bone', 0.25);
  if (sec.gallop && lv) gallop(t, GALLOP[lv].map(([i, o, v, len]) => [i, ch.b + o, v * 0.3 * loud, len]), e, to);
  if (sec.timp) for (const [i, fifth, v] of TIMP[lv]) timpani(t + i * e, fifth ? tf : tr, v * 0.7 * loud, to);
  if (sec.drum) for (const [i, v] of BASS_DRUM[sec.drum === 'far' ? 'far' : sec.drum + lv] || []) bassDrum(t + i * e, v * loud, to);
  if (sec.snare && lv === 2) for (const [i, v] of FIELD_DRUM) snare(t + i * e, v * 1.4, to);
  if (sec.build && c.bar === sec.chords.length - 1) {
    for (let i = 0; i < 24; i++) timpani(t + i * e / 2, tr, (0.04 + 0.28 * i / 23) * loud, to);
    cymbal(t + bar, 0.22 * loud, to, bar);
  }
  if (sec.lead) {
    if (sec.lead === 'fiddle') {   // an open string ringing under the tune, as on a Hardanger fiddle
      const drone = OPEN.find(m => ch.v.some(n => n % 12 === m % 12));
      if (drone) fiddle(t, drone, bar * 0.95, 0.11 * loud, to);
    }
    let k = 0;
    for (const [m, len] of sec.mel[c.bar]) { if (m) LEAD[sec.lead](t + k * e + loose(), m, len * e * 0.94, loud, to, lv, len); k += len; }
  }
}

/* ---------- Sound effects ---------- */
const sfxOn = () => AC && soundPrefs.sfx && AC.state === 'running';
const size = u => Math.min(2, ((u && u.T && u.T.base) || 25) / 25);   // 1 for a man, 2 for a Troll
const hornAt = {};

// A thump with a falling pitch and a short burst of noise: an arrow striking, a blow landing. p > 1 is harder and higher.
function thunk(t, v, p = 1) {
  const o = tone('sine', 180 * p, t, t + 0.5, perc(v, t, 0.002, 0.05, BUS.sfx));
  o.frequency.setValueAtTime(180 * p, t); o.frequency.exponentialRampToValueAtTime(65 * p, t + 0.12);
  hiss(t, t + 0.15, filter('bandpass', 900 * p, 1, perc(v * 0.6, t, 0.001, 0.02, BUS.sfx)));
}
// Struck metal: inharmonic partials, the higher ones dying first, over a bright scrape.
function clang(t, v, f, ring = 0.25) {
  for (const [r, a] of [[1, 1], [2.32, 0.7], [3.76, 0.5], [5.4, 0.35], [7.1, 0.2]]) {
    tone('sine', f * r * (1 + (Math.random() - 0.5) * 0.01), t, t + 2, perc(a * v * 0.3, t, 0.001, ring / Math.sqrt(r), BUS.sfx));
  }
  hiss(t, t + 0.15, filter('highpass', 2500, 0.7, perc(v * 0.6, t, 0.001, 0.025, BUS.sfx)));
}
// A die landing on the felt: a soft tock and a click, sometimes a sharper clack off another die.
function tap(t, v) {
  hiss(t, t + 0.08, filter('bandpass', 1600 + Math.random() * 1600, 1.4, perc(v * 0.5, t, 0.001, 0.012, BUS.sfx)));
  tone('sine', 210 + Math.random() * 90, t, t + 0.15, perc(v * 0.35, t, 0.001, 0.02, BUS.sfx));
  if (Math.random() < 0.3) hiss(t + 0.01, t + 0.05, filter('bandpass', 4500, 4, perc(v * 0.5, t + 0.01, 0.001, 0.005, BUS.sfx)));
}
function whoosh(t, dur, v, from, to) {
  const g = amp(0, BUS.sfx);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + dur * 0.35); g.gain.linearRampToValueAtTime(0, t + dur);
  const bp = filter('bandpass', from, 2, g);
  bp.frequency.setValueAtTime(from, t); bp.frequency.exponentialRampToValueAtTime(to, t + dur);
  hiss(t, t + dur + 0.05, bp);
}
function fallSound(t, s) {
  thunk(t, 0.55 * s, 0.55 / s);
  for (let i = 0; i < 3; i++) clang(t + 0.05 + Math.random() * 0.3, 0.1, 1500 + Math.random() * 1500, 0.05);
}

export const sfx = {
  // Dice thrown into the tray: one tap each time a die touches the felt (see tray.throw). dice: [{ delay, hops }] in ms.
  dice(dice, dur) {
    if (!sfxOn() || !dice.length) return;
    const t0 = AC.currentTime + 0.02, k = 0.8 * Math.min(1, 2.2 / Math.sqrt(dice.length));
    for (const d of dice) {
      if (!dur) { tap(t0 + Math.random() * 0.03, 0.5 * k); continue; }
      for (let h = 1; h <= d.hops; h++) tap(t0 + (d.delay + dur * h / d.hops) / 1000, k * (0.25 + 0.75 * Math.pow(1 - (h - 1) / d.hops, 1.4)));
    }
  },
  // A shot as the arrow flies across the board. kind: 'hit' (it strikes the target), 'block' (stopped by terrain) or 'miss'.
  shot(kind, crossbow) {
    if (!sfxOn()) return;
    const t = AC.currentTime + 0.01;
    const s = pluck(t, crossbow ? 38 : 43, crossbow ? 0.75 : 0.6, BUS.sfx, crossbow ? 0.9 : 0.95, crossbow ? 0 : 1, 0.6), r = s.playbackRate.value;
    s.playbackRate.setValueAtTime(r * 1.25, t); s.playbackRate.exponentialRampToValueAtTime(r, t + 0.06);   // the string's twang
    if (crossbow) clang(t, 0.12, 900, 0.03);
    whoosh(t + 0.02, 0.32, 0.3, 3200, 700);
    const at = t + 0.33;
    if (kind === 'hit') thunk(at, 0.8);
    else if (kind === 'block') thunk(at, 0.7, 1.7);
    else hiss(at, at + 0.2, filter('lowpass', 700, 0.7, perc(0.3, at, 0.003, 0.03, BUS.sfx)));
  },
  // Blades meeting as a Duel Roll begins.
  clash() {
    if (!sfxOn()) return;
    const t = AC.currentTime + 0.01;
    clang(t, 0.5, 650 + Math.random() * 150);
    clang(t + 0.2 + Math.random() * 0.06, 0.4, 800 + Math.random() * 200);
    if (Math.random() < 0.6) clang(t + 0.4 + Math.random() * 0.05, 0.3, 700 + Math.random() * 150);
  },
  wound(u) {
    if (!sfxOn()) return;
    const t = AC.currentTime + 0.01, s = size(u);
    thunk(t, 0.75, 1 / s);
    whoosh(t, 0.14, 0.35, 2400, 600);
  },
  death(u) {
    if (!sfxOn()) return;
    const t = AC.currentTime + 0.01, s = size(u);
    thunk(t, 0.8, 1 / s);
    whoosh(t, 0.14, 0.35, 2400, 600);
    fallSound(t + 0.25 * s, s);
  },
  // A blow or an arrow turned by armour or a shield.
  armour() {
    if (!sfxOn()) return;
    const t = AC.currentTime + 0.01;
    clang(t, 0.35, 1100 + Math.random() * 300, 0.07);
    thunk(t, 0.3, 1.4);
  },
  // Footsteps on grass for a move that takes ms on the board.
  steps(ms) {
    if (!sfxOn()) return;
    const t = AC.currentTime + 0.01, n = Math.max(1, Math.round(ms / 160));
    for (let i = 0; i < n; i++) {
      const at = t + i * ms / 1000 / n + Math.random() * 0.02;
      hiss(at, at + 0.15, filter('lowpass', 500 + Math.random() * 300, 0.8, perc(0.16, at, 0.004, 0.035, BUS.sfx)));
      hiss(at, at + 0.1, filter('bandpass', 2600, 1, perc(0.04, at, 0.004, 0.02, BUS.sfx)));
    }
  },
  // A charge: a horn in the distance. Good blows a clear call that rises a fifth; Evil a low horn that sags, with drums.
  // At most one horn per side every few seconds, so a turn of many charges does not turn into a fanfare.
  horn(side) {
    if (!sfxOn()) return;
    const now = AC.currentTime;
    if (now - (hornAt[side] ?? -99) < 8) return;
    hornAt[side] = now;
    const t = now + 0.05;
    if (side === 'good') { horn(t, midi('D3'), 0.3, 0.32, BUS.far); horn(t + 0.32, midi('A3'), 1.3, 0.36, BUS.far); }
    else { horn(t, midi('Bb2'), 1.4, 0.4, BUS.far, 0.94, 1.2, 'bone'); drum(t, 0.6, 0.8, BUS.far); drum(t + 0.45, 0.6, 0.8, BUS.far); }
  },
  // A short harp run when a "New rule" popup opens.
  lesson() {
    if (!sfxOn()) return;
    const t = AC.currentTime + 0.01;
    ['D4', 'F#4', 'A4', 'D5', 'E5'].forEach((n, i) => pluck(t + i * 0.07, midi(n), 0.22 - i * 0.02, BUS.sfx));
  },
  // The end of a mission: horns and strings in D major for a win, a falling horn in D minor for a defeat.
  // The music rests while it plays.
  result(win) {
    if (!sfxOn()) return;
    const t = AC.currentTime + 0.1;
    MUS.quietUntil = t + 4.5;
    MUS.want = null;
    stopSong(0.6);
    if (win) {
      [0, 0.09, 0.18, 0.27].forEach((d, i) => drum(t + d, 0.25 + i * 0.08, 1.2, BUS.sfx));
      horn(t + 0.35, midi('D4'), 0.3, 0.3, BUS.far); horn(t + 0.7, midi('A4'), 0.3, 0.3, BUS.far); horn(t + 1.05, midi('D5'), 1.8, 0.28, BUS.far);
      horn(t + 1.05, midi('F#4'), 1.8, 0.16, BUS.far);
      strings(t + 1.05, notes('D3 A3 D4 F#4'), 2, 0.22, BUS.far);
      drum(t + 1.05, 0.8, 1, BUS.sfx);
      ['D5', 'F#5', 'A5', 'D6'].forEach((n, i) => pluck(t + 1.1 + i * 0.06, midi(n), 0.15, BUS.sfx));
    } else {
      drum(t, 0.8, 0.8, BUS.sfx);
      horn(t + 0.1, midi('D4'), 0.7, 0.28, BUS.far); horn(t + 0.85, midi('C4'), 0.6, 0.26, BUS.far); horn(t + 1.5, midi('A3'), 2, 0.28, BUS.far, 0.97);
      strings(t + 1.5, notes('D3 A3 D4 F4'), 2.2, 0.28, BUS.far);
      drum(t + 1.5, 0.6, 0.7, BUS.sfx);
    }
  },
};

/* ---------- Switches and start-up ---------- */
function unlock() {
  if (!AC) { if (!makeAudio()) return; if (soundPrefs.music) startSong(); }
  if (AC.state === 'suspended' && !document.hidden) AC.resume();
}

export function initSound() {
  const mus = $('#musicOpt'), fx = $('#sfxOpt');
  mus.checked = soundPrefs.music; fx.checked = soundPrefs.sfx;
  mus.addEventListener('change', () => {
    soundPrefs.music = mus.checked; saveSound();
    if (!AC) return;
    if (soundPrefs.music) startSong(); else stopSong(0.5);
  });
  fx.addEventListener('change', () => {
    soundPrefs.sfx = fx.checked; saveSound();
    if (AC) BUS.sfx.gain.setTargetAtTime(soundPrefs.sfx ? SFX_VOL : 0, AC.currentTime, 0.05);
  });
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
  // Silence in a hidden tab; the music picks up where it was when the tab comes back.
  document.addEventListener('visibilitychange', () => { if (AC) { if (document.hidden) AC.suspend(); else AC.resume(); } });
}

// For dev/sounds.html: the context and the buses, to measure levels.
export const audioNodes = () => ({ ctx: AC, ...BUS });
