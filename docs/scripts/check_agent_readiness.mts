// Fails a build whose markdown an agent would trip over: a link in a markdown page or an llms.txt
// that points at no built file, a sitemap page without its markdown twin, a shell command in a
// twin's code block split by a blank line after its `\` continuation, or an llms.txt whose Start
// here misses a task. Reads only the build directory, the docs version configs and the Netlify
// build variables that pick the layout and host: no network, no clock.
//
//   node scripts/check_agent_readiness.mts <build-dir>
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import networkDocs from "../src/network_docs.js";
import siteUrl from "../src/site_url.js";

export const SITE_ORIGIN: string = siteUrl.SITE_URL;

/** Built only by deploy previews (scripts/netlify-build.sh), so CI's build may lack it. */
const PREVIEW_ONLY = /^\/aztec-nr-api\/next(\/|$)/;

const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/** The text outside fenced code blocks and inline code spans, line breaks kept. */
export function proseOf(markdown: string): string {
  let fence = "";
  return markdown
    .split("\n")
    .map((line) => {
      const open = FENCE.exec(line)?.[1];
      if (fence) {
        if (open && open[0] === fence[0] && open.length >= fence.length && !line.trim().slice(open.length)) fence = "";
        return "";
      }
      if (open) {
        fence = open;
        return "";
      }
      return line.replace(/(`+)(?:(?!\1)[\s\S])*?\1/g, "");
    })
    .join("\n");
}

/** Every link and image target in a markdown text, outside code, with the 1-based line it starts on. */
export function markdownLinks(markdown: string): { line: number; target: string }[] {
  const prose = proseOf(markdown);
  const links: { line: number; target: string }[] = [];
  const lineAt = (index: number) => prose.slice(0, index).split("\n").length;
  for (const m of prose.matchAll(/\]\(\s*(?:<([^>\n]*)>|([^)\s]+))/g)) {
    links.push({ line: lineAt(m.index), target: m[1] ?? m[2] });
  }
  for (const m of prose.matchAll(/^ {0,3}\[[^\]\n]+\]:\s*(?:<([^>\n]*)>|(\S+))/gm)) {
    links.push({ line: lineAt(m.index), target: m[1] ?? m[2] });
  }
  for (const m of prose.matchAll(/<(https?:\/\/[^>\s]+)>/g)) {
    links.push({ line: lineAt(m.index), target: m[1] });
  }
  return links;
}

/** Every literal docs-site URL in a text, code included, as the source URL check extracts them. */
export function siteUrls(text: string, origin = SITE_ORIGIN): { line: number; target: string }[] {
  const host = origin.replace(/^https?:\/\//, "").replace(/[.]/g, "\\.");
  const re = new RegExp(`https?://${host}[^\\s"'\`<>(){}|\\\\\\[\\]]*`, "g");
  return text.split("\n").flatMap((line, i) =>
    [...line.matchAll(re)]
      .map((m) => m[0].replace(/[.,;:!?*]+$/, ""))
      .filter((url) => !url.endsWith("$"))
      .map((target) => ({ line: i + 1, target })),
  );
}

/**
 * The build path a link from `pagePath` points at, or null for a link off the site (another
 * host, a non-http scheme, a bare fragment). Fragments and queries are dropped.
 */
export function linkPath(target: string, pagePath: string, origin = SITE_ORIGIN): string | null {
  if (!target || target.startsWith("#")) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(target) && !/^https?:/i.test(target)) return null;
  let url: URL;
  try {
    url = new URL(target, origin + pagePath);
  } catch {
    return target;
  }
  if (url.origin !== new URL(origin).origin) return null;
  try {
    return decodeURIComponent(url.pathname);
  } catch {
    return url.pathname;
  }
}

/**
 * Whether the build serves `urlPath`: the file itself, or for an extensionless path its HTML
 * pretty URL (`x.html`, `x/index.html`). A markdown-only target needs its explicit `.md` link: the
 * edge function serves markdown for extensionless URLs only to requests that ask for it.
 */
export function served(urlPath: string, files: Set<string>): boolean {
  const p = urlPath.replace(/^\/+/, "").replace(/\/+$/, "");
  if (p === "") return files.has("index.html");
  return files.has(p) || files.has(`${p}.html`) || files.has(`${p}/index.html`);
}

export type Problem = { file: string; line?: number; message: string };

/**
 * Broken links in the markdown pages and llms.txt files of a build. Absolute links are checked in
 * llms.txt files on the host they were written for (`llmsOrigin`, a preview's own) and in pages on
 * the docs origin only when the build is production's layout, which those links name.
 */
export function brokenLinks(
  pages: { file: string; text: string }[],
  files: Set<string>,
  { production, llmsOrigin = SITE_ORIGIN }: { production: boolean; llmsOrigin?: string },
): { problems: Problem[]; checked: number; previewOnly: number } {
  const problems: Problem[] = [];
  let checked = 0;
  let previewOnly = 0;
  for (const { file, text } of pages) {
    const pagePath = `/${file}`;
    const llms = file.endsWith("llms.txt");
    const absolute = llms || production;
    const origin = llms ? llmsOrigin : SITE_ORIGIN;
    const candidates = [...markdownLinks(text), ...(absolute ? siteUrls(text, origin) : [])];
    const seen = new Set<string>();
    for (const { line, target } of candidates) {
      const isAbsolute = /^https?:/i.test(target);
      if (isAbsolute && !absolute) continue;
      const p = linkPath(target, pagePath, origin);
      if (p === null || seen.has(`${line}:${p}`)) continue;
      seen.add(`${line}:${p}`);
      checked++;
      if (served(p, files)) continue;
      if (!production && PREVIEW_ONLY.test(p)) {
        previewOnly++;
        continue;
      }
      problems.push({ file, line, message: `link to ${target} has no built target` });
    }
  }
  return { problems, checked, previewOnly };
}

/** Sitemap pages without a markdown twin (`<path>.md`; `index.md` for the root). */
export function missingTwins(sitemapPaths: string[], files: Set<string>): Problem[] {
  return sitemapPaths
    .map((p) => p.replace(/^\/+|\/+$/g, ""))
    .filter((p) => !files.has(p ? `${p}.md` : "index.md"))
    .map((p) => ({ file: "sitemap.xml", message: `/${p} has no markdown twin` }));
}

/**
 * Start here entries missing from the first `within` lines of llms.txt. Their targets are checked
 * with every other llms.txt link (brokenLinks).
 */
export function startHereProblems(llms: string, expected: { title: string; url: string }[], within = 40): Problem[] {
  const lines = llms.split("\n").slice(0, within);
  const at = lines.indexOf("## Start here");
  if (at === -1) return [{ file: "llms.txt", message: `no "## Start here" section in the first ${within} lines` }];
  const next = lines.findIndex((line, i) => i > at && line.startsWith("## "));
  const section = lines.slice(at, next === -1 ? undefined : next);
  return expected
    .filter(({ url }) => !section.some((line) => line.includes(`](${url})`)))
    .map(({ title, url }) => ({ file: "llms.txt", message: `Start here lacks ${title} (${url}) in its first ${within} lines` }));
}

/** Lines of fenced code ending in a `\` continuation that a blank line then cuts off. */
export function splitContinuations(markdown: string): number[] {
  const lines = markdown.split("\n");
  const hits: number[] = [];
  let fence = "";
  lines.forEach((line, i) => {
    const open = FENCE.exec(line)?.[1];
    if (fence) {
      if (open && open[0] === fence[0] && open.length >= fence.length && !line.trim().slice(open.length)) fence = "";
      else if (/\\$/.test(line) && lines[i + 1]?.trim() === "") hits.push(i + 1);
    } else if (open) fence = open;
  });
  return hits;
}

export const sitemapPaths = (xml: string) =>
  [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);

function walk(dir: string, root = dir, out = new Set<string>()): Set<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, root, out);
    else out.add(path.relative(root, full).split(path.sep).join("/"));
  }
  return out;
}

