// Fails a build whose key pages lost what readers rely on though the build succeeded. The expected
// layout comes from the model docusaurus.config.js builds from (src/network_docs.js). Most
// OperatorConfig parts render nothing on the server, so only their fallbacks can be checked here.
//
//   node scripts/check_built_site.mts <build-dir>
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import networkDocs from "../src/network_docs.js";
import line from "../src/preprocess/line.js";

/** A page every version and line of a docs instance serves. Renaming one means updating it here. */
export const SAMPLE_PAGES: Record<string, string> = {
  developers: "overview",
  operate: "operators/solo-sequencer/configure-environment",
};
const TOOLCHAIN_PAGE = "operators/solo-sequencer/install-toolchain";
const OTHER_PAGES = ["/", "/404", "/participate"];
const TEMPLATE_TOKEN = /\{\{[A-Z][A-Z0-9_]*\}\}/;

export type Model = {
  configs: { developer: Record<string, string>; network: Record<string, string> };
  /** `<plugin>_versions.json`: every version with a snapshot, read by the config as its cut versions. */
  cut: { developer: string[]; network: string[] };
  lines: string[];
  production: boolean;
};
type Section = { base: string; page: string; paths: string[]; urls: string[]; rootUrl: string | null };

export const pageUrl = (base: string, versionPath: string, page: string) =>
  `/${[base, versionPath, page].filter(Boolean).join("/")}`;

/**
 * The sample page of each docs instance in every version the layout serves, and of each dev line.
 * `rootUrl` is the instance's page at its root path, whose version menu lists every version.
 */
export function expectedSections(model: Model): Section[] {
  const instances = networkDocs.docsInstances(model.configs.developer, model.configs.network, model.production);
  const cut = [model.cut.developer, model.cut.network];
  const section = (base: string, paths: string[], rootUrl: boolean): Section => {
    const page = SAMPLE_PAGES[base];
    return { base, page, paths, urls: paths.map((p) => pageUrl(base, p, page)), rootUrl: rootUrl ? pageUrl(base, "", page) : null };
  };
  const sections = instances.map((instance: { routeBasePath: string; versions: { path: string }[] }, i: number) =>
    section(instance.routeBasePath, [...instance.versions.map((v) => v.path), ...networkDocs.historicalVersions(instance, cut[i])], true),
  );
  const lines = networkDocs
    .lineInstances(model.lines, model.production)
    .map(({ line: name, routeBasePath }: { line: string; routeBasePath: string }) => {
      const s = section(routeBasePath.slice(0, -name.length - 1), [""], false);
      return { ...s, base: routeBasePath, urls: [pageUrl(routeBasePath, "", s.page)] };
    });
  return [...sections, ...lines];
}

const NAMED_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decode = (text: string) =>
  text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (entity, name: string) =>
    name[0] !== "#"
      ? (NAMED_ENTITIES[name.toLowerCase()] ?? entity)
      : String.fromCodePoint(name[1].toLowerCase() === "x" ? Number.parseInt(name.slice(2), 16) : Number(name.slice(1))),
  );

/** The start tags named `name`; a `>` inside a quoted attribute value does not end a tag. */
const startTags = (html: string, name: string) =>
  html.match(new RegExp(`<${name}\\b(?:[^>"']|"[^"]*"|'[^']*')*>`, "gi")) ?? [];

/** An attribute's decoded value in one start tag, quoted or not (the minifier drops quotes it can). */
function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\s${name}=(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\`]+))`, "i").exec(tag);
  return m ? decode(m[1] ?? m[2] ?? m[3]) : undefined;
}

export const classList = (tag: string) => (attr(tag, "class") ?? "").split(/\s+/).filter(Boolean);

