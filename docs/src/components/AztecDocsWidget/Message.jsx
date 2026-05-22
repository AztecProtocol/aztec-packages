import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import { AztecMark, Icons } from "./Icons";
import { REMARK_PLUGINS, repairInlineTables } from "./markdown";
import { copyToClipboard } from "./share";

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
  error,
  tokens,
  mdComponents,
  feedback,
  feedbackError,
  onFeedback,
  showFeedback,
}) {
  const { isInk, accentColor, panelFg, panelFg2 } = tokens;
  const canCopy = !thinking && typeof text === "string" && text.length > 0;
  const feedbackBtn = (kind) => {
    const Icon = kind === "like" ? Icons.thumbUp : Icons.thumbDown;
    const active = feedback === kind;
    const dimmed = feedback && !active;
    const label = kind === "like" ? "Helpful" : "Not helpful";
    return (
      <button
        type="button"
        onClick={() => onFeedback?.(kind)}
        disabled={!onFeedback || !!feedback}
        title={label}
        aria-label={label}
        aria-pressed={active}
        style={{
          width: 26,
          height: 26,
          padding: 0,
          border: `1px solid ${isInk ? "rgba(242,238,225,0.2)" : "var(--azw-ink-tint-1)"}`,
          background: active ? accentColor : "transparent",
          color: active ? "var(--azw-ink)" : dimmed ? panelFg2 : panelFg,
          cursor: onFeedback && !feedback ? "pointer" : "default",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: dimmed ? 0.5 : 1,
        }}
      >
        <Icon size={12} filled={active} />
      </button>
    );
  };
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
          {canCopy && (
            <span style={{ marginLeft: "auto" }}>
              <CopyMarkdownButton text={text} isInk={isInk} fg2={panelFg2} />
            </span>
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
        {error && (
          <div
            role="alert"
            style={{
              marginTop: text ? 10 : 0,
              padding: "8px 10px",
              border: `1px solid var(--azw-vermillion, ${accentColor})`,
              background: isInk
                ? "rgba(217, 74, 58, 0.12)"
                : "rgba(217, 74, 58, 0.08)",
              color: "var(--azw-vermillion, #d94a3a)",
              fontFamily: "var(--azw-font-sans)",
              fontSize: 12.5,
              lineHeight: 1.45,
              letterSpacing: "-0.01em",
            }}
          >
            {error}
          </div>
        )}
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
        {showFeedback && (
          <div
            style={{
              marginTop: 10,
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontFamily: "var(--azw-font-mono)",
              fontSize: 10,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: panelFg2,
            }}
          >
            <span>Was this helpful?</span>
            <div style={{ display: "flex", gap: 6 }}>
              {feedbackBtn("like")}
              {feedbackBtn("dislike")}
            </div>
            {feedback && !feedbackError && (
              <span style={{ color: panelFg2 }}>Thanks for the feedback.</span>
            )}
            {feedbackError && (
              <span
                style={{ color: "var(--azw-vermillion, #d94a3a)" }}
                role="alert"
              >
                Couldn't save feedback.
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Copies the raw markdown text of the bot reply so backticks, headers,
// and lists survive a paste. Falls back to a hidden textarea +
// document.execCommand for browsers without the async Clipboard API.
function CopyMarkdownButton({ text, isInk, fg2 }) {
  const [state, setState] = useState("idle");
  const onClick = async () => {
    const ok = await copyToClipboard(text);
    setState(ok ? "ok" : "fail");
    window.setTimeout(() => setState("idle"), 1800);
  };
  const label =
    state === "ok" ? "Copied" : state === "fail" ? "Copy failed" : "Copy";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Copy raw markdown of the response"
      title="Copy raw markdown (preserves formatting)"
      style={{
        font: "inherit",
        letterSpacing: "inherit",
        textTransform: "inherit",
        padding: "1px 7px",
        background:
          state === "ok" ? "var(--azw-chartreuse-tint-2)" : "transparent",
        color: state === "ok" ? "var(--azw-ink)" : fg2,
        border: `1px solid ${isInk ? "rgba(242,238,225,0.25)" : "var(--azw-ink-tint-1)"}`,
        cursor: "pointer",
        lineHeight: 1.4,
      }}
    >
      {label}
    </button>
  );
}
