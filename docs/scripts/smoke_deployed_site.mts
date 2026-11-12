// Checks what a deployed docs site answers outside the build (Netlify redirects, edge functions, the 404
// page, the published commit id), against production or a deploy preview; Node built-ins only, so it
// runs without an install.
//
//   node docs/scripts/smoke_deployed_site.mts <base-url> [--commit <sha>]
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const TIMEOUT_MS = 20_000;
const RETRY_PAUSE_MS = 2_000;
const MAX_BYTES = 5 * 1024 * 1024;
const COMMIT = /^[0-9a-f]{40}$/;
const BROWSER_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
const PAGE = "/developers/overview";
const LLMS_DIRECTIVE = "> For the complete documentation index";

type Reply = { url: URL; status: number; type: string; header: (name: string) => string; body: string };
type Get = (pathAndQuery: string, accept?: string) => Promise<Reply>;

/** Reads at most MAX_BYTES of a body, so a misbehaving host cannot exhaust memory. */
async function readCapped(res: Response): Promise<string> {
  if (!res.body) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of res.body) {
    size += chunk.byteLength;
    if (size > MAX_BYTES) throw new Error(`body over ${MAX_BYTES / 1024 / 1024} MiB`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** fetch's own failures: a network error (TypeError) or the timeout; anything the site answered is not one. */
const unanswered = (error: unknown) => error instanceof TypeError || (error instanceof DOMException && error.name === "TimeoutError");

/** A GET that retries once, after a pause, a request that got no answer; each retry is recorded in `retried`. */
const getter = (base: URL, retried: string[]): Get => async (pathAndQuery, accept = "*/*") => {
  const url = new URL(pathAndQuery, base);
  const attempt = async (): Promise<Reply> => {
    // The signal also bounds reading the body.
    const res = await fetch(url, { redirect: "manual", headers: { accept }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const body = await readCapped(res);
    return { url, status: res.status, type: res.headers.get("content-type") ?? "", header: (n) => res.headers.get(n) ?? "", body };
  };
  try {
    return await attempt();
  } catch (error) {
    // The first request to a just-published edge function can outlast the timeout.
    if (!unanswered(error)) throw error;
    retried.push(`${pathAndQuery}: ${message(error)}`);
    await new Promise((resolve) => setTimeout(resolve, RETRY_PAUSE_MS));
    return attempt();
  }
};

const isType = (reply: Reply, type: string) => reply.type.split(";")[0].trim().toLowerCase() === type;

/** Problems with a redirect from `reply` to `expected` (a path on the base's origin); the target URL when there are none. */
function redirectTo(reply: Reply, expected: string, problems: string[]): URL | null {
  if (reply.status !== 301) {
    problems.push(`${reply.url.pathname}: expected 301, got ${reply.status}`);
    return null;
  }
  const target = new URL(reply.header("location"), reply.url);
  if (target.origin !== reply.url.origin) problems.push(`${reply.url.pathname}: redirects off the site, to ${target.origin}`);
  else if (target.pathname !== expected) problems.push(`${reply.url.pathname}: redirects to ${target.pathname}, expected ${expected}`);
  else return target;
  return null;
}

type Check = { id: string; name: string; run: (get: Get, state: { twin?: string; commit?: string }) => Promise<string[] | string> };

export const CHECKS: Check[] = [
  {
    id: "B1",
    name: "plain redirect",
    run: async (get) => {
      const problems: string[] = [];
      return redirectTo(await get("/developers"), "/developers/overview", problems) ? "/developers → /developers/overview" : problems;
    },
  },
  {
    id: "B2",
    name: "splat redirect",
    run: async (get) => {
      const problems: string[] = [];
      const target = redirectTo(await get("/network/operators/setup/running_a_node"), "/operate/operators/setup/running_a_node", problems);
      if (!target) return problems;
      const destination = target.pathname + target.search;
      const page = await get(destination, BROWSER_ACCEPT);
      if (page.status !== 200 || !isType(page, "text/html")) return [`${destination}: got ${page.status} ${page.type}, expected 200 text/html`];
      return `/network/* → ${destination} (200)`;
    },
  },
  {
    id: "B3",
    name: "markdown twin",
    run: async (get, state) => {
      const twin = await get(`${PAGE}.md`);
      if (twin.status !== 200) return [`${PAGE}.md: expected 200, got ${twin.status}`];
      if (!isType(twin, "text/markdown")) return [`${PAGE}.md: content-type ${twin.type || "(none)"}, expected text/markdown`];
      if (!twin.body.startsWith(LLMS_DIRECTIVE)) return [`${PAGE}.md: does not start with the llms.txt directive`];
      state.twin = twin.body;
      return `${PAGE}.md (${twin.type})`;
    },
  },
  {
    id: "B4",
    name: "content negotiation",
    run: async (get, state) => {
      const problems: string[] = [];
      const markdown = async (label: string) => {
        const reply = await get(PAGE, "text/markdown");
        if (reply.status !== 200 || !isType(reply, "text/markdown")) problems.push(`${label}: got ${reply.status} ${reply.type}, expected 200 text/markdown`);
        else if (!reply.header("vary").toLowerCase().split(",").some((v) => v.trim() === "accept")) problems.push(`${label}: no Vary: Accept`);
        else if (reply.body !== state.twin) problems.push(`${label}: body differs from ${PAGE}.md`);
      };
      await markdown("markdown request");
      const browser = await get(PAGE, BROWSER_ACCEPT);
      if (browser.status !== 200 || !isType(browser, "text/html")) problems.push(`browser request: content-type ${browser.type}, status ${browser.status}, expected 200 text/html`);
      else if (!/<\/llms\.txt>;\s*rel="describedby"/.test(browser.header("link"))) problems.push('browser request: no Link: </llms.txt>; rel="describedby"');
      // Asked again after the HTML, so a cache that keys on the URL alone serves the wrong representation here.
      await markdown("markdown request after the browser one");
      return problems.length ? problems : `${PAGE}: markdown, html, markdown`;
    },
  },
  {
    id: "B5",
    name: "migration-notes range",
    run: async (get) => {
      const notes = "/developers/docs/resources/migration_notes.md";
      const range = await get(`${notes}?from=5.2.0&to=6.0.0`);
      if (range.status !== 200 || !isType(range, "text/markdown")) return [`range: got ${range.status} ${range.type}, expected 200 text/markdown`];
      // Only the edge function writes this line, and it is "none" when the published index has no sections.
      const included = /^Included versions: (.*)$/m.exec(range.body)?.[1].split(",").map((v) => v.trim()) ?? [];
      if (!included.includes("6.0.0")) return [`range: 6.0.0 not among the included versions (${included.join(", ") || "no Included versions line"})`];
      const bad = await get(`${notes}?from=bogus`);
      if (bad.status !== 400) return [`bad range: expected 400, got ${bad.status}`];
      return `${notes}?from=5.2.0&to=6.0.0 (${included.length} versions), bad range 400`;
    },
  },
  {
    id: "B6",
    name: "404 page",
    run: async (get) => {
      const missing = `/smoke-test-missing-${Math.random().toString(36).slice(2, 10)}`;
      const reply = await get(missing, BROWSER_ACCEPT);
      if (reply.status !== 404) return [`${missing}: expected 404, got ${reply.status}`];
      if (!isType(reply, "text/html") || !reply.body.includes("Page Not Found")) return [`${missing}: 404 without the site's "Page Not Found" page`];
      return `${missing} → 404 page`;
    },
  },
  {
    id: "B7",
    name: "commit id",
    run: async (get, state) => {
      const reply = await get("/commit.txt");
      if (reply.status !== 200) return [`/commit.txt: expected 200, got ${reply.status}`];
      const sha = reply.body.trim();
      if (!COMMIT.test(sha)) return ["/commit.txt: not a commit id"];
      if (state.commit && sha !== state.commit) return [`/commit.txt: ${sha}, expected ${state.commit}`];
      return sha;
    },
  },
];

/** The base URL, if it names a site root over http(s) with nothing a request could not carry over. */
function parseBase(arg: string | undefined): URL | null {
  if (!arg) return null;
  let url: URL;
  try {
    url = new URL(arg);
  } catch {
    return null;
  }
  const plain = !url.username && !url.password && !url.search && !url.hash && url.pathname === "/";
  return (url.protocol === "https:" || url.protocol === "http:") && plain ? url : null;
}

export async function main(args: string[], log: (line: string) => void = console.log): Promise<number> {
  const [baseArg, flag, commit, ...rest] = args;
  const base = parseBase(baseArg);
  if (!base || rest.length || (flag !== undefined && (flag !== "--commit" || !COMMIT.test(commit ?? "")))) {
    log("usage: node docs/scripts/smoke_deployed_site.mts <base-url> [--commit <40-hex sha>]");
    log("  <base-url>: a site root over http(s), such as https://docs.aztec.network or https://deploy-preview-<n>--aztec-docs-dev.netlify.app");
    return 2;
  }
  const retried: string[] = [];
  const get = getter(base, retried);
  const state: { twin?: string; commit?: string } = { commit };
  let failed = 0;
  for (const check of CHECKS) {
    retried.length = 0;
    let result: string[] | string;
    try {
      result = await check.run(get, state);
    } catch (error) {
      result = [`request failed: ${message(error)}`];
    }
    const note = retried.length ? ` (retried ${retried.join("; ")})` : "";
    if (typeof result === "string") log(`ok   ${check.id} ${check.name}: ${result}${note}`);
    else {
      failed++;
      log(`FAIL ${check.id} ${check.name}: ${result.join("; ")}${note}`);
    }
  }
  log(`deployed site ${base.origin}: ${CHECKS.length} checks, ${failed} failed`);
  return failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(path.resolve(process.argv[1]))).href) {
  process.exitCode = await main(process.argv.slice(2));
}