/** The item links of the navbar dropdown that offers `url` itself, as the version menu offers the current page; null when none does. */
export function dropdownLinks(html: string, url: string): string[] | null {
  for (const m of html.matchAll(/(<ul\b(?:[^>"']|"[^"]*"|'[^']*')*>)([\s\S]*?)<\/ul>/gi)) {
    if (!classList(m[1]).includes("dropdown__menu")) continue;
    const links = startTags(m[2], "a")
      .filter((a) => classList(a).includes("dropdown__link"))
      .map((a) => attr(a, "href") ?? "");
    if (links.includes(url)) return links;
  }
  return null;
}

/** The text of each `<pre>` block, with its highlighting markup removed. */
export const codeBlockTexts = (html: string) =>
  [...html.matchAll(/<pre\b(?:[^>"']|"[^"]*"|'[^']*')*>([\s\S]*?)<\/pre>/gi)].map((m) => decode(m[1].replace(/<[^>]*>/g, "")));

export const hasFooter = (html: string) => startTags(html, "footer").some((tag) => classList(tag).includes("footer"));

export const hasSearchTrigger = (html: string) =>
  startTags(html, "button").some((tag) => attr(tag, "aria-label")?.startsWith("Search ("));

function readPage(buildDir: string, url: string): string | null {
  const p = url.slice(1);
  for (const file of p ? [`${p}.html`, `${p}/index.html`] : ["index.html"]) {
    const full = path.join(buildDir, file);
    if (fs.existsSync(full)) return fs.readFileSync(full, "utf8");
  }
  return null;
}

/** Problems with the build at `buildDir` for the layout `model` describes, one line each, then a summary. */
export function main(buildDir: string, model: Model, log: (line: string) => void = console.log): number {
  const started = performance.now();
  const problems: string[] = [];
  const sections = expectedSections(model);
  // Mirrors RECOMMENDED_VERSION in src/components/OperatorConfig/context.js.
  const recommended = model.configs.network.testnet || model.configs.network.mainnet || "latest";

  const pages = new Map<string, string | null>();
  const page = (url: string) => {
    if (!pages.has(url)) pages.set(url, readPage(buildDir, url));
    return pages.get(url) ?? null;
  };
  const toolchainUrls: string[] = [];
  for (const s of sections) {
    if (s.page !== SAMPLE_PAGES.operate) continue;
    toolchainUrls.push(...s.paths.map((p) => pageUrl(s.base, p, TOOLCHAIN_PAGE)));
  }
  const urls = [...sections.flatMap((s) => s.urls), ...toolchainUrls, ...OTHER_PAGES];
  for (const url of urls) {
    const html = page(url);
    if (html === null) {
      problems.push(`${url}: missing; a docs version or line is not built, or the page moved (update SAMPLE_PAGES)`);
      continue;
    }
    if (!hasSearchTrigger(html)) problems.push(`${url}: no search button (the navbar's search bar rendered nothing)`);
    if (!hasFooter(html)) problems.push(`${url}: no site footer`);
  }

  for (const s of sections) {
    const root = s.rootUrl && page(s.rootUrl);
    if (root) {
      const links = dropdownLinks(root, s.rootUrl as string);
      const sorted = (l: string[]) => [...l].sort().join(" ");
      // With one version the menu renders as a plain link, which offers nothing to check.
      if (!links) {
        if (s.urls.length > 1) problems.push(`version menu on ${s.rootUrl}: no menu offers this page`);
      }
      else if (sorted(links) !== sorted(s.urls)) {
        problems.push(`version menu on ${s.rootUrl} links [${links.join(", ")}], expected [${s.urls.join(", ")}]`);
      }
    }
    if (s.page !== SAMPLE_PAGES.operate) continue;
    for (const url of s.urls) {
      const html = page(url);
      if (html !== null && !codeBlockTexts(html).some((text) => TEMPLATE_TOKEN.test(text))) {
        problems.push(`${url}: no code block holds a {{TOKEN}} template (ConfigCode's server-rendered fallback lost its content)`);
      }
    }
  }
  for (const url of toolchainUrls) {
    const html = page(url);
    if (html !== null && !html.includes(`<code>${recommended}</code>`)) {
      problems.push(`${url}: no <code>${recommended}</code> (RecommendedVersion renders network_version_config.json)`);
    }
  }

  if (model.production) {
    const leaks = [
      ...fs.readdirSync(buildDir).filter((entry) => /^(developers|operate)-/.test(entry)),
      ...["developers/dev", "aztec-nr-api/next"].filter((dir) => fs.existsSync(path.join(buildDir, dir))),
    ];
    for (const dir of leaks) problems.push(`${dir}: served by production, which serves released docs only`);
  }

  for (const problem of problems) log(problem);
  const layout = model.production ? "production" : "non-production";
  const ms = Math.round(performance.now() - started);
  log(`built site: ${urls.length} pages, ${problems.length} problems (${layout} layout) in ${ms} ms`);
  return problems.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  const buildDir = process.argv[2];
  if (!buildDir) {
    console.error("usage: node scripts/check_built_site.mts <build-dir>");
    process.exit(2);
  }
  const docsDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const json = (file: string) => JSON.parse(fs.readFileSync(path.join(docsDir, file), "utf8"));
  process.exitCode = main(path.resolve(buildDir), {
    configs: { developer: json("developer_version_config.json"), network: json("network_version_config.json") },
    cut: { developer: json("developer_versions.json"), network: json("network_versions.json") },
    lines: line.lineNames(path.dirname(docsDir)),
    production: process.env.CONTEXT === "production",
  });
}
