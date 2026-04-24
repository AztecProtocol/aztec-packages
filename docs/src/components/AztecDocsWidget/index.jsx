import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Highlight, themes as prismThemes } from "prism-react-renderer";
import "./styles.css";

const REMARK_PLUGINS = [remarkGfm];

function CodeBlock({ code, language, isInk, codeBorder }) {
  const theme = isInk ? prismThemes.vsDark : prismThemes.github;
  return (
    <Highlight code={code} language={language || "text"} theme={theme}>
      {({ className, style, tokens, getLineProps, getTokenProps }) => (
        <pre
          className={className}
          style={{
            ...style,
            margin: "0 0 10px",
            padding: 10,
            borderRadius: 4,
            overflowX: "auto",
            fontSize: 12,
            lineHeight: 1.45,
            fontFamily: "var(--azw-font-mono)",
            border: `1px solid ${codeBorder}`,
          }}
        >
          {tokens.map((line, i) => {
            const { key: _lk, ...lineProps } = getLineProps({ line });
            return (
              <div key={i} {...lineProps}>
                {line.map((token, j) => {
                  const { key: _tk, ...tokenProps } = getTokenProps({ token });
                  return <span key={j} {...tokenProps} />;
                })}
              </div>
            );
          })}
        </pre>
      )}
    </Highlight>
  );
}

// DocsGPT sometimes returns GFM tables as a single line with no
// newlines between rows. Restore the structural newlines so remark-gfm
// can parse the table.
function repairInlineTables(md) {
  if (!md || !md.includes("|")) return md;
  let out = md;
  // Put the separator row (|---|---|---|) on its own line.
  out = out.replace(/ +(\|(?:\s*:?-+:?\s*\|)+) +/g, "\n$1\n");
  // Split " | |" boundary between rows whose first cell is empty.
  out = out.replace(/ \| \|/g, " |\n|");
  return out;
}

function AztecMark({ size = 24, color = "currentColor", stroke = 0 }) {
  const c = size / 2;
  const rings = [0.96, 0.7, 0.44, 0.2];
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true"
      style={{ display: "block" }}
    >
      {rings.map((r, i) => {
        const half = (size * r) / 2;
        const d = `M ${c} ${c - half} L ${c + half} ${c} L ${c} ${c + half} L ${c - half} ${c} Z`;
        return (
          <path
            key={i}
            d={d}
            fill={i % 2 === 0 ? color : "none"}
            stroke={i % 2 === 0 ? "none" : color}
            strokeWidth={stroke || Math.max(1, size * 0.04)}
          />
        );
      })}
    </svg>
  );
}

const Icons = {
  close: (p) => (
    <svg
      viewBox="0 0 24 24"
      width={p.size || 18}
      height={p.size || 18}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 6L6 18" />
      <path d="M6 6l12 12" />
    </svg>
  ),
  send: (p) => (
    <svg
      viewBox="0 0 24 24"
      width={p.size || 18}
      height={p.size || 18}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </svg>
  ),
  chat: (p) => (
    <svg
      viewBox="0 0 24 24"
      width={p.size || 22}
      height={p.size || 22}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12a8 8 0 0 1-11.5 7.2L3 20l1-4.8A8 8 0 1 1 21 12z" />
    </svg>
  ),
  refresh: (p) => (
    <svg
      viewBox="0 0 24 24"
      width={p.size || 14}
      height={p.size || 14}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  ),
  arrowUpRight: (p) => (
    <svg
      viewBox="0 0 24 24"
      width={p.size || 12}
      height={p.size || 12}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 17L17 7" />
      <path d="M8 7h9v9" />
    </svg>
  ),
  doc: (p) => (
    <svg
      viewBox="0 0 24 24"
      width={p.size || 12}
      height={p.size || 12}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  ),
  expand: (p) => (
    <svg
      viewBox="0 0 24 24"
      width={p.size || 14}
      height={p.size || 14}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 3h6v6" />
      <path d="M9 21H3v-6" />
      <path d="M21 3l-7 7" />
      <path d="M3 21l7-7" />
    </svg>
  ),
  collapse: (p) => (
    <svg
      viewBox="0 0 24 24"
      width={p.size || 14}
      height={p.size || 14}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 14h6v6" />
      <path d="M20 10h-6V4" />
      <path d="M14 10l7-7" />
      <path d="M3 21l7-7" />
    </svg>
  ),
};

