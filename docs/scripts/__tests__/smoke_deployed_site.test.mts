import assert from "node:assert/strict";
import http from "node:http";
import { after, test } from "node:test";
import { main } from "../smoke_deployed_site.mts";

type Handler = (req: http.IncomingMessage, res: http.ServerResponse) => void;

const TWIN = "> For the complete documentation index, see [llms.txt](/llms.txt)\n\n# Aztec Overview\n";
const SHA = "f878b1277fdc9d3363cc7fd42fc19a7cf2f32d43";
const send = (status: number, type: string, body: string, headers: Record<string, string> = {}): Handler => (_req, res) => {
  res.writeHead(status, { "content-type": type, link: '</llms.txt>; rel="describedby"', ...headers }).end(body);
};
const redirect = (to: string): Handler => (_req, res) => res.writeHead(301, { location: to, "content-type": "text/plain" }).end();

/** Answers the way Netlify serves the docs today (absolute redirect targets, as Netlify sends them). */
function netlifyRoutes(origin: string): Record<string, Handler> {
  return {
    "/developers": redirect(`${origin}/developers/overview`),
    "/network/operators/setup/running_a_node": redirect(`${origin}/operate/operators/setup/running_a_node`),
    "/operate/operators/setup/running_a_node": send(200, "text/html; charset=UTF-8", "<html></html>"),
    "/developers/overview.md": send(200, "text/markdown; charset=UTF-8", TWIN, { vary: "Accept-Encoding" }),
    "/developers/overview": (req, res) =>
      req.headers.accept?.includes("text/markdown")
        ? send(200, "text/markdown; charset=utf-8", TWIN, { vary: "Accept-Encoding, Accept" })(req, res)
        : send(200, "text/html; charset=UTF-8", "<html></html>")(req, res),
    "/developers/docs/resources/migration_notes.md": (req, res) =>
      new URL(req.url ?? "", "http://x").searchParams.get("from") === "5.2.0"
        ? send(200, "text/markdown; charset=utf-8", "# Aztec migration notes: 5.2.0 to 6.0.0\nIncluded versions: 6.0.0-rc.1, 6.0.0\n")(req, res)
        : send(400, "text/plain; charset=utf-8", "Bad range: from is not a version.\n")(req, res),
    "/commit.txt": send(200, "text/plain; charset=UTF-8", `${SHA}\n`),
  };
}

const servers: http.Server[] = [];
after(() => servers.forEach((s) => s.close().closeAllConnections()));