export function main(buildDir: string, env = process.env): number {
  const files = walk(buildDir);
  const production = env.CONTEXT === "production";
  const llmsOrigin: string = siteUrl.llmsSiteUrl(env);
  const config = (name: string) => JSON.parse(fs.readFileSync(new URL(`../${name}_version_config.json`, import.meta.url), "utf8"));
  const instances = networkDocs.docsInstances(config("developer"), config("network"), production);
  const read = (f: string) => fs.readFileSync(path.join(buildDir, f), "utf8");
  const pages = [...files]
    .filter((f) => f.endsWith(".md") || f.endsWith("llms.txt"))
    .sort()
    .map((file) => ({ file, text: read(file) }));

  const { problems, checked, previewOnly } = brokenLinks(pages, files, { production, llmsOrigin });
  problems.push(...missingTwins(sitemapPaths(read("sitemap.xml")), files));
  problems.push(...startHereProblems(read("llms.txt"), networkDocs.startHereLinks(instances, llmsOrigin)));
  for (const { file, text } of pages) {
    for (const line of splitContinuations(text)) {
      problems.push({ file, line, message: "a blank line splits this `\\` continuation" });
    }
  }

  for (const { file, line, message } of problems) console.log(`${file}${line ? `:${line}` : ""}: ${message}`);
  const layout = production ? "production" : "non-production";
  console.log(
    `agent readiness: ${pages.length} markdown and llms.txt files (${layout} layout), ${checked} site links, ${problems.length} problems` +
      (previewOnly ? `; ${previewOnly} links into a preview-only API folder this build lacks` : ""),
  );
  return problems.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  const buildDir = process.argv[2];
  if (!buildDir) {
    console.error("usage: node scripts/check_agent_readiness.mts <build-dir>");
    process.exit(2);
  }
  process.exitCode = main(path.resolve(buildDir));
}
