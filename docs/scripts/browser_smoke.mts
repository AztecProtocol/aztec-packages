// Checks in headless Chromium what renders only in the browser (OperatorConfig, search, the version
// switch), so no HTML check can see it. Every host but the loopback copy of the build is blocked, so
// analytics and CDNs cannot slow or flake it.
//
//   node scripts/browser_smoke.mts <build-dir>
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { type Browser, chromium, type Page } from "playwright";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

/** Serves `root` the way Netlify does for these tests: pretty URLs, 404.html for anything else. */
async function serve(root: string): Promise<{ origin: string; close: () => void }> {
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
    const base = path.join(root, p);
    const file = [base, `${base}.html`, path.join(base, "index.html")].find(
      (f) => f.startsWith(root + path.sep) && fs.statSync(f, { throwIfNoEntry: false })?.isFile(),
    );
    const served = file ?? path.join(root, "404.html");
    res.writeHead(file ? 200 : 404, { "content-type": TYPES[path.extname(served)] ?? "application/octet-stream" }).end(fs.readFileSync(served));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { origin: `http://127.0.0.1:${(server.address() as { port: number }).port}`, close: () => server.close() };
}

type Smoke = { id: string; name: string; run: (open: (path: string) => Promise<Page>) => Promise<void> };

const firstLine = (error: unknown) => (error instanceof Error ? error.message : String(error)).split("\n")[0];

async function expect(what: string, action: Promise<unknown>): Promise<void> {
  try {
    await action;
  } catch (error) {
    throw new Error(`${what} (${firstLine(error)})`);
  }
}

const OPERATE = "/operate/operators/solo-sequencer";

export const SMOKES: Smoke[] = [
  {
    id: "C1",
    name: "pages load and hydrate without a client error",
    run: async (open) => {
      for (const p of ["/", "/developers/overview", `${OPERATE}/configure-environment`, "/participate"]) await open(p);
    },
  },
  {
    id: "C2",
    name: "the operator panel and a track choice change the rendered config",
    run: async (open) => {
      const env = await open(`${OPERATE}/configure-environment`);
      await expect("the panel's L1 Execution RPC field", env.getByLabel("L1 Execution RPC").fill("https://rpc.smoke.invalid"));
      await expect(
        "the .env block showing the typed RPC",
        env.locator("pre", { hasText: "ETHEREUM_HOSTS=https://rpc.smoke.invalid" }).waitFor(),
      );
      const compose = await open(`${OPERATE}/docker-compose`);
      const ha = compose.locator("pre", { hasText: "migrate-ha-db" });
      if (await ha.count()) throw new Error("the HA commands show before HA is chosen");
      await expect("the HA setup choice", compose.getByRole("radio", { name: "HA setup" }).click());
      await expect("the HA commands after choosing HA", ha.first().waitFor());
    },
  },
  {
    id: "C3",
    name: "the search box returns a result",
    run: async (open) => {
      const page = await open("/developers/overview");
      await expect("the search button", page.getByRole("button", { name: /^Search \(/ }).click());
      await expect("the search box", page.getByRole("dialog", { name: "Search the docs" }).locator("input").fill("PrivateSet"));
      await expect(
        'a result for "PrivateSet"',
        page.getByRole("listbox", { name: "Search results" }).getByRole("option").first().waitFor(),
      );
    },
  },
  {
    id: "C4",
    name: "the version menu switches to another version of the page",
    run: async (open) => {
      const page = await open("/developers/overview");
      const menu = page.locator(".navbar__item.dropdown").filter({ has: page.locator('a.dropdown__link[href="/developers/overview"]') });
      const other = menu.locator('a.dropdown__link:not([href="/developers/overview"])').first();
      const href = await other.getAttribute("href");
      await expect("another version in the version menu", menu.hover().then(() => other.click()));
      // The URL changes before the destination renders: Docusaurus keeps the old page until its chunks load.
      await expect(`the page at ${href}`, menu.locator(`a.dropdown__link--active[href="${href}"]`).waitFor({ state: "attached" }));
    },
  },
];

async function runSmoke(browser: Browser, origin: string, smoke: Smoke): Promise<string[]> {
  const context = await browser.newContext();
  context.setDefaultTimeout(15_000);
  await context.route((url) => url.origin !== origin, (route) => route.abort());
  const errors: string[] = [];
  const open = async (p: string) => {
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(`${p}: ${firstLine(error)}`));
    // A hydration mismatch React recovers from is only logged, and the page still reports hydrated.
    page.on("console", (message) => {
      if (message.type() === "error" && message.text().startsWith("Docusaurus React Root onRecoverableError")) {
        errors.push(`${p}: ${firstLine(message.text())}`);
      }
    });
    await expect(`${p} loading`, page.goto(origin + p));
    await expect(`${p} hydrating`, page.locator("html[data-has-hydrated=true]").waitFor());
    return page;
  };
  try {
    await smoke.run(open);
  } catch (error) {
    errors.push(firstLine(error));
  } finally {
    await context.close();
  }
  return errors;
}

export async function main(buildDir: string, log: (line: string) => void = console.log): Promise<number> {
  const started = performance.now();
  const site = await serve(buildDir);
  const browser = await chromium.launch();
  let failed = 0;
  try {
    for (const smoke of SMOKES) {
      const errors = await runSmoke(browser, site.origin, smoke);
      if (errors.length) failed++;
      log(`${errors.length ? "FAIL" : "ok  "} ${smoke.id} ${smoke.name}${errors.length ? `: ${errors.join("; ")}` : ""}`);
    }
  } finally {
    await browser.close();
    site.close();
  }
  log(`browser smoke: ${SMOKES.length} checks, ${failed} failed in ${Math.round(performance.now() - started)} ms`);
  return failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  const buildDir = process.argv[2];
  if (!buildDir) {
    console.error("usage: node scripts/browser_smoke.mts <build-dir>");
    process.exit(2);
  }
  process.exitCode = await main(path.resolve(buildDir));
}
