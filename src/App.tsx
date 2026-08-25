import { useEffect, useRef, useState } from "react";
import Camera from "./screens/Camera";
import Editor from "./screens/Editor";
import { Login, Paywall, Splash } from "./screens/Onboarding";
import { defaultFx, download, type FxState, type MediaKind } from "./lib/audio";
import { type Recording } from "./lib/recorder";
import { renderAudioBuffer, encodeMp3, renderVideoMp4, type Progress } from "./lib/encode";
import { ExportOverlay } from "./screens/ExportOverlay";

type Stage = "splash" | "login" | "camera" | "editor";

const K_AUTH = "va_auth";
const K_EXPORTS = "va_exports";
const K_PRO = "va_pro";

export default function App() {
  const [stage, setStage] = useState<Stage>("splash");
  const [take, setTake] = useState<Recording | null>(null);
  const [fx, setFx] = useState<FxState>(defaultFx);
  const [beauty, setBeauty] = useState(0);
  const [trim, setTrim] = useState<{ start: number; end: number }>({ start: 0, end: 0 });

  const [exporting, setExporting] = useState(false);
  const [exProgress, setExProgress] = useState<Progress>({ stage: "prepare", ratio: 0 });
  const [exDone, setExDone] = useState(false);
  const [exError, setExError] = useState(false);
  const [paywall, setPaywall] = useState(false);
  const [toast, setToast] = useState("");

  const exportsUsed = useRef(Number(localStorage.getItem(K_EXPORTS) ?? 0));
  const [pro, setPro] = useState(localStorage.getItem(K_PRO) === "1");
  const returning = useRef(localStorage.getItem(K_AUTH) === "1");

  const fileInput = useRef<HTMLInputElement>(null);

  const flash = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(""), 2600);
  };

  // splash -> login (first run) or straight to camera
  useEffect(() => {
    if (stage !== "splash") return;
    const t = window.setTimeout(() => {
      setStage(returning.current ? "camera" : "login");
    }, 1500);
    return () => window.clearTimeout(t);
  }, [stage]);

  const login = () => {
    localStorage.setItem(K_AUTH, "1");
    setStage("camera");
  };

  const loadTake = (r: Recording) => {
    setTake(r);
    setFx(defaultFx);
    setBeauty(r.beauty ?? 0);
    setTrim({ start: 0, end: 0 });
    setStage("editor");
  };

  const importFile = (f: File) => {
    const isVideo = f.type.startsWith("video");
    loadTake({
      kind: isVideo ? "video" : "audio",
      file: f,
      url: URL.createObjectURL(f),
      duration: 0,
      lossless: false,
    });
  };

  const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

  const doExport = async () => {
    if (!take) return;
    if (exportsUsed.current >= 1 && !pro) {
      setPaywall(true);
      return;
    }
    setExporting(true);
    setExDone(false);
    setExError(false);
    setExProgress({ stage: "prepare", ratio: 0 });
    const opts = { beauty, trimStart: trim.start, trimEnd: trim.end };

    try {
      if (take.kind === "video") {
        const { blob, ext } = await renderVideoMp4(take.url, fx, setExProgress, opts);
        download(blob, `aud-fx-${stamp()}.${ext}`);
      } else {
        setExProgress({ stage: "audio", ratio: 0.1 });
        const buffer = await renderAudioBuffer(take.file, fx, opts);
        setExProgress({ stage: "audio", ratio: 0.4 });
        const blob = encodeMp3(buffer, (r) =>
          setExProgress({ stage: "audio", ratio: 0.4 + r * 0.5 })
        );
        setExProgress({ stage: "finalize", ratio: 1 });
        download(blob, `aud-fx-${stamp()}.mp3`);
      }
      setExProgress({ stage: "done", ratio: 1 });
      setExDone(true);
      exportsUsed.current += 1;
      localStorage.setItem(K_EXPORTS, String(exportsUsed.current));
    } catch (e) {
      console.error(e);
      setExError(true);
    }
  };

  const closeExport = () => {
    setExporting(false);
    setExDone(false);
    setExError(false);
  };

  const unlock = () => {
    localStorage.setItem(K_PRO, "1");
    setPro(true);
    setPaywall(false);
    flash("Pro unlocked 🎉");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#07070a] p-0 sm:p-6">
      {/* ambient glow (desktop backdrop) */}
      <div className="pointer-events-none fixed inset-0 hidden sm:block">
        <div className="absolute left-1/2 top-1/4 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-emerald-700/15 blur-[120px]" />
        <div className="absolute bottom-1/4 left-1/2 h-[360px] w-[360px] -translate-x-1/2 rounded-full bg-teal-800/15 blur-[120px]" />
      </div>

      {/* phone */}
      <div
        className="relative h-[100dvh] w-full max-w-[430px] overflow-hidden bg-black sm:h-[860px] sm:max-h-[92vh] sm:rounded-[46px] sm:border sm:shadow-[0_40px_120px_-30px_rgba(16,185,129,0.35)]"
        style={{ borderColor: "rgba(199,208,214,0.14)" }}
      >
        {/* notch */}
        <div className="pointer-events-none absolute left-1/2 top-0 z-30 hidden h-6 w-32 -translate-x-1/2 rounded-b-2xl bg-black sm:block" />

        {stage === "splash" && <Splash onDone={() => setStage(returning.current ? "camera" : "login")} />}
        {stage === "login" && <Login onLogin={login} />}
        {stage === "camera" && (
          <Camera onCapture={loadTake} onImport={() => fileInput.current?.click()} />
        )}
        {stage === "editor" && take && (
          <Editor
            kind={take.kind as MediaKind}
            url={take.url}
            fx={fx}
            setFx={setFx}
            beauty={beauty}
            setBeauty={setBeauty}
            trim={trim}
            setTrim={setTrim}
            onBack={() => setStage("camera")}
            onExport={doExport}
            exporting={exporting}
          />
        )}

        {exporting && (
          <ExportOverlay
            kind={(take?.kind as MediaKind) ?? "audio"}
            progress={exProgress}
            done={exDone}
            error={exError}
            onClose={closeExport}
          />
        )}

        {paywall && <Paywall onUnlock={unlock} onClose={() => setPaywall(false)} />}

        {toast && (
          <div
            className="pointer-events-none absolute bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full px-4 py-2 text-[12px] font-semibold shadow-xl"
            style={{ background: "linear-gradient(180deg,#eef3f5,#c3ccd2)", color: "#0a1410" }}
          >
            {toast}
          </div>
        )}
      </div>

      <input
        ref={fileInput}
        type="file"
        accept="video/*,audio/*,.mp4,.mp3,.m4a,.wav,.webm,.mov"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) importFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
