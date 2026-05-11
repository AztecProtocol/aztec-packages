import React from "react";
import ReactMarkdown from "react-markdown";
import { AztecMark, Icons } from "./Icons";
import { REMARK_PLUGINS, repairInlineTables } from "./markdown";

export function UserBubble({ text, tokens }) {
  const { accentColor } = tokens;
  return (
    <div
      style={{ display: "flex", justifyContent: "flex-end", marginBottom: 18 }}
    >
      <div
        style={{
          maxWidth: "82%",
          padding: "9px 13px",
          background: accentColor,
          color: "var(--azw-ink)",
          fontFamily: "var(--azw-font-sans)",
          fontSize: 13.5,
          lineHeight: 1.45,
          letterSpacing: "-0.01em",
          fontWeight: 500,
          border: "1.5px solid var(--azw-ink)",
        }}
      >
        {text}
      </div>
    </div>
  );
}

export function AssistantBody({
  text,
  sources,
  thinking,
  tokens,
  mdComponents,
}) {
  const { isInk, accentColor, panelFg, panelFg2 } = tokens;
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        marginBottom: 18,
        alignItems: "flex-start",
      }}
    >
      <div
        style={{
          width: 26,
          height: 26,
          flexShrink: 0,
          background: "var(--azw-ink)",
          border: `1px solid ${isInk ? "var(--azw-parchment)" : "var(--azw-ink)"}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginTop: 2,
        }}
      >
        <AztecMark size={14} color="var(--azw-chartreuse)" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: "var(--azw-font-mono)",
            fontSize: 10,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: thinking ? accentColor : panelFg2,
            marginBottom: 6,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {thinking ? (
            <>
              Thinking
              <span className="azw-dots">
                <span>·</span>
                <span>·</span>
                <span>·</span>
              </span>
            </>
          ) : (
            "Aztec Assistant"
          )}
        </div>
        <div
          style={{
            fontFamily: "var(--azw-font-sans)",
            fontWeight: 400,
            fontSize: 13.5,
            lineHeight: 1.5,
            color: panelFg,
            letterSpacing: "-0.01em",
          }}
        >
          {text ? (
            <ReactMarkdown
              components={mdComponents}
              remarkPlugins={REMARK_PLUGINS}
            >
              {repairInlineTables(text)}
            </ReactMarkdown>
          ) : null}
        </div>
        {sources?.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div
              style={{
                fontFamily: "var(--azw-font-mono)",
                fontSize: 10,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: panelFg2,
                marginBottom: 6,
              }}
            >
              Sources
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {sources.map((s, k) => {
                const href = s.source || s.url || s.link || "#";
                const label =
                  s.title || s.filename || s.source || s.url || "Source";
                return (
                  <a
                    key={k}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "4px 8px",
                      fontFamily: "var(--azw-font-mono)",
                      fontSize: 11,
                      color: panelFg,
                      textDecoration: "none",
                      border: `1px solid ${isInk ? "rgba(242,238,225,0.2)" : "var(--azw-ink-tint-1)"}`,
                      background: "transparent",
                    }}
                  >
                    <Icons.doc size={11} />
                    {label}
                  </a>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
