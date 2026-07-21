import React from "react";
import remarkGfm from "remark-gfm";
import { Highlight, themes as prismThemes } from "prism-react-renderer";

export const REMARK_PLUGINS = [remarkGfm];

const LANGUAGE_ALIASES = {
  noir: "rust",
  nr: "rust",
};

function CodeBlock({ code, language, isInk, codeBorder }) {
  const theme = isInk ? prismThemes.vsDark : prismThemes.github;
  const resolved = LANGUAGE_ALIASES[language] || language || "text";
  return (
    <Highlight code={code} language={resolved} theme={theme}>
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
export function repairInlineTables(md) {
  if (!md || !md.includes("|")) return md;
  let out = md;
  // Put the separator row (|---|---|---|) on its own line.
  out = out.replace(/ +(\|(?:\s*:?-+:?\s*\|)+) +/g, "\n$1\n");
  // Split " | |" boundary between rows whose first cell is empty.
  out = out.replace(/ \| \|/g, " |\n|");
  return out;
}

export function makeMarkdownComponents(isInk, accentColor) {
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