/** A loopback server answering `routes(origin)` and other paths with `fallback`; `hits` records each request. */
async function serve(routes: (origin: string) => Record<string, Handler>, fallback = send(404, "text/html; charset=utf-8", "<h1 class=hero__title>Page Not Found</h1>")) {
  let table: Record<string, Handler> = {};
  const hits: string[] = [];
  const server = http.createServer((req, res) => {
    hits.push(req.url ?? "");
    const handler = table[new URL(req.url ?? "/", "http://x").pathname];
    (handler ?? fallback)(req, res);
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  table = routes(origin);
  return { origin, hits };
}

async function run(args: string[]) {
  const lines: string[] = [];
  const code = await main(args, (line) => lines.push(line));
  return { code, out: lines.join("\n") };
}

test("a site that answers like Netlify passes every check and its commit id is printed", async () => {
  const { origin } = await serve(netlifyRoutes);
  const { code, out } = await run([origin, "--commit", SHA]);
  assert.equal(code, 0, out);
  assert.equal(out.split("\n").filter((l) => l.startsWith("ok ")).length, 7, out);
  assert.match(out, new RegExp(`commit id: ${SHA}`));
});

test("each broken behaviour fails its own check, and a redirect off the site is never followed", async () => {
  const elsewhere = await serve(() => ({}));
  const { origin } = await serve((o) => ({
    ...netlifyRoutes(o),
    "/developers": redirect(`${o}/developers/docs`),
    "/network/operators/setup/running_a_node": redirect(`${elsewhere.origin}/operate/operators/setup/running_a_node`),
    "/developers/overview.md": send(200, "text/markdown-broken; charset=UTF-8", TWIN),
    "/developers/overview": send(200, "text/markdown; charset=utf-8", TWIN),
    "/developers/docs/resources/migration_notes.md": send(200, "text/markdown", "Included versions: none\n"),
    "/commit.txt": send(200, "text/plain", "not a commit\n"),
  }));
  const { code, out } = await run([origin]);
  assert.equal(code, 1);
  const fail = (id: string) => out.split("\n").find((l) => l.startsWith(`FAIL ${id} `)) ?? "";
  assert.match(fail("B1"), /redirects to \/developers\/docs, expected \/developers\/overview/);
  assert.match(fail("B2"), /redirects off the site/);
  assert.match(fail("B3"), /content-type text\/markdown-broken/);
  assert.match(fail("B4"), /browser request: content-type text\/markdown/);
  assert.match(fail("B5"), /6\.0\.0 not among the included versions/);
  assert.match(fail("B7"), /not a commit id/);
  assert.deepEqual(elsewhere.hits, []);
});

test("a request that gets no answer is retried once, and only its check's line says so", async () => {
  const seen = new Set<string>();
  const first = (key: string) => !seen.has(key) && Boolean(seen.add(key));
  const { origin, hits } = await serve((o) => {
    const routes = netlifyRoutes(o);
    return {
      ...routes,
      "/developers/overview.md": (req, res) => (first("twin") ? req.socket.destroy() : routes["/developers/overview.md"](req, res)),
      "/commit.txt": (req, res) => {
        if (!first("commit")) return routes["/commit.txt"](req, res);
        res.writeHead(200, { "content-type": "text/plain" });
        res.write("f878");
        setTimeout(() => req.socket.destroy(), 20);
      },
    };
  });
  const { code, out } = await run([origin, "--commit", SHA]);
  assert.equal(code, 0, out);
  assert.deepEqual(
    out.split("\n").filter((l) => l.includes("retried")),
    [
      "ok   B3 markdown twin: /developers/overview.md (text/markdown; charset=UTF-8) (retried /developers/overview.md: fetch failed)",
      `ok   B7 commit id: ${SHA} (retried /commit.txt: terminated)`,
    ],
  );
  assert.deepEqual(["/developers/overview.md", "/commit.txt"].map((p) => hits.filter((h) => h === p).length), [2, 2]);
});

test("a wrong answer fails at once, with no second request", async () => {
  const { origin, hits } = await serve((o) => ({
    ...netlifyRoutes(o),
    "/developers": send(503, "text/plain", "not gzip", { "content-encoding": "gzip" }),
    "/developers/overview.md": send(503, "text/html", "busy"),
    "/commit.txt": (_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("0".repeat(6 * 1024 * 1024));
    },
  }));
  const { code, out } = await run([origin]);
  assert.equal(code, 1);
  assert.match(out, /^FAIL B1 plain redirect: request failed: terminated$/m);
  assert.match(out, /^FAIL B3 markdown twin: \/developers\/overview\.md: expected 200, got 503$/m);
  assert.match(out, /^FAIL B7 commit id: request failed: body over 5 MiB$/m);
  assert.doesNotMatch(out, /retried/);
  assert.deepEqual(["/developers", "/developers/overview.md", "/commit.txt"].map((p) => hits.filter((h) => h === p).length), [1, 1, 1]);
});

test("a redirect target that fails with its query, a soft 404, an oversized body and a commit mismatch fail; bad base URLs are refused", async () => {
  const { origin } = await serve((o) => ({
    ...netlifyRoutes(o),
    "/commit.txt": (_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("0".repeat(6 * 1024 * 1024));
    },
  }));
  const soft = await serve(
    (o) => ({
      ...netlifyRoutes(o),
      "/network/operators/setup/running_a_node": redirect(`${o}/operate/operators/setup/running_a_node?broken=1`),
      "/operate/operators/setup/running_a_node": (req, res) =>
        (req.url?.includes("broken") ? send(404, "text/html", "") : send(200, "text/html", "<html></html>"))(req, res),
    }),
    send(200, "text/html", "<html></html>"),
  );
  const { out } = await run([origin, "--commit", SHA]);
  assert.match(out, /FAIL B7 .*over 5 MiB/);
  const mismatch = await run([soft.origin, "--commit", "a".repeat(40)]);
  assert.match(mismatch.out, /FAIL B2 .*running_a_node\?broken=1: got 404/);
  assert.match(mismatch.out, /FAIL B6 .*expected 404, got 200/);
  assert.match(mismatch.out, new RegExp(`FAIL B7 .*${SHA}, expected a{40}`));
  for (const bad of [[], ["ftp://example.org"], ["https://user:pw@example.org"], ["https://example.org/?a=1"], ["https://example.org/sub"], [origin, "--commit", "abc"]]) {
    assert.equal((await run(bad)).code, 2, bad.join(" "));
  }
});
