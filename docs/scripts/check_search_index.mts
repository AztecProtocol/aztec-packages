// Fails a build whose search index misses a sitemap page, holds too few
// Aztec.nr API pages, or stops finding a probe's page for a served version.
// It queries through the build's own pagefind.js over loopback, the same code
// and files a browser loads.
//
//   node scripts/check_search_index.mts <build-dir>
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import networkDocs from "../src/network_docs.js";
import { contextTags } from "../src/theme/SearchBar/search.mjs";

type Plugin = "developer" | "network";
type Probe = { query: string; plugin: Plugin | "api"; paths: string[] };
export type Hit = { url: string; tags: string[] };

// Each probe's page must rank in the top RETRIEVAL for every served version and
// should rank in the top RANKING. `paths` are URL suffixes: a renamed page needs
// its new path here, and the current docs may already use a newer one.
export const PROBES: Probe[] = [
  { query: "getting started", plugin: "developer", paths: ["getting_started_on_testnet"] },
  { query: "deploy contract", plugin: "developer", paths: ["docs/aztec-js/how_to_deploy_contract"] },
  { query: "run a node", plugin: "network", paths: ["operators/setup/running_a_node", "operators/full-node/setup"] },
  { query: "PrivateSet", plugin: "api", paths: ["noir_aztec/state_vars/struct.PrivateSet"] },
];
const RETRIEVAL = 10;
const RANKING = 3;
export const MIN_API_PAGES = 1000;

export const sitemapPaths = (xml: string) =>
  [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);

/** 1-based rank of the first hit with `tag` whose URL ends in one of `paths`; 0 when absent. */
export const rankOf = (hits: Hit[], tag: string, paths: string[]) =>
  hits.findIndex((h) => h.tags.includes(tag) && paths.some((p) => h.url.endsWith(`/${p}`))) + 1;

/** The version names each versioned doc set serves, from the index's tag counts. */
export function servedVersions(tags: Record<string, number>): Record<Plugin, string[]> {
  const served: Record<Plugin, string[]> = { developer: [], network: [] };
  for (const tag of Object.keys(tags)) {
    const m = /^docs-(developer|network)-(.+)$/.exec(tag);
    if (m) served[m[1] as Plugin].push(m[2]);
  }
  return served;
}

/** The version each doc set serves at its root, as `lastVersion` in docusaurus.config.js. */
function latestVersions(docsDir: string): Record<Plugin, string> {
  const config = (name: string) =>
    JSON.parse(fs.readFileSync(path.join(docsDir, `${name}_version_config.json`), "utf8"));
  const [developer, network] = networkDocs
    .docsInstances(config("developer"), config("network"), process.env.CONTEXT === "production")
    .map((instance: { versions: { version: string; path: string }[] }) =>
      instance.versions.find((v) => v.path === "")?.version);
  return { developer, network };
}

async function loadPagefind(bundleDir: string) {
  const server = http.createServer((req, res) => {
    const file = path.join(bundleDir, decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname));
    if (!file.startsWith(bundleDir + path.sep) || !fs.statSync(file, { throwIfNoEntry: false })?.isFile()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200).end(fs.readFileSync(file));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  // pagefind.js expects a browser; it strips basePath's origin when it equals
  // the page's, so the page claims another origin.
  Object.assign(globalThis, {
    window: globalThis,
    document: { documentElement: { lang: "en" }, querySelector: () => null, currentScript: null },
    location: new URL("http://page.invalid/"),
  });
  const pagefind = await import(pathToFileURL(path.join(bundleDir, "pagefind.js")).href);
  await pagefind.options({ basePath: `http://127.0.0.1:${port}/` });
  await pagefind.init();
  return { pagefind, close: () => server.close() };
}

async function check(buildDir: string, docsDir: string) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const bundleDir = path.join(buildDir, "pagefind");
  if (!fs.existsSync(path.join(bundleDir, "pagefind.js"))) {
    return { errors: [`no Pagefind bundle at ${bundleDir}`], warnings };
  }
  const { pagefind, close } = await loadPagefind(bundleDir);
  try {
    const search = async (query: string | null, tags?: string[], top?: number): Promise<Hit[]> => {
      const { results } = await pagefind.search(query, tags ? { filters: { docusaurus_tag: { any: tags } } } : {});
      const data = await Promise.all(results.slice(0, top).map((r: { data: () => Promise<unknown> }) => r.data()));
      return data.map((d: any) => ({ url: d.url, tags: d.filters.docusaurus_tag ?? [] }));
    };

    const tagCounts: Record<string, number> = (await pagefind.filters()).docusaurus_tag ?? {};
    const docsTags = Object.keys(tagCounts).filter((t) => t.startsWith("docs-"));
    const indexed = new Set((await search(null, docsTags)).map((h) => h.url));
    const sitemap = sitemapPaths(fs.readFileSync(path.join(buildDir, "sitemap.xml"), "utf8"));
    const missing = sitemap.filter((p) => !indexed.has(p));
    if (missing.length) errors.push(`${missing.length} sitemap pages are not indexed: ${missing.slice(0, 10).join(", ")}`);
    const apiPages = tagCounts.default ?? 0;
    if (apiPages < MIN_API_PAGES) errors.push(`${apiPages} API pages indexed, expected at least ${MIN_API_PAGES}`);
    console.log(`search index: ${indexed.size} docs pages and ${apiPages} API pages; ${sitemap.length - missing.length}/${sitemap.length} sitemap pages covered`);

    const served = servedVersions(tagCounts);
    const latest = latestVersions(docsDir);
    const versions = {
      developer: { names: served.developer, latest: latest.developer },
      network: { names: served.network, latest: latest.network },
    };
    for (const probe of PROBES) {
      const plugin = probe.plugin === "api" ? "developer" : probe.plugin;
      for (const version of served[plugin]) {
        const tags = contextTags({ active: { pluginId: plugin, version }, versions });
        const expected = probe.plugin === "api" ? "default" : `docs-${plugin}-${version}`;
        const rank = rankOf(await search(probe.query, tags, RETRIEVAL), expected, probe.paths);
        const label = `probe "${probe.query}" on ${plugin} ${version}`;
        if (!rank) errors.push(`${label}: expected page not in the top ${RETRIEVAL}`);
        else if (rank > RANKING) warnings.push(`${label}: expected page at #${rank}, goal top ${RANKING}`);
        else console.log(`${label}: #${rank}`);
      }
      if (probe.plugin !== "api" && served[plugin].length > 1) {
        const all = await search(probe.query, undefined, RETRIEVAL);
        const found = served[plugin].filter((v) => rankOf(all, `docs-${plugin}-${v}`, probe.paths));
        if (found.length < 2) errors.push(`probe "${probe.query}" across all versions: fewer than two versions in the top ${RETRIEVAL}`);
      }
    }
  } finally {
    await pagefind.destroy();
    close();
  }
  return { errors, warnings };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [buildDir] = process.argv.slice(2);
  if (!buildDir) {
    console.error("usage: node scripts/check_search_index.mts <build-dir>");
    process.exit(2);
  }
  const docsDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  check(path.resolve(buildDir), docsDir).then(
    ({ errors, warnings }) => {
      for (const w of warnings) console.warn(`warning: ${w}`);
      for (const e of errors) console.error(`error: ${e}`);
      process.exit(errors.length ? 1 : 0);
    },
    (e) => {
      console.error(e);
      process.exit(1);
    },
  );
}
