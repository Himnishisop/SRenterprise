// ---- AUD FX encoders ----
// Audio  -> MP3 (320 kbps) via lamejs after offline FX + trim render.
// Video  -> MP4 (or WebM fallback) via a single, reliable real-time pipeline:
//           the source plays start->end while its audio is routed through the FX
//           graph and each displayed frame is drawn to a canvas WITH the beauty
//           look baked in; canvas + FX-audio are captured by MediaRecorder.

import { Mp3Encoder } from "@breezystack/lamejs";
import type { FxState } from "./audio";
import type { ExportOpts } from "./recorder";

export type Stage = "prepare" | "audio" | "video" | "finalize" | "done";

export interface Progress {
  stage: Stage;
  ratio: number; // 0..1 within stage
}

/* ------------------------------------------------------------------ *
 * AUDIO: render FX + trim offline, then encode to MP3 (320 kbps CBR)  *
 * ------------------------------------------------------------------ */

export async function renderAudioBuffer(
  file: File,
  fx: FxState,
  opts: ExportOpts = {}
): Promise<AudioBuffer> {
  const AC: typeof AudioContext =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const decodeCtx = new AC();
  const raw = await file.arrayBuffer();
  const decoded = await decodeCtx.decodeAudioData(raw.slice(0));
  await decodeCtx.close();

  const rate = decoded.sampleRate;
  const start = Math.max(0, Math.floor((opts.trimStart ?? 0) * rate));
  const end =
    opts.trimEnd && opts.trimEnd > (opts.trimStart ?? 0)
      ? Math.min(decoded.length, Math.floor(opts.trimEnd * rate))
      : decoded.length;
  const length = Math.max(1, end - start);

  const off = new OfflineAudioContext(Math.min(2, decoded.numberOfChannels), length, rate);
  const { buildChain } = await import("./audio");
  const chain = buildChain(off);
  chain.apply(fx);
  chain.output.connect(off.destination);

  const clip = off.createBuffer(decoded.numberOfChannels, length, rate);
  for (let c = 0; c < decoded.numberOfChannels; c++) {
    clip.copyToChannel(decoded.getChannelData(c).subarray(start, end), c);
  }
  const player = off.createBufferSource();
  player.buffer = clip;
  player.connect(chain.input);
  player.start();

  const rendered = await off.startRendering();
  chain.dispose();
  return rendered;
}

