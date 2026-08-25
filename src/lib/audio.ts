// ---- Voice Aura audio engine ----
// Presets + graph builder shared by live preview, offline render and export.

export type MediaKind = "video" | "audio";

export interface DelaySettings {
  time: number; // seconds
  feedback: number; // 0..0.85
  mix: number; // 0..1
}

export interface ReverbSettings {
  decay: number; // seconds
  mix: number; // 0..1
  tone: number; // damp lowpass Hz
}

export interface Preset {
  id: string;
  name: string;
  sub: string;
  values: DelaySettings | ReverbSettings;
}

export const DELAY_PRESETS: Preset[] = [
  { id: "off", name: "Dry", sub: "no delay", values: { time: 0, feedback: 0, mix: 0 } },
  { id: "slap", name: "Slapback", sub: "120ms · tight", values: { time: 0.12, feedback: 0.12, mix: 0.22 } },
  { id: "echo", name: "Echo", sub: "320ms · classic", values: { time: 0.32, feedback: 0.32, mix: 0.32 } },
  { id: "dotted", name: "Dotted", sub: "450ms · rhythmic", values: { time: 0.45, feedback: 0.42, mix: 0.3 } },
  { id: "canyon", name: "Canyon", sub: "680ms · wide", values: { time: 0.68, feedback: 0.55, mix: 0.38 } },
];

export const REVERB_PRESETS: Preset[] = [
  { id: "off", name: "Dry", sub: "no reverb", values: { decay: 0.1, mix: 0, tone: 8000 } },
  { id: "room", name: "Room", sub: "0.8s · tight", values: { decay: 0.8, mix: 0.22, tone: 6500 } },
  { id: "plate", name: "Plate", sub: "1.5s · smooth", values: { decay: 1.5, mix: 0.32, tone: 5200 } },
  { id: "hall", name: "Hall", sub: "2.4s · big", values: { decay: 2.4, mix: 0.4, tone: 4200 } },
  { id: "cathedral", name: "Cathedral", sub: "4s · huge", values: { decay: 4, mix: 0.5, tone: 3200 } },
];

// ---- impulse response cache keyed by decay length ----
const irCache = new Map<string, AudioBuffer>();

export function getImpulse(ctx: BaseAudioContext, decay: number): AudioBuffer {
  const key = `${Math.round(decay * 10)}@${ctx.sampleRate}`;
  const hit = irCache.get(key);
  if (hit) return hit;

  const rate = ctx.sampleRate;
  const len = Math.max(1, Math.floor(rate * decay));
  const buf = ctx.createBuffer(2, len, rate);
  for (let c = 0; c < 2; c++) {
    const ch = buf.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      // noise * exponential decay, lightly lowpassed so it doesn't sound fizzy
      const n = Math.random() * 2 - 1;
      lp += (n - lp) * 0.35;
      ch[i] = lp * Math.pow(1 - t, 2.2);
    }
    // tiny early reflection for a sense of space
    const early = Math.floor(rate * 0.012 * (c + 1));
    if (early < len) ch[early] += 0.35 * (1 - early / len);
  }
  irCache.set(key, buf);
  return buf;
}

export interface FxState {
  delay: DelaySettings;
  reverb: ReverbSettings;
  volume: number; // 0..2 linear gain
}

export const defaultFx: FxState = {
  delay: { ...DELAY_PRESETS[0].values as DelaySettings },
  reverb: { ...REVERB_PRESETS[0].values as ReverbSettings },
  volume: 1,
};

export interface Chain {
  input: GainNode;
  output: AudioNode;
  analyser: AnalyserNode;
  apply(fx: FxState): void;
  dispose(): void;
}

/**
 * input -> pre -> [dry] ................ -> sum -> volume -> analyser -> output
 *              \-> delay(feedback loop) -> sum
 *              \-> convolver(reverb)  --> sum
 */
