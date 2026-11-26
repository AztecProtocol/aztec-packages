// Content negotiation for agents: when a request prefers markdown
// (`Accept: text/markdown`), serve the pre-built .md sibling of the page that
// the SignalWire llms-txt plugin emits at build time, instead of the HTML.
//
// Browsers send `Accept: text/html,...` and never `text/markdown`, so they fall
// through to the normal HTML response untouched, as do requests for static
// files (FILE).
//
// A .md address that answers 404 follows its page's redirect instead: a retired
// page's twin lands on the replacement's twin, with no rule of its own.

// Marks this function's own fetches, which skip the .md redirect lookup: it never
// recurses, and a negotiated request for a retired page keeps the page's redirect.
const SUBREQUEST_HEADER = "x-markdown-negotiation";
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
// Known static-file extensions, not any trailing dot, so doc routes whose last
// segment contains a dot (e.g. a changelog page like ".../changelog/v2.0.2")
// still count as pages.
const FILE =
  /\.(md|html?|xml|txt|json|js|mjs|cjs|map|css|png|jpe?g|gif|svg|webp|avif|ico|bmp|woff2?|ttf|otf|eot|pdf|zip|gz|wasm|mp4|webm|csv|ya?ml)$/i;

function prefersMarkdown(accept) {
  return accept.toLowerCase().includes("text/markdown");
}

function toMarkdownPath(pathname) {
  let p = pathname;
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  if (p === "" || p === "/") return "/index.md";
  return `${p}.md`;
}

const toPagePath = (twinPath) => (twinPath === "/index.md" ? "/" : twinPath.slice(0, -3));

// netlify dev's fetch wrapper re-resolves the path against the site, where `//host/...` names another host.
const namesAnotherHost = (url) => url.pathname.startsWith("//");

/** A bare HEAD to this site that leaves redirects unfollowed; null for a path starting with `//`. */
async function probe(url) {
  if (namesAnotherHost(url)) return null;
  return fetch(url, { method: "HEAD", redirect: "manual", headers: { accept: "text/html", [SUBREQUEST_HEADER]: "subrequest" } });
}

/**
 * Answers a .md 404 with its page's redirect, pointed at the replacement's twin when there is one and
 * at the replacement otherwise; `notFound` when the page does not redirect. Netlify applies its own
 * rules to the page, so every rule in netlify.toml is followed without a list here.
 */
async function followPageRedirect(url, notFound) {
  try {
    const page = new URL(url);
    page.pathname = toPagePath(url.pathname);
    const reply = await probe(page);
    const location = reply?.headers.get("location");
    if (!reply || !REDIRECT_STATUSES.has(reply.status) || !location) return notFound;
    // Only netlify.toml writes this Location, so an off-site target is one of our rules.
    const target = new URL(location, page);
    let destination = target;
    if (target.origin === url.origin && !FILE.test(target.pathname)) {
      const twin = new URL(target);
      twin.pathname = toMarkdownPath(target.pathname);
      if (twin.pathname === url.pathname) return notFound;
      // A 3xx twin is redirected again by Netlify on the reader's next hop.
      if ((await probe(twin))?.status < 400) destination = twin;
    }
    // Absolute, so a path starting with `//` can never read as another host.
    return new Response(null, { status: reply.status, headers: { location: destination.href } });
  } catch {
    return notFound;
  }
}

export default async (request, context) => {
  const url = new URL(request.url);

  if (url.pathname.endsWith(".md")) {
    if ((request.method !== "GET" && request.method !== "HEAD") || request.headers.has(SUBREQUEST_HEADER)) return;
    // Without the flag, next() strips conditional headers and a cached twin's 304 becomes a full 200.
    const response = await context.next({ sendConditionalRequest: true });
    return response.status === 404 ? followPageRedirect(url, response) : response;
  }

  const accept = request.headers.get("accept") || "";
  if (!prefersMarkdown(accept)) return;
  if (FILE.test(url.pathname) || namesAnotherHost(url)) return;

  const markdownUrl = new URL(url.toString());
  markdownUrl.pathname = toMarkdownPath(url.pathname);

  const markdown = await fetch(markdownUrl, {
    headers: { accept: "text/plain", [SUBREQUEST_HEADER]: "subrequest" },
  });
  if (!markdown.ok) return;

  const headers = new Headers(markdown.headers);
  headers.set("content-type", "text/markdown; charset=utf-8");
  // Tell caches the representation depends on the Accept header so the markdown
  // response is never served to a browser asking for HTML.
  headers.set("vary", "Accept");

  return new Response(markdown.body, { status: 200, headers });
};

export const config = { path: "/*", onError: "bypass" };