const toInt16 = (f: Float32Array): Int16Array => {
  const out = new Int16Array(f.length);
  for (let i = 0; i < f.length; i++) {
    const s = Math.max(-1, Math.min(1, f[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
};

export function encodeMp3(buffer: AudioBuffer, onProgress?: (r: number) => void): Blob {
  const channels = Math.min(2, buffer.numberOfChannels);
  const rate = buffer.sampleRate;
  const enc = new Mp3Encoder(channels, rate, 320);

  const left = toInt16(buffer.getChannelData(0));
  const right = channels > 1 ? toInt16(buffer.getChannelData(1)) : left;

  const blockSize = 1152;
  const data: Uint8Array[] = [];
  const total = left.length;

  for (let i = 0; i < total; i += blockSize) {
    const l = left.subarray(i, i + blockSize);
    const r = right.subarray(i, i + blockSize);
    const chunk = channels > 1 ? enc.encodeBuffer(l, r) : enc.encodeBuffer(l);
    if (chunk.length > 0) data.push(new Uint8Array(chunk));
    if (onProgress && (i & 0x3ffff) === 0) onProgress(Math.min(0.98, i / total));
  }
  const flush = enc.flush();
  if (flush.length > 0) data.push(new Uint8Array(flush));
  onProgress?.(1);

  return new Blob(data as BlobPart[], { type: "audio/mpeg" });
}

/* ------------------------------------------------------------------ *
 * VIDEO: single reliable real-time pipeline                          *
 * ------------------------------------------------------------------ */

function pickVideoMime(): { mime: string; ext: "mp4" | "webm" } {
  const candidates: { mime: string; ext: "mp4" | "webm" }[] = [
    { mime: "video/mp4;codecs=avc1.42E01F,mp4a.40.2", ext: "mp4" },
    { mime: "video/mp4;codecs=avc1.4d0028,mp4a.40.2", ext: "mp4" },
    { mime: "video/mp4", ext: "mp4" },
    { mime: "video/webm;codecs=vp9,opus", ext: "webm" },
    { mime: "video/webm;codecs=vp8,opus", ext: "webm" },
    { mime: "video/webm", ext: "webm" },
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c.mime)) return c;
  }
  return { mime: "", ext: "webm" };
}

// resolve real duration for MediaRecorder blobs that report Infinity
async function resolveDuration(video: HTMLVideoElement): Promise<number> {
  if (isFinite(video.duration) && video.duration > 0) return video.duration;
  return await new Promise<number>((res) => {
    const done = () => {
      video.removeEventListener("timeupdate", done);
      video.currentTime = 0;
      res(isFinite(video.duration) && video.duration > 0 ? video.duration : 0);
    };
    video.addEventListener("timeupdate", done);
    video.currentTime = 1e101;
    setTimeout(() => res(isFinite(video.duration) ? video.duration : 0), 1500);
  });
}

export async function renderVideoMp4(
  url: string,
  fx: FxState,
  onProgress: (p: Progress) => void,
  opts: ExportOpts = {}
): Promise<{ blob: Blob; ext: "mp4" | "webm" }> {
  const { drawBeauty } = await import("./filters");
  const beauty = opts.beauty ?? 0;

  onProgress({ stage: "prepare", ratio: 0.1 });

  // --- load source (muted: we take audio from the offline render, not this element) ---
  const video = document.createElement("video");
  video.src = url;
  video.crossOrigin = "anonymous";
  video.playsInline = true;
  video.muted = true;
  await new Promise<void>((res, rej) => {
    video.onloadedmetadata = () => res();
    video.onerror = () => rej(new Error("video load failed"));
  });

  const total = await resolveDuration(video);
  const start = Math.max(0, opts.trimStart ?? 0);
  const end = opts.trimEnd && opts.trimEnd > start ? Math.min(total || opts.trimEnd, opts.trimEnd) : total;
  const span = Math.max(0.2, (end || total) - start);

  const width = (video.videoWidth || 720) - ((video.videoWidth || 720) % 2);
  const height = (video.videoHeight || 1280) - ((video.videoHeight || 1280) % 2);

  onProgress({ stage: "prepare", ratio: 0.5 });

  // --- CLEAN AUDIO: render the FX + trim offline into a pristine buffer, then
  //     play it from an AudioBufferSourceNode. Because that runs on the audio
  //     thread (independent of the video element / main-thread jank), the
  //     captured audio never crackles no matter how busy frame drawing gets. ---
  const AC: typeof AudioContext =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

  let audioBuffer: AudioBuffer | null = null;
  try {
    const resp = await fetch(url);
    const blob = await resp.blob();
    const file = new File([blob], "clip", { type: blob.type });
    audioBuffer = await renderAudioBuffer(file, fx, { ...opts, trimStart: start, trimEnd: end });
  } catch {
    audioBuffer = null;
  }

  const ctx = new AC();
  await ctx.resume();
  const dest = ctx.createMediaStreamDestination();
  let bufSrc: AudioBufferSourceNode | null = null;
  if (audioBuffer) {
    bufSrc = ctx.createBufferSource();
    bufSrc.buffer = audioBuffer;
    bufSrc.connect(dest);
  }

  onProgress({ stage: "prepare", ratio: 1 });

  // --- canvas for filtered frames ---
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const c2d = canvas.getContext("2d", { alpha: false })!;

  const vstream = canvas.captureStream(30);
  const audioTracks = dest.stream.getAudioTracks();
  const mixed = new MediaStream([...vstream.getVideoTracks(), ...audioTracks]);

  const { mime, ext } = pickVideoMime();
  const mr = new MediaRecorder(mixed, {
    mimeType: mime || undefined,
    videoBitsPerSecond: 8_000_000,
    audioBitsPerSecond: 256_000,
  });
  const chunks: Blob[] = [];
  mr.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);

  // --- seek to trim start ---
  await new Promise<void>((res) => {
    const onSeek = () => {
      video.removeEventListener("seeked", onSeek);
      res();
    };
    video.addEventListener("seeked", onSeek);
    video.currentTime = start;
    setTimeout(res, 800);
  });

  let stopped = false;
  const finish = () => {
    if (stopped) return;
    stopped = true;
    try {
      video.pause();
    } catch {
      /* noop */
    }
    try {
      bufSrc?.stop();
    } catch {
      /* noop */
    }
  };

  const draw = () => {
    if (stopped) return;
    drawBeauty(c2d, video, width, height, beauty);
    const rel = video.currentTime - start;
    onProgress({ stage: "video", ratio: Math.max(0, Math.min(0.99, rel / span)) });
    if (video.currentTime >= end - 0.03 || video.ended) {
      finish();
      return;
    }
    requestAnimationFrame(draw);
  };

  mr.start(200);
  // start clean audio + muted video together
  bufSrc?.start();
  await video.play().catch(() => {});
  requestAnimationFrame(draw);

  // audio buffer end is the authoritative stop (keeps a/v the same length)
  if (bufSrc) bufSrc.onended = finish;

  await new Promise<void>((res) => {
    const cap = setTimeout(finish, (span + 3) * 1000 * 1.5);
    const check = () => {
      if (stopped) {
        clearTimeout(cap);
        res();
      } else {
        requestAnimationFrame(check);
      }
    };
    check();
  });

  onProgress({ stage: "finalize", ratio: 0.4 });

  await new Promise<void>((res) => {
    mr.onstop = () => res();
    if (mr.state !== "inactive") mr.stop();
    else res();
  });

  ctx.close().catch(() => {});
  onProgress({ stage: "finalize", ratio: 1 });

  return { blob: new Blob(chunks, { type: mime || "video/webm" }), ext };
}
