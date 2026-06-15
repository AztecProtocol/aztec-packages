// Content negotiation for agents: when a request prefers markdown
// (`Accept: text/markdown`), serve the pre-built .md sibling of the page that
// the SignalWire llms-txt plugin emits at build time, instead of the HTML.
//
// Browsers send `Accept: text/html,...` and never `text/markdown`, so they fall
// through to the normal HTML response untouched. Requests for assets (anything
// with a file extension, including the .md files themselves) also fall through,
// which both serves them directly and prevents this function from recursing on
// the .md fetch below.

function prefersMarkdown(accept) {
  return accept.toLowerCase().includes("text/markdown");
}

function toMarkdownPath(pathname) {
  let p = pathname;
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  if (p === "" || p === "/") return "/index.md";
  return `${p}.md`;
}

export default async (request, context) => {
  const accept = request.headers.get("accept") || "";
  if (!prefersMarkdown(accept)) return;

  const url = new URL(request.url);

  // Already a concrete file (asset, sitemap, llms.txt, or a .md page): let the
  // CDN serve it directly. This is also the recursion guard for the .md fetch
  // below. Match only known static-file extensions, not any trailing dot, so
  // doc routes whose last segment contains a dot (e.g. a changelog page like
  // ".../changelog/v2.0.2") still negotiate to their .md sibling.
  if (
    /\.(md|html?|xml|txt|json|js|mjs|cjs|map|css|png|jpe?g|gif|svg|webp|avif|ico|bmp|woff2?|ttf|otf|eot|pdf|zip|gz|wasm|mp4|webm|csv|ya?ml)$/i.test(
      url.pathname,
    )
  ) {
    return;
  }

  const markdownUrl = new URL(url.toString());
  markdownUrl.pathname = toMarkdownPath(url.pathname);

  const markdown = await fetch(markdownUrl, {
    headers: { accept: "text/plain" },
  });
  if (!markdown.ok) return;

  const headers = new Headers(markdown.headers);
  headers.set("content-type", "text/markdown; charset=utf-8");
  // Tell caches the representation depends on the Accept header so the markdown
  // response is never served to a browser asking for HTML.
  headers.set("vary", "Accept");

  return new Response(markdown.body, { status: 200, headers });
};

export const config = { path: "/*" };
