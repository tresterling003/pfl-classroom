"use client";
/** Tiny, subtle sound effects synthesized with WebAudio (no files to load). Off by default. */
let ctx: AudioContext | null = null;
const KEY = "pfl:sound";

export function soundEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) === "on";
  } catch {
    return false;
  }
}
export function setSoundEnabled(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {}
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = "sine", vol = 0.06) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, ctx.currentTime + start);
  g.gain.linearRampToValueAtTime(vol, ctx.currentTime + start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
  o.connect(g).connect(ctx.destination);
  o.start(ctx.currentTime + start);
  o.stop(ctx.currentTime + start + dur + 0.05);
}

export function play(kind: "pass" | "fail" | "complete" | "correct" | "wrong" | "tap") {
  if (!soundEnabled()) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    switch (kind) {
      case "tap": return tone(660, 0, 0.06, "sine", 0.03);
      case "correct": tone(660, 0, 0.12); return tone(880, 0.08, 0.18);
      case "wrong": return tone(220, 0, 0.22, "triangle", 0.05);
      case "pass": tone(523, 0, 0.15); tone(659, 0.12, 0.15); return tone(784, 0.24, 0.3);
      case "fail": tone(392, 0, 0.2, "triangle"); return tone(330, 0.18, 0.3, "triangle");
      case "complete": [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.35)); return;
    }
  } catch {}
}
