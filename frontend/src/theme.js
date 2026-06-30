// Shared tactical palette + type, used across the game and lobby/login screens.

export const T = {
  bg: "#040a06",
  green: "#39ff14",
  greenSoft: "#7dffa0",
  greenDim: "rgba(125,255,160,0.55)",
  greenFaint: "rgba(57,255,20,0.16)",
  amber: "#ffb000",
  red: "#ff5a5a",
  glow: "0 0 6px rgba(57,255,20,0.5)",
};

export const FONT = '"Share Tech Mono", ui-monospace, monospace';
export const DISPLAY = '"Orbitron", sans-serif';

export const titleStyle = {
  fontFamily: DISPLAY,
  fontWeight: 800,
  letterSpacing: 6,
  color: T.green,
  textShadow: "0 0 10px rgba(57,255,20,0.6)",
};

export const btnStyle = {
  cursor: "pointer",
  background: "transparent",
  color: T.green,
  border: `1px solid ${T.greenDim}`,
  padding: "8px 14px",
  fontFamily: FONT,
  fontSize: 14,
  letterSpacing: 1,
  textShadow: T.glow,
};

export const solidBtnStyle = {
  ...btnStyle,
  color: T.bg,
  background: T.green,
  border: `1px solid ${T.green}`,
  textShadow: "none",
  boxShadow: "0 0 12px rgba(57,255,20,0.5)",
};

export const inputStyle = {
  background: "rgba(57,255,20,0.05)",
  color: T.greenSoft,
  border: `1px solid ${T.greenDim}`,
  padding: "9px 12px",
  fontFamily: FONT,
  fontSize: 14,
  outline: "none",
  letterSpacing: 1,
};