export function buildChain(ctx: BaseAudioContext): Chain {
  const input = ctx.createGain();
  const pre = ctx.createGain();
  pre.gain.value = 1;

  const dry = ctx.createGain();
  const sum = ctx.createGain();
  const volume = ctx.createGain();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.75;

  // delay
  const delay = ctx.createDelay(2.5);
  const fb = ctx.createGain();
  const fbTone = ctx.createBiquadFilter();
  fbTone.type = "lowpass";
  fbTone.frequency.value = 4500;
  const delayWet = ctx.createGain();
  const delayHighpass = ctx.createBiquadFilter();
  delayHighpass.type = "highpass";
  delayHighpass.frequency.value = 180; // keeps echoes from getting muddy

  // reverb
  const revIn = ctx.createGain();
  const conv = ctx.createConvolver();
  const revTone = ctx.createBiquadFilter();
  revTone.type = "lowpass";
  revTone.frequency.value = 8000;
  const revWet = ctx.createGain();

  input.connect(pre);
  pre.connect(dry);
  dry.connect(sum);

  pre.connect(delay);
  delay.connect(delayHighpass);
  delayHighpass.connect(fbTone);
  fbTone.connect(fb);
  fb.connect(delay);
  delay.connect(delayWet);
  delayWet.connect(sum);

  pre.connect(revIn);
  revIn.connect(conv);
  conv.connect(revTone);
  revTone.connect(revWet);
  revWet.connect(sum);

  sum.connect(volume);
  volume.connect(analyser);

  let currentIr = "";

  const apply = (fx: FxState) => {
    const now = ctx instanceof AudioContext ? ctx.currentTime : 0;
    const set = (p: AudioParam, v: number) => {
      try {
        p.cancelScheduledValues(now);
        p.setTargetAtTime(v, now, 0.02);
      } catch {
        p.value = v;
      }
    };

    const dOn = fx.delay.mix > 0.001;
    set(delay.delayTime, Math.min(2.4, fx.delay.time));
    set(fb.gain, dOn ? Math.min(0.85, fx.delay.feedback) : 0);
    set(delayWet.gain, fx.delay.mix);
    // dry compensation so wet doesn't just get louder
    set(dry.gain, Math.max(0.35, 1 - (fx.delay.mix + fx.reverb.mix) * 0.45));

    const rOn = fx.reverb.mix > 0.001;
    const key = `${Math.round(fx.reverb.decay * 10)}@${ctx.sampleRate}`;
    if (rOn && key !== currentIr) {
      conv.buffer = getImpulse(ctx, Math.max(0.15, fx.reverb.decay));
      currentIr = key;
    }
    set(revWet.gain, rOn ? fx.reverb.mix : 0);
    set(revTone.frequency, fx.reverb.tone);

    set(volume.gain, fx.volume);
  };

  apply(defaultFx);

  return {
    input,
    output: analyser as unknown as AudioNode,
    analyser,
    apply,
    dispose() {
      try {
        input.disconnect();
        pre.disconnect();
        dry.disconnect();
        sum.disconnect();
        volume.disconnect();
        analyser.disconnect();
        delay.disconnect();
        delayHighpass.disconnect();
        fbTone.disconnect();
        fb.disconnect();
        delayWet.disconnect();
        revIn.disconnect();
        conv.disconnect();
        revTone.disconnect();
        revWet.disconnect();
      } catch {
        /* noop */
      }
    },
  };
}

// ---- level metering helper ----
export function readLevel(analyser: AnalyserNode): number {
  const buf = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(buf);
  let peak = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = Math.abs(buf[i] - 128) / 128;
    if (v > peak) peak = v;
  }
  return peak;
}

// ---- WAV encoding (16-bit PCM) ----
export function encodeWav(buffer: AudioBuffer): Blob {
  const chans = buffer.numberOfChannels;
  const rate = buffer.sampleRate;
  const bytes = 2;
  const blockAlign = chans * bytes;
  const dataSize = buffer.length * blockAlign;
  const ab = new ArrayBuffer(44 + dataSize);
  const v = new DataView(ab);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  v.setUint32(4, 36 + dataSize, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, chans, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * blockAlign, true);
  v.setUint16(32, blockAlign, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, dataSize, true);

  const data: Float32Array[] = [];
  for (let c = 0; c < chans; c++) data.push(buffer.getChannelData(c));
  let off = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let c = 0; c < chans; c++) {
      let s = Math.max(-1, Math.min(1, data[c][i]));
      v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
  }
  return new Blob([ab], { type: "audio/wav" });
}

export function download(blob: Blob, name: string) {
  const u = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = u;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 2000);
}
