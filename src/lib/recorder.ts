// ---- AUD FX capture engine ----
// Both audio and video are captured with MediaRecorder (reliable everywhere).
// Browser AGC / noise-suppression / echo-cancel are left ON for clean, usable
// takes; the creative FX are applied later in the editor / at export.

import type { MediaKind } from "./audio";

const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  channelCount: 2,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

export interface Recording {
  kind: MediaKind;
  file: File;
  url: string;
  duration: number;
  lossless: boolean;
  /** beauty intensity chosen at capture time, 0..1 (applied at export) */
  beauty?: number;
}

export interface ExportOpts {
  beauty?: number; // 0 = natural, 1 = fully edited
  trimStart?: number; // seconds
  trimEnd?: number; // seconds (0 / undefined = full length)
}

export class Recorder {
  private ctx: AudioContext | null = null;
  stream: MediaStream | null = null;
  private src: MediaStreamAudioSourceNode | null = null;
  private mr: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private mime = "";
  private startedAt = 0;
  kind: MediaKind = "audio";
  analyser: AnalyserNode | null = null;
  active = false;

  async start(kind: MediaKind): Promise<void> {
    this.kind = kind;
    this.chunks = [];
    this.analyser = null;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: AUDIO_CONSTRAINTS,
      video:
        kind === "video"
          ? { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }
          : false,
    });
    this.stream = stream;

    const AC: typeof AudioContext =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    // level-meter tap only — use the hardware's native rate (no forced resample)
    const ctx = new AC({ latencyHint: "interactive" });
    await ctx.resume();
    this.ctx = ctx;

    const src = ctx.createMediaStreamSource(stream);
    this.src = src;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.6;
    src.connect(analyser);
    this.analyser = analyser;

    if (kind === "audio") {
      // Record the raw mic track straight through MediaRecorder — reliable across
      // browsers (the old ScriptProcessor approach silently produced no data in
      // Chrome because the node wasn't connected to a destination).
      const audioTypes = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ];
      const mime = audioTypes.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
      const mr = new MediaRecorder(stream, {
        mimeType: mime || undefined,
        audioBitsPerSecond: 256_000,
      });
      this.mr = mr;
      this.mime = mime || "audio/webm";
      mr.ondataavailable = (e) => e.data.size > 0 && this.chunks.push(e.data);
      mr.start(250);
    } else {
      const videoTrack = stream.getVideoTracks()[0];
      // record the camera track + the mic track directly (clean, in sync)
      const mixed = new MediaStream([videoTrack, ...stream.getAudioTracks()]);

      const types = [
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm",
        "video/mp4",
      ];
      const mime = types.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
      const mr = new MediaRecorder(mixed, {
        mimeType: mime || undefined,
        videoBitsPerSecond: 8_000_000,
        audioBitsPerSecond: 256_000,
      });
      this.mr = mr;
      this.mime = mime || "video/webm";
      mr.ondataavailable = (e) => e.data.size > 0 && this.chunks.push(e.data);
      mr.start(250);
    }

    this.startedAt = performance.now();
    this.active = true;
  }

  get elapsed(): number {
    return this.active ? (performance.now() - this.startedAt) / 1000 : 0;
  }

  async stop(): Promise<Recording> {
    this.active = false;
    const duration = Math.max(0.1, (performance.now() - this.startedAt) / 1000);

    // flush the recorder
    const mr = this.mr!;
    await new Promise<void>((res) => {
      mr.onstop = () => res();
      if (mr.state !== "inactive") mr.stop();
      else res();
    });
    const type = this.mime || mr.mimeType || (this.kind === "audio" ? "audio/webm" : "video/webm");
    const blob = new Blob(this.chunks, { type });
    this.teardown();

    if (this.kind === "audio") {
      const ext = type.includes("mp4") || type.includes("mpeg") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
      return {
        kind: "audio",
        file: new File([blob], `aud-fx-take.${ext}`, { type }),
        url: URL.createObjectURL(blob),
        duration,
        lossless: false,
      };
    }

    const ext = type.includes("mp4") ? "mp4" : "webm";
    return {
      kind: "video",
      file: new File([blob], `aud-fx-take.${ext}`, { type }),
      url: URL.createObjectURL(blob),
      duration,
      lossless: false,
    };
  }

  private teardown() {
    try {
      this.src?.disconnect();
      this.analyser?.disconnect();
    } catch {
      /* noop */
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close().catch(() => {});
    this.stream = null;
    this.ctx = null;
    this.src = null;
    this.mr = null;
    this.chunks = [];
  }

  cancel() {
    this.active = false;
    if (this.mr && this.mr.state !== "inactive") this.mr.stop();
    this.teardown();
  }
}

// (Export/encode logic now lives in ./encode.ts — MP3 for audio, MP4 for video.)
