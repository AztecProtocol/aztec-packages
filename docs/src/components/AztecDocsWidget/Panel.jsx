import React from "react";
import { AztecMark, Icons } from "./Icons";
import Hero from "./Hero";
import { UserBubble, AssistantBody } from "./Message";

export default function Panel({
  title,
  heroTitle,
  heroDescription,
  suggestedPrompts,
  motif,
  position,
  size,
  tokens,
  mdComponents,
  messages,
  streaming,
  streamText,
  streamSources,
  input,
  onInputChange,
  onSend,
  onSuggest,
  onReset,
  onClose,
  expanded,
  onToggleExpanded,
  scrollRef,
}) {
  const {
    isInk,
    accentColor,
    panelBg,
    panelFg,
    panelFg2,
    panelBorder,
    inputBg,
    softBorder,
  } = tokens;

  const side = position === "br" ? { right: 32 } : { left: 32 };
  const panelWidth = size === "compact" ? 380 : 420;
  const panelHeight = size === "compact" ? 540 : 620;
  const showHero = messages.length === 0 && !streaming;

  return (
    <div
      style={{
        position: "fixed",
        ...(expanded
          ? { right: 32, left: 32, top: 32, bottom: 32 }
          : { ...side, bottom: 32 }),
        width: expanded ? "auto" : panelWidth,
        height: expanded ? "auto" : panelHeight,
        maxWidth: expanded ? undefined : "calc(100vw - 64px)",
        maxHeight: expanded ? undefined : "calc(100vh - 64px)",
        background: panelBg,
        border: `1.5px solid ${panelBorder}`,
        boxShadow: isInk
          ? `4px 4px 0 ${accentColor}`
          : "4px 4px 0 var(--azw-ink)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        zIndex: 2147483000,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "14px 16px",
          borderBottom: `1px solid ${softBorder}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: isInk ? "rgba(0,0,0,0.2)" : "var(--azw-parchment-tint-2)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 28,
              height: 28,
              background: "var(--azw-ink)",
              border: `1px solid ${isInk ? "var(--azw-parchment)" : "var(--azw-ink)"}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <AztecMark size={15} color="var(--azw-chartreuse)" />
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              lineHeight: 1,
            }}
          >
            <div
              style={{
                fontFamily: "var(--azw-font-mono)",
                fontSize: 13,
                fontWeight: 500,
                color: panelFg,
                letterSpacing: "-0.01em",
              }}
            >
              {title}
            </div>
            <div
              style={{
                fontFamily: "var(--azw-font-mono)",
                fontSize: 10,
                color: panelFg2,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                marginTop: 4,
                display: "flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <span
                style={{
                  width: 5,
                  height: 5,
                  background: accentColor,
                  boxShadow: `0 0 6px ${accentColor}`,
                }}
              />
              Online
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {messages.length > 0 && (
            <button
              onClick={onReset}
              title="New chat"
              style={{
                width: 28,
                height: 28,
                border: "none",
                background: "transparent",
                color: panelFg2,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icons.refresh size={14} />
            </button>
          )}
          <button
            onClick={onToggleExpanded}
            title={expanded ? "Collapse" : "Expand"}
            aria-label={expanded ? "Collapse widget" : "Expand widget"}
            style={{
              width: 28,
              height: 28,
              border: "none",
              background: "transparent",
              color: panelFg2,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {expanded ? (
              <Icons.collapse size={14} />
            ) : (
              <Icons.expand size={14} />
            )}
          </button>
          <button
            onClick={onClose}
            title="Close"
            style={{
              width: 28,
              height: 28,
              border: "none",
              background: "transparent",
              color: panelFg,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icons.close size={16} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          background: panelBg,
          color: panelFg,
        }}
      >
        <div style={{ maxWidth: expanded ? 760 : "100%", margin: "0 auto" }}>
          {showHero && (
            <Hero
              heroTitle={heroTitle}
              heroDescription={heroDescription}
              suggestedPrompts={suggestedPrompts}
              motif={motif}
              tokens={tokens}
              onSuggest={onSuggest}
            />
          )}
          {messages.length > 0 && (
            <div style={{ padding: "18px 18px 4px" }}>
              {messages.map((m, i) => {
                const isLast = i === messages.length - 1;
                const text = isLast && streaming ? streamText : m.response;
                const sources = isLast && streaming ? streamSources : m.sources;
                const isStreamingLast = isLast && streaming;
                return (
                  <React.Fragment key={i}>
                    <UserBubble text={m.prompt} tokens={tokens} />
                    {(text || isStreamingLast) && (
                      <AssistantBody
                        text={text}
                        sources={sources}
                        thinking={isStreamingLast}
                        tokens={tokens}
                        mdComponents={mdComponents}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Composer */}
      <div
        style={{
          padding: 12,
          borderTop: `1px solid ${softBorder}`,
          background: isInk
            ? "rgba(0,0,0,0.15)"
            : "var(--azw-parchment-tint-2)",
        }}
      >
        <div style={{ maxWidth: expanded ? 760 : "100%", margin: "0 auto" }}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSend();
            }}
            style={{
              display: "flex",
              alignItems: "stretch",
              gap: 0,
              background: inputBg,
              border: `1px solid ${isInk ? "rgba(242,238,225,0.25)" : "var(--azw-ink-tint-1)"}`,
            }}
          >
            <input
              value={input}
              onChange={(e) => onInputChange(e.target.value)}
              placeholder="Ask about Aztec —"
              disabled={streaming}
              style={{
                flex: 1,
                padding: "11px 12px",
                background: "transparent",
                border: "none",
                outline: "none",
                color: panelFg,
                fontFamily: "var(--azw-font-sans)",
                fontSize: 13.5,
                letterSpacing: "-0.01em",
              }}
            />
            <button
              type="submit"
              disabled={!input.trim() || streaming}
              style={{
                padding: "0 14px",
                background:
                  input.trim() && !streaming ? accentColor : "transparent",
                color: input.trim() && !streaming ? "var(--azw-ink)" : panelFg2,
                border: "none",
                borderLeft: `1px solid ${isInk ? "rgba(242,238,225,0.25)" : "var(--azw-ink-tint-1)"}`,
                cursor: input.trim() && !streaming ? "pointer" : "default",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "background 120ms var(--azw-ease)",
              }}
            >
              <Icons.send size={16} />
            </button>
          </form>
          <div
            style={{
              marginTop: 8,
              display: "flex",
              flexDirection: "column",
              gap: 2,
              fontFamily: "var(--azw-font-mono)",
              fontSize: 10,
              color: panelFg2,
              letterSpacing: "0.06em",
            }}
          >
            <span>
              AI-generated. Informational only. Not investment, tax, or legal
              advice.
              <a
                href="https://aztec.network/privacy-policy"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "inherit", textDecoration: "underline" }}
              >
                Privacy
              </a>
              {" · "}
              <a
                href="https://aztec.network/terms-of-service"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "inherit", textDecoration: "underline" }}
              >
                Terms
              </a>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
