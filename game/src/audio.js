// Every sound in Marisol Bay is synthesized with WebAudio at the moment it is needed —
// engine hum, sirens, gunfire, chimes and the warm evening pad loop. No audio files.
import { S, clamp } from './state.js';

let ctx = null;
let master = null;
let engineOsc = null, engineGain = null, engineFilter = null;
let sirenOsc = null, sirenGain = null, sirenLFO = null;
let musicTimer = null;
let chordStep = 0;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);

  // Engine: a detuned saw pair through a lowpass, pitch follows speed.
  engineOsc = ctx.createOscillator(); engineOsc.type = 'sawtooth'; engineOsc.frequency.value = 55;
  const engineSub = ctx.createOscillator(); engineSub.type = 'square'; engineSub.frequency.value = 28;
  engineFilter = ctx.createBiquadFilter(); engineFilter.type = 'lowpass'; engineFilter.frequency.value = 300; engineFilter.Q.value = 2;
  engineGain = ctx.createGain(); engineGain.gain.value = 0;
  engineOsc.connect(engineFilter); engineSub.connect(engineFilter);
  engineFilter.connect(engineGain); engineGain.connect(master);
  engineOsc.start(); engineSub.start();

  // Siren: a square wave whose pitch an LFO flips between two tones.
  sirenOsc = ctx.createOscillator(); sirenOsc.type = 'triangle'; sirenOsc.frequency.value = 800;
  sirenLFO = ctx.createOscillator(); sirenLFO.type = 'square'; sirenLFO.frequency.value = 0.7;
  const lfoGain = ctx.createGain(); lfoGain.gain.value = 160;
  sirenLFO.connect(lfoGain); lfoGain.connect(sirenOsc.frequency);
  sirenGain = ctx.createGain(); sirenGain.gain.value = 0;
  sirenOsc.connect(sirenGain); sirenGain.connect(master);
  sirenOsc.start(); sirenLFO.start();

  startMusic();
}

function startMusic() {
  // A slow sun-warmed progression: Cmaj7, Am7, Fmaj7, G6 — two soft triangles per chord.
  const chords = [
    [130.81, 196.0, 246.94, 329.63],
    [110.0, 164.81, 261.63, 329.63],
    [87.31, 174.61, 220.0, 329.63],
    [98.0, 196.0, 246.94, 293.66],
  ];
  const playChord = () => {
    if (!ctx) return;
    const notes = chords[chordStep % chords.length]; chordStep++;
    const t = ctx.currentTime;
    for (const f of notes) {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.028, t + 1.4);
      g.gain.linearRampToValueAtTime(0.0001, t + 5.6);
      const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 900;
      o.connect(flt); flt.connect(g); g.connect(master);
      o.start(t); o.stop(t + 5.8);
    }
  };
  playChord();
  musicTimer = setInterval(playChord, 5200);
}

export function updateAudio(dt) {
  if (!ctx) return;
  const t = ctx.currentTime;
  if (S.driving) {
    const sp = Math.abs(S.driving.userData.speed);
    engineOsc.frequency.setTargetAtTime(50 + sp * 4.2, t, 0.06);
    engineFilter.frequency.setTargetAtTime(240 + sp * 26, t, 0.08);
    engineGain.gain.setTargetAtTime(0.05 + Math.min(0.08, sp * 0.002), t, 0.09);
  } else if (engineGain) {
    engineGain.gain.setTargetAtTime(0, t, 0.1);
  }
  // Siren volume follows the nearest police car.
  let nearest = 1e9;
  for (const cop of S.police) {
    const p = cop.group.position, pl = S.driving ? S.driving.group.position : S.player.group.position;
    const d = Math.hypot(p.x - pl.x, p.z - pl.z);
    if (d < nearest) nearest = d;
  }
  if (sirenGain) sirenGain.gain.setTargetAtTime(clamp(0.06 - nearest * 0.0006, 0, 0.05), t, 0.2);
}

function blip(freqA, freqB, dur, type, vol, when = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freqA, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(30, freqB), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

export function sfxShot() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const len = Math.floor(ctx.sampleRate * 0.16);
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const src = ctx.createBufferSource(); src.buffer = buffer;
  const g = ctx.createGain(); g.gain.value = 0.5;
  const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 3200;
  src.connect(flt); flt.connect(g); g.connect(master);
  src.start(t);
  blip(220, 40, 0.12, 'sine', 0.4);
}

export function sfxThud() { blip(140, 45, 0.14, 'sine', 0.5); }
export function sfxCrash(strength = 1) {
  blip(90, 30, 0.3, 'sawtooth', 0.25 * strength);
  if (ctx) {
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * 0.2);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buffer;
    const g = ctx.createGain(); g.gain.value = 0.22 * strength;
    src.connect(g); g.connect(master); src.start(t);
  }
}
export function sfxChime() { blip(880, 880, 0.12, 'sine', 0.18); blip(1318, 1318, 0.2, 'sine', 0.16, 0.09); }
export function sfxCash() { blip(1046, 1046, 0.09, 'square', 0.08); blip(1568, 1568, 0.16, 'square', 0.08, 0.07); }
export function sfxFail() { blip(320, 110, 0.4, 'sawtooth', 0.16); }
export function sfxDoor() { blip(180, 90, 0.09, 'square', 0.12); }
