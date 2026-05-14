import React from "react";
import { Icons } from "./Icons";

export default function LauncherButton({ buttonStyle, position, onOpen }) {
  const side = position === "br" ? { right: 32 } : { left: 32 };
  const base = {
    position: "fixed",
    ...side,
    bottom: 32,
    cursor: "pointer",
    border: "none",
    zIndex: 2147483000,
    transition:
      "transform 200ms var(--azw-ease), box-shadow 200ms var(--azw-ease)",
  };

  if (buttonStyle === "label") {
    return (
      <button
        onClick={onOpen}
        aria-label="Open Aztec AI docs assistant"
        style={{
          ...base,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 18px 12px 14px",
          background: "var(--azw-ink)",
          color: "var(--azw-chartreuse)",
          border: "1.5px solid var(--azw-ink)",
          boxShadow: "4px 4px 0 var(--azw-chartreuse)",
          borderRadius: 0,
          fontFamily: "var(--azw-font-mono)",
          fontSize: 13,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        <img
          src="/img/Aztec Symbol_Light.png"
          alt=""
          width={18}
          height={18}
          style={{ display: "block" }}
        />
        Ask Aztec
      </button>
    );
  }

  if (buttonStyle === "chat") {
    return (
      <button
        onClick={onOpen}
        aria-label="Open Aztec AI docs assistant"
        style={{
          ...base,
          width: 56,
          height: 56,
          borderRadius: 999,
          background: "var(--azw-chartreuse)",
          color: "var(--azw-ink)",
          border: "1.5px solid var(--azw-ink)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "4px 4px 0 var(--azw-ink)",
        }}
      >
        <Icons.chat size={24} />
      </button>
    );
  }

  return (
    <button
      onClick={onOpen}
      aria-label="Open Aztec AI docs assistant"
      style={{
        ...base,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "11px 16px 11px 12px",
        background: "var(--azw-ink)",
        color: "var(--azw-parchment)",
        border: "1.5px solid var(--azw-ink)",
        boxShadow: "4px 4px 0 var(--azw-chartreuse)",
        borderRadius: 0,
      }}
    >
      <span
        style={{
          position: "relative",
          width: 30,
          height: 30,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--azw-chartreuse)",
        }}
      >
        <img
          src="/img/Aztec_Symbol_Dark.png"
          alt=""
          width={18}
          height={18}
          style={{ display: "block" }}
        />
        <span
          style={{
            position: "absolute",
            right: -6,
            bottom: -6,
            width: 16,
            height: 16,
            background: "var(--azw-ink)",
            color: "var(--azw-chartreuse)",
            border: "1.5px solid var(--azw-chartreuse)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 999,
          }}
        >
          <Icons.chat size={9} />
        </span>
      </span>
      <span
        style={{
          display: "flex",
          flexDirection: "column",
          textAlign: "left",
          lineHeight: 1,
        }}
      >
        <span
          style={{
            fontFamily: "var(--azw-font-mono)",
            fontSize: 10,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--azw-chartreuse)",
            marginBottom: 3,
          }}
        >
          Ask AI
        </span>
        <span
          style={{
            fontFamily: "var(--azw-font-sans)",
            fontSize: 13,
            fontWeight: 500,
            letterSpacing: "-0.01em",
            color: "var(--azw-parchment)",
          }}
        >
          Aztec Assistant
        </span>
      </span>
    </button>
  );
}