const DEFAULT_SUGGESTED = [
  "What is Noir?",
  "How do nullifiers work?",
  "Deploying to testnet",
  "Private vs public state",
];

const ACCENT_VARS = {
  chartreuse: "var(--azw-chartreuse)",
  orchid: "var(--azw-orchid)",
  aqua: "var(--azw-aqua)",
};

function makeMarkdownComponents(isInk, accentColor) {
  const codeBg = isInk
    ? "rgba(212,255,40,0.12)"
    : "var(--azw-chartreuse-tint-2)";
  const codeFg = isInk ? "var(--azw-chartreuse)" : "var(--azw-ink)";
  const codeBorder = isInk ? "rgba(212,255,40,0.25)" : "var(--azw-ink-tint-1)";
  const linkColor = isInk ? accentColor : "var(--azw-ink)";
  const dividerColor = isInk
    ? "rgba(242,238,225,0.15)"
    : "var(--azw-ink-tint-1)";
  const quoteColor = isInk
    ? "var(--azw-ink-tint-1)"
    : "var(--azw-parchment-shade-1)";

  const inlineCode = {
    fontFamily: "var(--azw-font-mono)",
    fontSize: 12,
    background: codeBg,
    color: codeFg,
    padding: "1px 5px",
    border: `1px solid ${codeBorder}`,
  };

  return {
    p: ({ node, ...props }) => (
      <p style={{ margin: "0 0 10px", lineHeight: 1.5 }} {...props} />
    ),
    a: ({ node, ...props }) => (
      <a
        target="_blank"
        rel="noreferrer"
        style={{
          color: linkColor,
          textDecoration: "underline",
          textUnderlineOffset: 2,
        }}
        {...props}
      />
    ),
    ul: ({ node, ordered, ...props }) => (
      <ul style={{ margin: "0 0 10px", paddingLeft: 20 }} {...props} />
    ),
    ol: ({ node, ordered, ...props }) => (
      <ol style={{ margin: "0 0 10px", paddingLeft: 20 }} {...props} />
    ),
    li: ({ node, ordered, checked, ...props }) => (
      <li style={{ margin: "2px 0" }} {...props} />
    ),
    h1: ({ node, ...props }) => (
      <h1
        style={{
          fontSize: 16,
          fontWeight: 600,
          margin: "8px 0 6px",
          lineHeight: 1.25,
        }}
        {...props}
      />
    ),
    h2: ({ node, ...props }) => (
      <h2
        style={{
          fontSize: 15,
          fontWeight: 600,
          margin: "8px 0 6px",
          lineHeight: 1.25,
        }}
        {...props}
      />
    ),
    h3: ({ node, ...props }) => (
      <h3
        style={{
          fontSize: 14,
          fontWeight: 600,
          margin: "8px 0 4px",
          lineHeight: 1.25,
          fontFamily: "var(--azw-font-sans)",
          textTransform: "none",
        }}
        {...props}
      />
    ),
    h4: ({ node, ...props }) => (
      <h4
        style={{
          fontSize: 13.5,
          fontWeight: 600,
          margin: "6px 0 4px",
          lineHeight: 1.25,
        }}
        {...props}
      />
    ),
    blockquote: ({ node, ...props }) => (
      <blockquote
        style={{
          margin: "0 0 10px",
          padding: "2px 0 2px 10px",
          borderLeft: `2px solid ${accentColor}`,
          color: quoteColor,
        }}
        {...props}
      />
    ),
    hr: () => (
      <hr
        style={{
          border: 0,
          borderTop: `1px solid ${dividerColor}`,
          margin: "10px 0",
        }}
      />
    ),
    code: ({ node, inline, className, children, ...props }) => {
      if (inline) {
        return (
          <code style={inlineCode} {...props}>
            {children}
          </code>
        );
      }
      const match = /language-(\w+)/.exec(className || "");
      const code = String(children).replace(/\n$/, "");
      return (
        <CodeBlock
          code={code}
          language={match ? match[1] : undefined}
          isInk={isInk}
          codeBorder={codeBorder}
        />
      );
    },
    // Passthrough: <CodeBlock> renders its own <pre>, so we unwrap
    // react-markdown's default <pre> to avoid nesting.
    pre: ({ children }) => <>{children}</>,
    table: ({ node, ...props }) => (
      <div style={{ overflowX: "auto", margin: "0 0 10px" }}>
        <table
          style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}
          {...props}
        />
      </div>
    ),
    th: ({ node, ...props }) => (
      <th
        style={{
          textAlign: "left",
          borderBottom: `1px solid ${dividerColor}`,
          padding: "4px 8px",
        }}
        {...props}
      />
    ),
    td: ({ node, ...props }) => (
      <td
        style={{
          borderBottom: `1px solid ${dividerColor}`,
          padding: "4px 8px",
        }}
        {...props}
      />
    ),
  };
}

