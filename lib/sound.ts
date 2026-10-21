export type ActionSound =
  | "paper"
  | "tap"
  | "wax"
  | "stamp"
  | "crack"
  | "chime"
  | "tear";

const STORAGE_KEY = "lovecan:sound:v1";

let context: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let muted = readMuted();
const listeners = new Set<() => void>();

function readMuted(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "off";
  } catch {
    return false;
  }
}

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!context) {
    const Ctor =
      window.AudioContext ??
      (
        window as unknown as {
          webkitAudioContext?: typeof AudioContext;
        }
      ).webkitAudioContext;
    if (!Ctor) return null;
    context = new Ctor();
    master = context.createGain();
    master.gain.value = 0.58;
    master.connect(context.destination);
  }
  if (context.state === "suspended") void context.resume();
  return context;
}

export function unlockSound(): void {
  const ctx = getContext();
  if (!ctx) return;
  const silent = ctx.createBuffer(1, 1, 22050);
  const source = ctx.createBufferSource();
  source.buffer = silent;
  source.connect(ctx.destination);
  source.start(0);
}

export function soundMuted(): boolean {
  return muted;
}

export function setSoundMuted(next: boolean): void {
  muted = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? "off" : "on");
  } catch {
    // Sound preference is cosmetic; keep it in memory only.
  }
  listeners.forEach((listener) => listener());
  if (!next) {
    unlockSound();
    playSound("tap");
  }
}

export function subscribeSound(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function noiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noise && noise.sampleRate === ctx.sampleRate) return noise;
  const length = Math.floor(ctx.sampleRate * 1.4);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let index = 0; index < length; index += 1) {
    const white = Math.random() * 2 - 1;
    last = last * 0.36 + white * 0.64;
    data[index] = last;
  }
  noise = buffer;
  return buffer;
}

function burst(
  ctx: AudioContext,
  at: number,
  options: {
    duration: number;
    gain: number;
    type: BiquadFilterType;
    frequency: number;
    endFrequency?: number;
    q?: number;
  },
): void {
  if (!master) return;
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = options.type;
  filter.frequency.setValueAtTime(options.frequency, at);
  if (options.endFrequency) {
    filter.frequency.exponentialRampToValueAtTime(
      options.endFrequency,
      at + options.duration,
    );
  }
  filter.Q.value = options.q ?? 0.7;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(options.gain, at + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + options.duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  source.start(at);
  source.stop(at + options.duration + 0.03);
}

function tone(
  ctx: AudioContext,
  at: number,
  options: {
    from: number;
    to?: number;
    duration: number;
    gain: number;
    type?: OscillatorType;
    attack?: number;
  },
): void {
  if (!master) return;
  const oscillator = ctx.createOscillator();
  oscillator.type = options.type ?? "sine";
  oscillator.frequency.setValueAtTime(options.from, at);
  if (options.to) {
    oscillator.frequency.exponentialRampToValueAtTime(
      options.to,
      at + options.duration,
    );
  }
  const gain = ctx.createGain();
  const attack = options.attack ?? 0.008;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(options.gain, at + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + options.duration);
  oscillator.connect(gain);
  gain.connect(master);
  oscillator.start(at);
  oscillator.stop(at + options.duration + 0.03);
}

export function playSound(name: ActionSound): void {
  if (muted) return;
  const ctx = getContext();
  if (!ctx || !master || ctx.state === "closed") return;
  const at = ctx.currentTime + 0.015;

  switch (name) {
    case "paper":
      burst(ctx, at, {
        duration: 0.2,
        gain: 0.1,
        type: "highpass",
        frequency: 1100,
      });
      burst(ctx, at + 0.075, {
        duration: 0.15,
        gain: 0.06,
        type: "bandpass",
        frequency: 2400,
        q: 0.9,
      });
      break;
    case "tear":
      burst(ctx, at, {
        duration: 0.32,
        gain: 0.09,
        type: "highpass",
        frequency: 1400,
        endFrequency: 3600,
      });
      break;
    case "tap":
      tone(ctx, at, {
        from: 210,
        to: 150,
        duration: 0.09,
        gain: 0.08,
        type: "triangle",
      });
      burst(ctx, at, {
        duration: 0.035,
        gain: 0.03,
        type: "bandpass",
        frequency: 900,
      });
      break;
    case "wax":
      tone(ctx, at, {
        from: 96,
        to: 68,
        duration: 0.42,
        gain: 0.055,
        attack: 0.06,
      });
      burst(ctx, at, {
        duration: 0.24,
        gain: 0.035,
        type: "lowpass",
        frequency: 520,
      });
      break;
    case "stamp":
      tone(ctx, at, {
        from: 78,
        to: 44,
        duration: 0.28,
        gain: 0.16,
      });
      burst(ctx, at, {
        duration: 0.09,
        gain: 0.09,
        type: "lowpass",
        frequency: 380,
      });
      break;
    case "crack":
      burst(ctx, at, {
        duration: 0.075,
        gain: 0.14,
        type: "highpass",
        frequency: 1900,
      });
      burst(ctx, at + 0.035, {
        duration: 0.16,
        gain: 0.07,
        type: "bandpass",
        frequency: 900,
        q: 0.6,
      });
      tone(ctx, at, {
        from: 125,
        to: 58,
        duration: 0.14,
        gain: 0.07,
        type: "triangle",
      });
      break;
    case "chime":
      [523.25, 659.25, 783.99].forEach((frequency, index) => {
        tone(ctx, at + index * 0.075, {
          from: frequency,
          duration: 1.25 + index * 0.15,
          gain: 0.026,
          attack: 0.02,
        });
      });
      break;
  }
}
