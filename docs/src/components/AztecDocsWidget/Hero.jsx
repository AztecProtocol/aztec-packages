import React from "react";
import { AztecMark, Icons } from "./Icons";

export default function Hero({
  heroTitle,
  heroDescription,
  suggestedPrompts,
  motif,
  tokens,
  onSuggest,
}) {
  const { isInk, accentColor, panelFg, panelFg2, panelSurface, panelSurface2 } =
    tokens;
  return (
    <div
      style={{
        padding: "28px 24px 20px",
        textAlign: "left",
        position: "relative",
      }}
    >
      {motif && (
        <div
          style={{
            position: "absolute",
            right: -10,
            top: -30,
            opacity: isInk ? 0.12 : 0.18,
            pointerEvents: "none",
          }}
        >
          <AztecMark size={180} color={accentColor} />
        </div>
      )}
      <div style={{ position: "relative" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "4px 10px",
            border: `1px solid ${panelFg2}`,
            color: panelFg2,
            fontFamily: "var(--azw-font-mono)",
            fontSize: 11,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            marginBottom: 18,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: 999,
              background: accentColor,
              boxShadow: `0 0 8px ${accentColor}`,
            }}
          />
          Aztec Docs · AI
        </div>
        <h2
          style={{
            fontFamily: "var(--azw-font-display)",
            fontWeight: 300,
            fontSize: 32,
            lineHeight: 1.0,
            letterSpacing: "-0.03em",
            color: panelFg,
            margin: "0 0 10px",
          }}
        >
          {heroTitle}
        </h2>
        <p
          style={{
            fontFamily: "var(--azw-font-sans)",
            fontWeight: 400,
            fontSize: 14,
            lineHeight: 1.4,
            color: panelFg2,
            margin: "0 0 22px",
            maxWidth: "92%",
            letterSpacing: "-0.01em",
          }}
        >
          {heroDescription}
        </p>

        {suggestedPrompts?.length > 0 && (
          <>
            <div
              style={{
                fontFamily: "var(--azw-font-mono)",
                fontSize: 10,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: panelFg2,
                marginBottom: 10,
              }}
            >
              Try asking —
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {suggestedPrompts.map((p) => (
                <button
                  key={p}
                  onClick={() => onSuggest(p)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    textAlign: "left",
                    padding: "10px 12px",
                    background: panelSurface,
                    color: panelFg,
                    border: `1px solid ${isInk ? "rgba(242,238,225,0.12)" : "var(--azw-ink-tint-1)"}`,
                    fontFamily: "var(--azw-font-sans)",
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: "pointer",
                    borderRadius: 0,
                    transition:
                      "background 120ms var(--azw-ease), border-color 120ms var(--azw-ease)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = panelSurface2;
                    e.currentTarget.style.borderColor = accentColor;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = panelSurface;
                    e.currentTarget.style.borderColor = isInk
                      ? "rgba(242,238,225,0.12)"
                      : "var(--azw-ink-tint-1)";
                  }}
                >
                  <span>{p}</span>
                  <Icons.arrowUpRight size={12} />
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
