export const DEFAULT_SUGGESTED = [
  "What is Noir?",
  "How do nullifiers work?",
  "Deploying to testnet",
  "Private vs public state",
];

export const ACCENT_VARS = {
  chartreuse: "var(--azw-chartreuse)",
  orchid: "var(--azw-orchid)",
  aqua: "var(--azw-aqua)",
};

export function getTheme(theme, accent) {
  const isInk = theme === "ink";
  const accentColor = ACCENT_VARS[accent] || ACCENT_VARS.chartreuse;
  return {
    isInk,
    accentColor,
    panelBg: isInk ? "var(--azw-ink)" : "var(--azw-parchment)",
    panelFg: isInk ? "var(--azw-parchment)" : "var(--azw-ink)",
    panelFg2: isInk ? "var(--azw-ink-tint-1)" : "var(--azw-parchment-shade-1)",
    panelBorder: isInk ? "var(--azw-parchment)" : "var(--azw-ink)",
    panelSurface: isInk
      ? "rgba(242,238,225,0.05)"
      : "var(--azw-parchment-tint-1)",
    panelSurface2: isInk
      ? "rgba(242,238,225,0.09)"
      : "var(--azw-parchment-tint-2)",
    inputBg: isInk ? "rgba(242,238,225,0.07)" : "#fff",
    softBorder: isInk ? "rgba(242,238,225,0.15)" : "var(--azw-ink-tint-1)",
  };
}
