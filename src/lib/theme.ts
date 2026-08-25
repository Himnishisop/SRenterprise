// ---- Voice Aura theme: Dark Green & Silver ----

export const LOGO_URL =
  "https://i.ibb.co/JWgLc6LL/Whats-App-Image-2026-08-16-at-1-04-01-AM.jpg";

export const C = {
  /** near-black green page background */
  bg: "#050b08",
  /** raised surface */
  surface: "#0b1410",
  /** hairline border */
  line: "rgba(200, 214, 206, 0.12)",
  /** primary silver accent */
  silver: "#c7d0d6",
  silverDim: "#8d979d",
  /** deep green accent */
  green: "#1f9d63",
  greenDeep: "#0d5c3a",
  /** signal / record */
  rec: "#e0324a",
  /** fx colours */
  delay: "#9fb3a8",
  reverb: "#4ade80",
  volume: "#cbd5dc",
};

/** metallic silver fill for primary buttons */
export const silverGradient =
  "linear-gradient(180deg,#eef3f5 0%,#c3ccd2 45%,#9aa5ac 100%)";

/** deep green fill */
export const greenGradient =
  "linear-gradient(180deg,#1fa86a 0%,#0d6b45 100%)";

export const glowColor = (hex: string, alpha = 0.45) => {
  const a = hex.replace("#", "");
  const r = parseInt(a.slice(0, 2), 16);
  const g = parseInt(a.slice(2, 4), 16);
  const b = parseInt(a.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};
