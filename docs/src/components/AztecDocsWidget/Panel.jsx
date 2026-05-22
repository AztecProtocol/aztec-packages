import React, { useEffect, useRef } from "react";
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
  feedbackByIndex,
  feedbackErrorsByIndex,
  onFeedback,
  conversationId,
  onShare,
  shareState,
  viewingShared,
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
  const canShare =
    !streaming && messages.some((m) => m.response && m.response.length > 0);
  const shareLabel =
    shareState === "ok"
      ? "Link copied"
      : shareState === "fail"
        ? "Share failed"
        : "Share";

  const taRef = useRef(null);
  // Auto-grow the textarea to fit its content. The inline `max-height`
  // caps it at 10 lines; past that the textarea scrolls instead.
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = ta.scrollHeight + "px";
  }, [input]);

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
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          {canShare && (
            <button
              onClick={onShare}
              title="Copy a shareable link to this conversation"
              aria-label="Copy share link"
              className={
                "azw-share-btn" +
                (shareState === "ok"
                  ? " is-ok"
                  : shareState === "fail"
                    ? " is-fail"
                    : "")
              }
              style={{
                height: 24,
                padding: "0 10px",
                border: `1px solid ${isInk ? "rgba(242,238,225,0.35)" : "var(--azw-ink-tint-1)"}`,
                background: "transparent",
                color: panelFg2,
                cursor: "pointer",
                fontFamily: "var(--azw-font-mono)",
                fontSize: 10,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              {shareLabel}
            </button>
          )}
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

      {viewingShared && (
        <div
          role="status"
          style={{
            padding: "8px 16px",
            borderBottom: `1px solid ${softBorder}`,
            background: "var(--azw-chartreuse-tint-2)",
            color: "var(--azw-ink)",
            fontFamily: "var(--azw-font-mono)",
            fontSize: 10,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span>Viewing a shared conversation.</span>
          <button
            type="button"
            onClick={onReset}
            style={{
              font: "inherit",
              letterSpacing: "inherit",
              textTransform: "inherit",
              color: "var(--azw-ink)",
              background: "transparent",
              border: 0,
              padding: 0,
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            Start a new one
          </button>
        </div>
      )}

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
                const error = isStreamingLast ? null : m.error;
                const showFeedback =
                  !isStreamingLast && !!m.response && !!conversationId;
                return (
                  <React.Fragment key={i}>
                    <UserBubble text={m.prompt} tokens={tokens} />
                    {(text || isStreamingLast || error) && (
                      <AssistantBody
                        text={text}
                        sources={sources}
                        thinking={isStreamingLast}
                        error={error}
                        tokens={tokens}
                        mdComponents={mdComponents}
                        showFeedback={showFeedback}
                        feedback={feedbackByIndex?.[i]}
                        feedbackError={feedbackErrorsByIndex?.[i]}
                        onFeedback={
                          showFeedback
                            ? (kind) => onFeedback?.(i, kind)
                            : undefined
                        }
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
            <textarea
              ref={taRef}
              value={input}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSend();
                }
              }}
              placeholder="Ask about Aztec —"
              disabled={streaming}
              rows={1}
              style={{
                flex: 1,
                minWidth: 0,
                padding: "11px 12px",
                background: "transparent",
                border: "none",
                outline: "none",
                resize: "none",
                color: panelFg,
                fontFamily: "var(--azw-font-sans)",
                fontSize: 13.5,
                lineHeight: 1.5,
                letterSpacing: "-0.01em",
                boxSizing: "border-box",
                maxHeight: "calc(10 * 1.5em + 22px)",
                overflowY: "auto",
                overflowWrap: "anywhere",
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