async function streamAnswer({
  apiHost,
  apiKey,
  question,
  history,
  conversationId,
  onToken,
  onSource,
  onConversationId,
  onDone,
  signal,
}) {
  const res = await fetch(`${apiHost.replace(/\/$/, "")}/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question,
      api_key: apiKey,
      history,
      conversation_id: conversationId || null,
      prompt_id: "default",
    }),
    signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`DocsGPT stream failed: ${res.status}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const payload = trimmed.startsWith("data:")
        ? trimmed.slice(5).trim()
        : trimmed;
      if (!payload || payload === "[DONE]") continue;
      let parsed;
      try {
        parsed = JSON.parse(payload);
      } catch {
        continue;
      }
      if (parsed.type === "answer" && typeof parsed.answer === "string") {
        onToken(parsed.answer);
      } else if (parsed.type === "source" && parsed.source) {
        const sources = Array.isArray(parsed.source)
          ? parsed.source
          : [parsed.source];
        onSource(sources);
      } else if (parsed.type === "id" && parsed.id) {
        onConversationId(parsed.id);
      } else if (parsed.type === "end") {
        onDone();
        return;
      }
    }
  }
  onDone();
}

export default function AztecDocsWidget({
  apiHost,
  apiKey,
  title = "Ask about Aztec",
  heroTitle = "Aztec Docs Assistant",
  heroDescription = "Ask me anything about building on the privacy network — Noir, rollups, nullifiers, testnet setup.",
  suggestedPrompts = DEFAULT_SUGGESTED,
  theme = "ink",
  accent = "chartreuse",
  buttonStyle = "symbol",
  size = "roomy",
  position = "br",
  motif = true,
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [streamSources, setStreamSources] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const scrollRef = useRef(null);
  const abortRef = useRef(null);

  const isInk = theme === "ink";
  const accentColor = ACCENT_VARS[accent] || ACCENT_VARS.chartreuse;
  const mdComponents = React.useMemo(
    () => makeMarkdownComponents(isInk, accentColor),
    [isInk, accentColor],
  );

  const panelBg = isInk ? "var(--azw-ink)" : "var(--azw-parchment)";
  const panelFg = isInk ? "var(--azw-parchment)" : "var(--azw-ink)";
  const panelFg2 = isInk
    ? "var(--azw-ink-tint-1)"
    : "var(--azw-parchment-shade-1)";
  const panelBorder = isInk ? "var(--azw-parchment)" : "var(--azw-ink)";
  const panelSurface = isInk
    ? "rgba(242,238,225,0.05)"
    : "var(--azw-parchment-tint-1)";
  const panelSurface2 = isInk
    ? "rgba(242,238,225,0.09)"
    : "var(--azw-parchment-tint-2)";
  const inputBg = isInk ? "rgba(242,238,225,0.07)" : "#fff";
  const softBorder = isInk ? "rgba(242,238,225,0.15)" : "var(--azw-ink-tint-1)";

  const panelWidth = size === "compact" ? 380 : 420;
  const panelHeight = size === "compact" ? 540 : 620;

  useEffect(() => {
    if (scrollRef.current)
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, streamText, streaming]);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function handleSend(text) {
    const question = (text ?? input).trim();
    if (!question || streaming) return;
    setInput("");
    const nextHistory = messages.map((m) => ({
      prompt: m.prompt,
      response: m.response,
    }));
    const nextMessages = [
      ...messages,
      { prompt: question, response: "", sources: [] },
    ];
    setMessages(nextMessages);
    setStreaming(true);
    setStreamText("");
    setStreamSources([]);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    let acc = "";
    let sources = [];
    try {
      await streamAnswer({
        apiHost,
        apiKey,
        question,
        history: nextHistory,
        conversationId,
        signal: controller.signal,
        onToken: (chunk) => {
          acc += chunk;
          setStreamText(acc);
        },
        onSource: (src) => {
          sources = sources.concat(src);
          setStreamSources(sources);
        },
        onConversationId: (id) => setConversationId(id),
        onDone: () => {},
      });
    } catch (err) {
      if (err.name !== "AbortError") {
        acc =
          acc || "Something went wrong fetching an answer. Please try again.";
      }
    }

    setMessages((prev) => {
      const copy = [...prev];
      copy[copy.length - 1] = { prompt: question, response: acc, sources };
      return copy;
    });
    setStreaming(false);
    setStreamText("");
    setStreamSources([]);
  }

  function handleReset() {
    abortRef.current?.abort();
    setMessages([]);
    setStreaming(false);
    setStreamText("");
    setStreamSources([]);
    setConversationId(null);
  }

  const side = position === "br" ? { right: 32 } : { left: 32 };
  const showHero = open && messages.length === 0 && !streaming;

  const renderButton = () => {
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
          onClick={() => setOpen(true)}
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
          onClick={() => setOpen(true)}
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
        onClick={() => setOpen(true)}
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
  };

  const renderHero = () => (
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
                  onClick={() => handleSend(p)}
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

  const renderUserBubble = (text) => (
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

  const renderAssistantBody = ({ text, sources, thinking }) => (
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

  const renderPanel = () => (
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
            style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}
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
              onClick={handleReset}
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
            onClick={() => setExpanded((v) => !v)}
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
            onClick={() => setOpen(false)}
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
          {showHero && renderHero()}
          {messages.length > 0 && (
            <div style={{ padding: "18px 18px 4px" }}>
              {messages.map((m, i) => {
                const isLast = i === messages.length - 1;
                const text = isLast && streaming ? streamText : m.response;
                const sources = isLast && streaming ? streamSources : m.sources;
                const isStreamingLast = isLast && streaming;
                return (
                  <React.Fragment key={i}>
                    {renderUserBubble(m.prompt)}
                    {(text || isStreamingLast) &&
                      renderAssistantBody({
                        text,
                        sources,
                        thinking: isStreamingLast,
                      })}
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
              handleSend();
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
              onChange={(e) => setInput(e.target.value)}
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
              fontFamily: "var(--azw-font-mono)",
              fontSize: 10,
              color: panelFg2,
              letterSpacing: "0.06em",
            }}
          >
            AI-generated · Verify important facts
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="azw">
      {!open && renderButton()}
      {open && renderPanel()}
    </div>
  );
}
