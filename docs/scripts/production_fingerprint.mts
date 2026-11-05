// Prints what a production build serves as sorted lines, so two builds compare with diff: a hash of
// each page's HTML and markdown twin, the llms files, the sitemap paths, and the search index with
// its pages per tag. Any theme code change renames the bundles, so the HTML is hashed without them;
// its text, links and structured data stay.
//
//   node scripts/production_fingerprint.mts <build-dir>
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import zlib from "node:zlib";
import { sitemapPaths } from "./check_search_index.mts";

const sha256 = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");

/** `html` without `<link>` tags, `<script src>` tags and the content hashes in bundle names. */
export const normalizeHtml = (html: string) =>
  html
    .replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g, "")
    .replace(/<link\b[^>]*>/g, "")
    .replace(/\.[0-9a-f]{8}\.(js|css)\b/g, ".$1");

function* files(root: string, rel = ""): Generator<string> {
  for (const entry of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
    const file = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) yield* files(root, file);
    else yield file;
  }
}

// Pagefind writes these differently on two builds of the same tree. They are derived from the
// fragments, which hold each page's content and filters.
const UNSTABLE = /^pagefind\/(filter\/|pagefind-entry\.json$|pagefind\.[^/]+\.pf_meta$)/;

// A fragment is gzipped JSON behind a 12-byte `pagefind_dcd` signature.
const fragmentTags = (bytes: Uint8Array): string[] =>
  JSON.parse(zlib.gunzipSync(bytes).subarray(12).toString("utf8")).filters?.docusaurus_tag ?? [];

export function fingerprint(buildDir: string): string[] {
  const lines: string[] = [];
  const tags = new Map<string, number>();
  for (const rel of files(buildDir)) {
    const bytes = fs.readFileSync(path.join(buildDir, rel));
    if (rel.startsWith("pagefind/")) {
      if (!UNSTABLE.test(rel)) lines.push(`pagefind ${rel} ${sha256(bytes)}`);
      if (rel.endsWith(".pf_fragment"))
        for (const tag of fragmentTags(bytes)) tags.set(tag, (tags.get(tag) ?? 0) + 1);
    } else if (rel.endsWith(".html")) lines.push(`html ${rel} ${sha256(normalizeHtml(bytes.toString("utf8")))}`);
    else if (rel.endsWith(".md") || rel.endsWith(".txt")) lines.push(`text ${rel} ${sha256(bytes)}`);
    else if (rel === "sitemap.xml") for (const p of sitemapPaths(bytes.toString("utf8"))) lines.push(`sitemap ${p}`);
  }
  for (const [tag, count] of tags) lines.push(`search-tag ${tag} ${count}`);
  return lines.sort();
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [buildDir] = process.argv.slice(2);
  if (!buildDir) {
    console.error("usage: node scripts/production_fingerprint.mts <build-dir>");
    process.exit(2);
  }
  process.stdout.write(`${fingerprint(buildDir).join("\n")}\n`);
}
