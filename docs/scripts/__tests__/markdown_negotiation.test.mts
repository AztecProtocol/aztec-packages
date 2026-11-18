import assert from "node:assert/strict";
import { type TestContext, test } from "node:test";
import negotiate, { config } from "../../netlify/edge-functions/markdown-negotiation.mjs";

const ORIGIN = "https://docs.example";
const PROBE_HEADERS = { accept: "text/html", "x-markdown-negotiation": "subrequest" };

type Route = { status: number; location?: string; body?: string };

/** What Netlify answers once edge functions are done, by path; anything else is the site's 404. */
const SITE: Record<string, Route> = {
  "/developers": { status: 301, location: "/developers/overview" },
  "/developers/overview": { status: 200, body: "<html></html>" },
  "/developers/overview.md": { status: 200, body: "# Aztec Overview\n" },
  "/developers/tierra/overview.md": { status: 302, location: "/developers/overview.md" },
  "/cached.md": { status: 304 },
  "/broken.md": { status: 500 },
  "/old-guide": { status: 302, location: "/guides/new#setup" },
  "/guides/new": { status: 200 },
  "/old-api": { status: 301, location: "/aztec-nr-api/v6/index.html" },
  "/discord": { status: 301, location: "https://discord.example/invite" },
  "/api-page": { status: 200 },
  "/loop": { status: 301, location: "/loop/" },
  "/start": { status: 301, location: "/" },
  "/index.md": { status: 200 },
};

