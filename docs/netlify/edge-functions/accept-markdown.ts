// Serves the pre-generated .md sibling when a client sends `Accept: text/markdown`.
// Generator: docs/scripts/generate_markdown_variants.js (writes build/developers/*.md and
// build/operate/*.md). Behaviour follows https://acceptmarkdown.com/ recommendations +
// RFC 9110 content negotiation.
//
// Rules:
//   - No Accept header, or Accept missing text/markdown: pass through (serve HTML).
//   - Accept includes text/markdown with the highest q-value among supported types
//     (text/html, text/markdown): rewrite internally to the .md sibling and return it
//     with Content-Type: text/markdown + Vary: Accept.
//   - Accept explicitly lists only unsupported media types (e.g. image/png, q=1 for
//     image/* alone): return 406.
//   - Requests that already target *.md: pass through unmodified.

import type { Config, Context } from "@netlify/edge-functions";

type MediaRange = { type: string; subtype: string; q: number };

function parseAccept(header: string | null): MediaRange[] {
  if (!header) return [];
  return header
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [mediaType, ...params] = part.split(";").map((p) => p.trim());
      const [type = "*", subtype = "*"] = mediaType.split("/");
      let q = 1;
      for (const param of params) {
        const [k, v] = param.split("=").map((s) => s.trim());
        if (k === "q") {
          const parsed = parseFloat(v ?? "1");
          if (!Number.isNaN(parsed)) q = parsed;
        }
      }
      return { type: type.toLowerCase(), subtype: subtype.toLowerCase(), q };
    });
}

function qFor(ranges: MediaRange[], type: string, subtype: string): number {
  // Find the most specific matching range's q-value. Most-specific first per RFC 9110:
  //   exact > type/* > */*
  const exact = ranges.find((r) => r.type === type && r.subtype === subtype);
  if (exact) return exact.q;
  const typeWild = ranges.find((r) => r.type === type && r.subtype === "*");
  if (typeWild) return typeWild.q;
  const anyWild = ranges.find((r) => r.type === "*" && r.subtype === "*");
  if (anyWild) return anyWild.q;
  return 0;
}

function mdSiblingUrl(requestUrl: URL): URL {
  const url = new URL(requestUrl.toString());
  // Strip trailing slash before appending .md so /developers/foo/ -> /developers/foo.md.
  url.pathname = url.pathname.replace(/\/$/, "") + ".md";
  return url;
}

export default async function handler(req: Request, ctx: Context): Promise<Response> {
  const url = new URL(req.url);
  if (url.pathname.endsWith(".md")) return ctx.next();

  const ranges = parseAccept(req.headers.get("accept"));
  if (ranges.length === 0) return ctx.next();

  const qMarkdown = qFor(ranges, "text", "markdown");
  const qHtml = qFor(ranges, "text", "html");

  // Client doesn't want markdown at all: pass through.
  if (qMarkdown <= 0) {
    // If the client ONLY accepts types we can't serve (no html, no markdown, no */*),
    // honour RFC 9110 and return 406.
    if (qHtml <= 0 && qFor(ranges, "*", "*") <= 0) {
      return new Response("Not Acceptable", { status: 406 });
    }
    return ctx.next();
  }

  // Serve markdown when it is at least as preferred as HTML. A client that explicitly
  // lists `text/markdown` is signalling it can consume markdown, so ties go to markdown
  // rather than HTML.
  if (qMarkdown < qHtml) return ctx.next();

  const mdUrl = mdSiblingUrl(url);
  const mdResponse = await fetch(mdUrl, { headers: { accept: "text/markdown" } });
  if (!mdResponse.ok) return ctx.next();

  const body = await mdResponse.text();
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      Vary: "Accept",
      "X-Robots-Tag": "noindex",
      "Cache-Control": mdResponse.headers.get("cache-control") ?? "public, max-age=60",
    },
  });
}

export const config: Config = {
  path: ["/developers/*", "/operate/*"],
};
