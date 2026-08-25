import { useEffect, useRef, useState } from "react";
import { Recorder, type Recording } from "../lib/recorder";
import { LevelMeter, Slider } from "../ui/Primitives";
import { BeautyVideo } from "../ui/BeautyVideo";
import { readLevel } from "../lib/audio";
import type { MediaKind } from "../lib/audio";
import { C, greenGradient, glowColor } from "../lib/theme";

export default function Camera({
  onCapture,
  onImport,
}: {
  onCapture: (r: Recording) => void;
  onImport: () => void;
}) {
  const rec = useRef<Recorder | null>(null);
  const timer = useRef<number | null>(null);

  const [mode, setMode] = useState<MediaKind>("video");
  const [armed, setArmed] = useState(false); // camera preview live
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [err, setErr] = useState("");
  const [getLevel, setGetLevel] = useState<() => number | null>(() => null);
  const [beauty, setBeauty] = useState(0.35);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const clearTimer = () => {
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
  };

  // arm camera on mount (or when switching back to video mode)
  useEffect(() => {
    if (mode !== "video" || armed || recording) return;
    let dead = false;
    (async () => {
      const r = new Recorder();
      try {
        // open the camera without recording so the user sees themselves instantly
        await r.start("video");
        if (dead) {
          r.cancel();
          return;
        }
        rec.current = r;
        setArmed(true);
        setStream(r.stream);
        setGetLevel(() => () => (r.analyser ? readLevel(r.analyser) : null));
      } catch {
        setErr("Camera permission needed. You can still import a file.");
      }
    })();
    return () => {
      dead = true;
    };
  }, [mode, armed, recording]);

  // cleanup on unmount
  useEffect(
    () => () => {
      clearTimer();
      rec.current?.cancel();
    },
    []
  );

  const start = async () => {
    setErr("");
    clearTimer();
    if (mode === "video" && rec.current && armed) {
      rec.current.cancel();
      rec.current = null;
      setArmed(false);
    }
    const r = new Recorder();
    try {
      await r.start(mode);
      rec.current = r;
      setGetLevel(() => () => (r.analyser ? readLevel(r.analyser) : null));
      if (mode === "video") setStream(r.stream);
      setRecording(true);
      setElapsed(0);
      timer.current = window.setInterval(() => setElapsed(r.elapsed), 100);
    } catch {
      setErr("Mic/camera blocked. Allow access or import a file instead.");
    }
  };

  const stop = async () => {
    clearTimer();
    const r = rec.current;
    if (!r) return;
    setRecording(false);
    try {
      const take = await r.stop();
      rec.current = null;
      onCapture({ ...take, beauty: take.kind === "video" ? beauty : 0 });
    } catch {
      setErr("Recording failed, try again.");
      r.cancel();
    }
  };

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex h-full flex-col bg-black">
      {/* ---------- top actions ---------- */}
      <div className="flex items-center gap-2 px-4 pt-3">
        <button
          onClick={onImport}
          className="flex flex-1 items-center justify-center gap-2 rounded-full border py-2.5 text-[12px] font-medium backdrop-blur active:scale-[0.97]"
          style={{ borderColor: C.line, background: "rgba(199,208,214,0.07)", color: C.silver }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M12 16V4m0 0L7 9m5-5 5 5" />
            <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
          </svg>
          Import Audio / Video
        </button>
        <button
          onClick={() => setMode((m) => (m === "video" ? "audio" : "video"))}
          className="flex items-center justify-center gap-2 rounded-full border py-2.5 pl-3 pr-4 text-[12px] font-medium backdrop-blur transition active:scale-[0.97]"
          style={{
            borderColor: mode === "audio" ? glowColor(C.green, 0.5) : C.line,
            background: mode === "audio" ? glowColor(C.greenDeep, 0.28) : "rgba(199,208,214,0.07)",
            color: mode === "audio" ? "#8ff0bd" : C.silver,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
            <path d="M5 10a7 7 0 0 0 14 0M12 17v4" />
          </svg>
          {mode === "audio" ? "Audio mode" : "Video mode"}
        </button>
      </div>

      {/* ---------- stage ---------- */}
      <div className="relative mt-3 flex-1 overflow-hidden">
        {mode === "video" ? (
          <BeautyVideo
            stream={stream}
            intensity={beauty}
            autoPlay
            muted
            playsInline
            containerClassName="h-full w-full"
            className="object-cover"
            style={{ objectFit: "cover", opacity: armed || recording ? 1 : 0.15 }}
          />
        ) : (
          <div
            className="flex h-full w-full flex-col items-center justify-center gap-8 px-8"
            style={{
              background: `radial-gradient(circle at 50% 35%, ${glowColor(C.greenDeep, 0.35)} 0%, #050b08 70%)`,
            }}
          >
            <div
              className="grid h-28 w-28 place-items-center rounded-full border transition-all duration-300"
              style={{
                borderColor: recording ? glowColor(C.green, 0.6) : C.line,
                background: recording ? glowColor(C.greenDeep, 0.25) : "rgba(199,208,214,0.04)",
                transform: recording ? "scale(1.1)" : undefined,
                boxShadow: recording ? `0 0 40px -8px ${glowColor(C.green, 0.6)}` : undefined,
              }}
            >
              <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke={recording ? "#6ee7a5" : C.silverDim} strokeWidth="1.8" strokeLinecap="round">
                <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                <path d="M5 10a7 7 0 0 0 14 0M12 17v4" />
              </svg>
            </div>
            <LevelMeter get={getLevel} active={recording || mode === "audio"} />
            <p className="text-center text-[11px]" style={{ color: "#5c6b64" }}>
              Lossless 48kHz PCM · processing-free capture
            </p>
          </div>
        )}

        {/* recording HUD */}
        {recording && (
          <div className="absolute left-1/2 top-4 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 backdrop-blur">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            <span className="font-mono text-[12px] text-white">{fmt(elapsed)}</span>
          </div>
        )}

        {mode === "video" && !armed && !recording && !err && (
          <div className="absolute inset-0 grid place-items-center">
            <div className="h-16 w-16 animate-spin rounded-full border-2" style={{ borderColor: C.line, borderTopColor: C.green }} />
          </div>
        )}

        {err && (
          <div className="absolute inset-x-4 bottom-4 rounded-2xl border border-white/10 bg-black/80 p-4 text-center text-[12px] text-zinc-300 backdrop-blur">
            {err}
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/80 to-transparent" />
      </div>

      {/* ---------- beauty intensity ---------- */}
      {mode === "video" && (
        <div className="bg-black px-5 pt-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: C.silver }}>
              <span>✨</span> Beautify
            </span>
            <span className="font-mono text-[11px]" style={{ color: C.silverDim }}>
              {beauty < 0.01 ? "Natural" : `${Math.round(beauty * 100)}%`}
            </span>
          </div>
          <Slider value={beauty} min={0} max={1} step={0.01} color={C.green} onChange={setBeauty} />
          <div className="flex justify-between text-[9px]" style={{ color: "#4f5c56" }}>
            <span>Natural</span>
            <span>Edited</span>
          </div>
        </div>
      )}

      {/* ---------- record button ---------- */}
      <div className="flex flex-col items-center gap-2 bg-black pb-8 pt-3">
        <button
          onClick={recording ? stop : start}
          className="grid h-[74px] w-[74px] place-items-center rounded-full border-[3px] transition active:scale-95"
          style={{ borderColor: "rgba(199,208,214,0.28)" }}
        >
          {recording ? (
            <span
              className="h-6 w-6 rounded-[6px] transition-all duration-200"
              style={{ background: C.rec, boxShadow: `0 0 24px ${C.rec}99` }}
            />
          ) : (
            <span
              className="h-[58px] w-[58px] rounded-full transition-all duration-200"
              style={{
                background: greenGradient,
                border: "1px solid rgba(255,255,255,0.25)",
                boxShadow: `0 0 28px -4px ${glowColor(C.green, 0.8)}, inset 0 1px 0 rgba(255,255,255,0.35)`,
              }}
            />
          )}
        </button>
        <span className="text-[10px] tracking-widest uppercase" style={{ color: "#5c6b64" }}>
          {recording ? "Tap to stop" : mode === "video" ? "Record video" : "Record audio"}
        </span>
      </div>
    </div>
  );
}