/** Netlify's answer, passing the query on to a redirect target that has none, as it does in production. */
function answer(url: URL): Response {
  const route = SITE[url.pathname] ?? { status: 404, body: "Page Not Found" };
  const headers = new Headers();
  if (route.location) headers.set("location", route.location.includes("?") ? route.location : route.location.replace(/(#|$)/, `${url.search}$1`));
  return new Response(route.body ?? null, { status: route.status, headers });
}

type Probe = { url: string; method: string; redirect?: string; headers: Record<string, string> };

/** Runs the function on one request against SITE; `seen` is what the client gets, with `undefined` meaning Netlify's own answer. */
function site(t: TestContext) {
  const probes: Probe[] = [];
  const nexts: unknown[] = [];
  let failFetch = false;
  t.mock.method(globalThis, "fetch", async (input: string | URL, init: RequestInit = {}) => {
    probes.push({ url: String(input), method: init.method ?? "GET", redirect: init.redirect, headers: Object.fromEntries(new Headers(init.headers)) });
    if (failFetch) throw new TypeError("fetch failed");
    return answer(new URL(String(input)));
  });
  const serve = async (path: string, init: RequestInit = {}) => {
    probes.length = 0;
    nexts.length = 0;
    const request = new Request(`${ORIGIN}${path}`, init);
    const normal = answer(new URL(request.url));
    const response = await negotiate(request, {
      next: async (options?: unknown) => {
        nexts.push(options);
        return normal;
      },
    });
    const seen = response ?? normal;
    return { response, normal, seen, location: seen.headers.get("location"), probes: [...probes], nexts: [...nexts] };
  };
  return { serve, failNextFetch: (on: boolean) => (failFetch = on) };
}

test("a retired page's .md address redirects to its replacement's markdown, with the page's status", async (t) => {
  const { serve } = site(t);
  const developers = await serve("/developers.md");
  assert.deepEqual([developers.seen.status, developers.location], [301, `${ORIGIN}/developers/overview.md`]);
  assert.deepEqual(
    developers.probes.map((p) => [p.method, p.url]),
    [
      ["HEAD", `${ORIGIN}/developers`],
      ["HEAD", `${ORIGIN}/developers/overview.md`],
    ],
  );
  const query = await serve("/developers.md?x=1");
  assert.deepEqual([query.seen.status, query.location], [301, `${ORIGIN}/developers/overview.md?x=1`]);
  const head = await serve("/developers.md", { method: "HEAD" });
  assert.deepEqual([head.seen.status, head.location], [301, `${ORIGIN}/developers/overview.md`]);
  const root = await serve("/start.md");
  assert.deepEqual([root.seen.status, root.location], [301, `${ORIGIN}/index.md`]);
});

test("a replacement with no markdown twin is the destination itself, and only on-site pages get a twin probe", async (t) => {
  const { serve } = site(t);
  const cases: [string, number, string, number][] = [
    ["/old-guide.md", 302, `${ORIGIN}/guides/new#setup`, 2],
    ["/old-api.md", 301, `${ORIGIN}/aztec-nr-api/v6/index.html`, 1],
    ["/discord.md", 301, "https://discord.example/invite", 1],
  ];
  for (const [path, status, location, probes] of cases) {
    const reply = await serve(path);
    assert.deepEqual([reply.seen.status, reply.location, reply.probes.length], [status, location, probes], path);
  }
});

test("a .md address with no redirect, a self-loop, a failed probe or a path naming another host keeps the site's 404", async (t) => {
  const { serve, failNextFetch } = site(t);
  for (const [path, probes] of [
    ["/nope.md", 1],
    ["/api-page.md", 1],
    ["/loop.md", 1],
    ["//other.example/x.md", 0],
    ["/\\other.example/x.md", 0],
    ["/%2F%2Fother.example/x.md", 1],
  ] as const) {
    const reply = await serve(path);
    assert.equal(reply.seen, reply.normal, path);
    assert.equal(reply.probes.length, probes, path);
    for (const probe of reply.probes) assert.equal(new URL(probe.url).origin, ORIGIN, path);
  }
  failNextFetch(true);
  const failed = await serve("/developers.md");
  assert.equal(failed.seen, failed.normal);
});

test("every answer other than a .md 404 is the normal one, with no probe", async (t) => {
  const { serve } = site(t);
  for (const path of ["/developers/overview.md", "/cached.md", "/developers/tierra/overview.md", "/broken.md", "/developers"]) {
    const reply = await serve(path, { headers: { "if-none-match": '"etag"' } });
    assert.equal(reply.seen, reply.normal, path);
    assert.deepEqual(reply.probes, [], path);
    // Without the flag, context.next() strips conditional headers and a 304 becomes a full 200.
    for (const options of reply.nexts) assert.deepEqual(options, { sendConditionalRequest: true }, path);
  }
  for (const init of [{ method: "POST" }, { headers: { "x-markdown-negotiation": "subrequest" } }]) {
    const reply = await serve("/developers.md", init);
    assert.deepEqual([reply.response, reply.nexts, reply.probes], [undefined, [], []], JSON.stringify(init));
  }
});

test("probes are bare HEADs that never follow a redirect, whatever the client sent", async (t) => {
  const { serve } = site(t);
  const reply = await serve("/developers.md", { headers: { cookie: "session=1", authorization: "Bearer x", "if-none-match": '"etag"' } });
  assert.equal(reply.probes.length, 2);
  for (const probe of reply.probes) assert.deepEqual({ ...probe, url: "" }, { url: "", method: "HEAD", redirect: "manual", headers: PROBE_HEADERS });
});

test("markdown negotiation is unchanged: its .md fetch is marked, so a retired page's own redirect still answers", async (t) => {
  const { serve } = site(t);
  const page = await serve("/developers/overview", { headers: { accept: "text/markdown" } });
  assert.deepEqual([page.seen.status, page.seen.headers.get("content-type"), await page.seen.text()], [200, "text/markdown; charset=utf-8", "# Aztec Overview\n"]);
  const retired = await serve("/developers", { headers: { accept: "text/markdown" } });
  assert.equal(retired.seen, retired.normal);
  assert.equal(retired.probes[0]?.headers["x-markdown-negotiation"], "subrequest");
});

test("the config turns on Netlify's error bypass, so an exception falls through to the normal response", () => {
  assert.deepEqual(config, { path: "/*", onError: "bypass" });
});
