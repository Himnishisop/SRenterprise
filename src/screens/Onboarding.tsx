/* Splash + Login + Paywall — Dark Green & Silver */

import { LOGO_URL, C, silverGradient, greenGradient, glowColor } from "../lib/theme";

export function Logo({ size = 96, glow = true }: { size?: number; glow?: boolean }) {
  return (
    <div
      className="relative grid place-items-center overflow-hidden rounded-[28%] border"
      style={{
        width: size,
        height: size,
        borderColor: C.line,
        background: silverGradient,
        boxShadow: glow
          ? `0 14px 48px -12px ${glowColor(C.greenDeep, 0.85)}, inset 0 1px 0 rgba(255,255,255,0.6)`
          : "inset 0 1px 0 rgba(255,255,255,0.5)",
      }}
    >
      <img
        src={LOGO_URL}
        alt="AUD FX"
        className="h-full w-full object-cover"
        draggable={false}
      />
      {/* brushed silver sheen */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(115deg,rgba(255,255,255,0.45) 0%,rgba(255,255,255,0) 38%,rgba(255,255,255,0) 62%,rgba(255,255,255,0.18) 100%)",
        }}
      />
    </div>
  );
}

export function Splash({ onDone }: { onDone: () => void }) {
  return (
    <button
      onClick={onDone}
      className="relative flex h-full w-full flex-col items-center justify-center gap-7"
      style={{ background: C.bg }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(circle at 50% 38%, ${glowColor(C.greenDeep, 0.35)} 0%, transparent 62%)`,
        }}
      />
      <div className="relative animate-[pop_700ms_cubic-bezier(0.22,1,0.36,1)]">
        <Logo size={118} />
      </div>
      <div className="relative animate-[fade_700ms_250ms_both]">
        <h1
          className="text-[46px] font-bold leading-none tracking-[0.14em]"
          style={{
            color: C.silver,
            textShadow: `0 0 26px ${glowColor(C.greenDeep, 0.85)}, 0 1px 0 rgba(255,255,255,0.35)`,
          }}
        >
          AFX
        </h1>
      </div>
      <style>{`
        @keyframes pop{0%{transform:scale(.5);opacity:0}100%{transform:scale(1);opacity:1}}
        @keyframes fade{0%{opacity:0;transform:translateY(8px)}100%{opacity:1;transform:none}}
      `}</style>
    </button>
  );
}

export function Login({ onLogin }: { onLogin: () => void }) {
  return (
    <div
      className="relative flex h-full flex-col items-center justify-between px-7 py-16"
      style={{ background: C.bg }}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-72"
        style={{
          background: `radial-gradient(circle at 50% 0%, ${glowColor(C.greenDeep, 0.4)} 0%, transparent 70%)`,
        }}
      />
      <div className="relative flex flex-col items-center gap-6 pt-14">
        <Logo size={86} />
        <div className="text-center">
          <h1 className="text-[23px] font-semibold tracking-tight" style={{ color: C.silver }}>
            Welcome to AUD FX
          </h1>
          <p className="mx-auto mt-2 max-w-[16rem] text-sm leading-relaxed" style={{ color: C.silverDim }}>
            Record, shape and export studio-grade audio in seconds.
          </p>
        </div>
      </div>

      <div className="relative w-full space-y-3">
        <button
          onClick={onLogin}
          className="flex w-full items-center justify-center gap-3 rounded-2xl px-5 py-4 text-[15px] font-semibold transition active:scale-[0.98]"
          style={{ background: silverGradient, color: "#0a1410", boxShadow: `0 10px 30px -12px ${glowColor(C.greenDeep, 0.9)}` }}
        >
          <svg width="18" height="18" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.2 17.6 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-2.8-.4-4.1H24v8.4h12.5c-.3 2.1-1.6 5.2-4.7 7.3l7.6 5.9c4.5-4.2 6.7-10.3 6.7-17.5z" />
            <path fill="#FBBC05" d="M10.4 28.7A14.6 14.6 0 0 1 9.6 24c0-1.6.3-3.2.8-4.7l-7.8-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.8-6.1z" />
            <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2 1.4-4.8 2.4-8.3 2.4-6.4 0-11.7-3.7-13.6-9.8l-7.8 6.1C6.5 42.6 14.6 48 24 48z" />
          </svg>
          Continue with Google
        </button>
        <p className="text-center text-[10px] leading-relaxed" style={{ color: "#5c6b64" }}>
          By continuing you agree to our Terms & Privacy Policy
        </p>
      </div>
    </div>
  );
}

export function Paywall({ onUnlock, onClose }: { onUnlock: () => void; onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-50 flex items-end">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
      <div
        className="relative w-full rounded-t-[28px] border-t px-6 pb-9 pt-7"
        style={{ borderColor: C.line, background: "linear-gradient(180deg,#0e1b15 0%,#050b08 100%)" }}
      >
        <div className="mb-5 flex justify-center">
          <Logo size={64} />
        </div>
        <h2 className="text-center text-[22px] font-semibold leading-tight" style={{ color: C.silver }}>
          You've used your free export
        </h2>
        <p className="mx-auto mt-2 max-w-[17rem] text-center text-sm" style={{ color: C.silverDim }}>
          Unlock AUD FX Pro for unlimited exports and every effect.
        </p>

        <div
          className="mt-5 space-y-2 rounded-2xl border p-4"
          style={{ borderColor: C.line, background: "rgba(199,208,214,0.04)" }}
        >
          {[
            "Unlimited exports",
            "All delay & reverb spaces",
            "Full manual knob control",
            "Lossless WAV quality",
          ].map((f) => (
            <div key={f} className="flex items-center gap-3 text-[13px]" style={{ color: C.silver }}>
              <span
                className="grid h-4 w-4 place-items-center rounded-full text-[9px]"
                style={{ background: C.green, color: "#04120b" }}
              >
                ✓
              </span>
              {f}
            </div>
          ))}
        </div>

        <div className="mt-5 flex items-end justify-center gap-1">
          <span className="mb-1 text-sm" style={{ color: C.silverDim }}>₹</span>
          <span className="text-[40px] font-bold leading-none tracking-tight" style={{ color: C.silver }}>
            199
          </span>
          <span className="mb-1 text-sm" style={{ color: C.silverDim }}>one-time</span>
        </div>

        <button
          onClick={onUnlock}
          className="mt-5 w-full rounded-2xl py-4 text-[15px] font-semibold transition active:scale-[0.98]"
          style={{ background: greenGradient, color: "#f2f7f4", boxShadow: `0 12px 34px -14px ${glowColor(C.green, 0.9)}` }}
        >
          Unlock full access
        </button>
        <button onClick={onClose} className="mt-2 w-full py-3 text-center text-[13px]" style={{ color: C.silverDim }}>
          Maybe later
        </button>
      </div>
    </div>
  );
}
