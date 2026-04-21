#!/usr/bin/env node
/**
 * Generate clean per-page markdown for versioned docs.
 *
 * For each version listed in developer_version_config.json / network_version_config.json,
 * walks the corresponding versioned_docs tree and writes a sibling .md file under build/
 * at the URL the HTML page is served from. Consumers (LLMs, copy buttons, the acceptmarkdown.com
 * negotiation edge function) read these files instead of scraping rendered HTML.
 *
 * Transforms:
 *   - Strip frontmatter and ES-module imports (via docusaurus-plugin-llms helpers)
 *   - Resolve partial imports (_foo.mdx) inline
 *   - <Image img={require("@site/static/...")} /> -> ![](absolute /path)
 *   - <Tabs>/<TabItem label="X"> -> ## X heading flattening
 *   - <DocCardList/> -> dropped
 *   - <General.Foo/> / <Fees.Foo/> / <TopLevelSnippet/> -> rendered from
 *     src/components/Snippets/general_snippets.js via esbuild + react-dom/server
 *
 * Drift check: after transforms, any remaining <CapitalizedTag still in the output fails
 * the build so new MDX components surface immediately when a future version is cut.
 *
 * URL mapping:
 *   developer_versioned_docs/version-<mainnet>/foo.md -> build/developers/foo.md
 *   developer_versioned_docs/version-<testnet>/foo.md -> build/developers/testnet/foo.md
 *   network_versioned_docs/version-<mainnet>/foo.md  -> build/operate/foo.md
 *   network_versioned_docs/version-<testnet>/foo.md  -> build/operate/testnet/foo.md
 */

const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const esbuild = require("esbuild");
const matter = require("gray-matter");
const {
  resolvePartialImports,
  cleanMarkdownContent,
  readMarkdownFiles,
} = require("docusaurus-plugin-llms/lib/utils");

const DOCS_ROOT = path.join(__dirname, "..");
const BUILD_DIR = path.join(DOCS_ROOT, "build");
const DEVELOPER_VERSIONED_DOCS = path.join(DOCS_ROOT, "developer_versioned_docs");
const NETWORK_VERSIONED_DOCS = path.join(DOCS_ROOT, "network_versioned_docs");
const SNIPPETS_FILE = path.join(
  DOCS_ROOT,
  "src/components/Snippets/general_snippets.js"
);

// ---------------------------------------------------------------------------
// Snippet rendering: load general_snippets.js via esbuild, render components to HTML.
// ---------------------------------------------------------------------------
function loadSnippetsModule() {
  const source = fs.readFileSync(SNIPPETS_FILE, "utf8");
  const { code } = esbuild.transformSync(source, {
    loader: "jsx",
    format: "cjs",
    target: "node20",
  });
  const Module = require("module");
  const mod = new Module(SNIPPETS_FILE, module);
  mod.filename = SNIPPETS_FILE;
  mod.paths = Module._nodeModulePaths(path.dirname(SNIPPETS_FILE));
  mod._compile(code, SNIPPETS_FILE);
  return mod.exports;
}

function renderReactToHtml(element) {
  return ReactDOMServer.renderToStaticMarkup(element);
}

/**
 * Convert the small HTML subset produced by snippet components into markdown.
 * Snippets only use <p>, <span>, <b>, <code>, <a>, <ul>, <li>, <br/>.
 */
function snippetHtmlToMarkdown(html) {
  let out = html
    .replace(/<br\s*\/?>(\r?\n)?/gi, "\n")
    .replace(/<\/?p[^>]*>/gi, "\n\n")
    .replace(/<(b|strong)[^>]*>([\s\S]*?)<\/\1>/gi, "**$2**")
    .replace(/<(i|em)[^>]*>([\s\S]*?)<\/\1>/gi, "*$2*")
    .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, "`$1`")
    .replace(/<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)")
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "- $1\n")
    .replace(/<\/?(ul|ol|span)[^>]*>/gi, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Build a map of snippet-name -> rendered markdown.
 * Keys: "General.Foo", "Fees.Bar", "TopLevel" for default-exported components.
 */
function buildSnippetMap() {
  const snippets = loadSnippetsModule();
  const map = new Map();
  for (const [exportName, value] of Object.entries(snippets)) {
    if (typeof value === "function") {
      const html = renderReactToHtml(React.createElement(value));
      map.set(exportName, snippetHtmlToMarkdown(html));
    } else if (value && typeof value === "object") {
      for (const [subName, subValue] of Object.entries(value)) {
        if (typeof subValue === "function") {
          const html = renderReactToHtml(React.createElement(subValue));
          map.set(`${exportName}.${subName}`, snippetHtmlToMarkdown(html));
        }
      }
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// MDX transforms on doc content.
// ---------------------------------------------------------------------------

/**
 * @site/static/img/foo.png -> /img/foo.png
 * /img/foo.png stays the same.
 * Relative paths are preserved as-is; the image server (Netlify) resolves them via the
 * surrounding directory when the .md is fetched from /developers/<path>.md.
 */
function resolveImagePath(raw) {
  let p = raw.trim().replace(/^["']|["']$/g, "");
  p = p.replace(/^@site\/static/, "");
  if (!p.startsWith("/") && !p.startsWith("http")) {
    p = "/" + p.replace(/^\.\.?\//, "");
  }
  return p;
}

function transformImages(content) {
  // <Image ... img={require("PATH")} ... /> (possibly multi-line with extra attrs).
  return content.replace(
    /<Image\b[^>]*?img=\{require\(\s*["']([^"']+)["']\s*\)\}[^>]*?\/?>(?:\s*<\/Image>)?/gs,
    (_m, p) => `![](${resolveImagePath(p)})`
  );
}

function transformTabs(content) {
  // Flatten each <TabItem label="X"> to "## X" heading, drop surrounding <Tabs> wrapper.
  let out = content.replace(
    /<TabItem\s+([^>]*?)>/g,
    (_m, attrs) => {
      const labelMatch = attrs.match(/label=["']([^"']+)["']/);
      const label = labelMatch ? labelMatch[1] : "Tab";
      return `\n\n## ${label}\n\n`;
    }
  );
  out = out.replace(/<\/TabItem>/g, "\n\n");
  out = out.replace(/<Tabs[^>]*>/g, "");
  out = out.replace(/<\/Tabs>/g, "");
  return out;
}

function transformDocCardList(content) {
  return content.replace(/<DocCardList[^>]*\/>/g, "");
}

/**
 * Find file-local React component names exported via `export const Foo = ...`.
 * These are the MDX-specific JSX tags that only exist within the file; we can safely
 * strip self-closing calls and unwrap children from paired calls rather than trying to
 * execute them.
 */
function detectFileLocalComponents(rawSource) {
  const names = new Set();
  const exportRe = /^\s*export\s+const\s+([A-Z][A-Za-z0-9_]*)\s*=/gm;
  let m;
  while ((m = exportRe.exec(rawSource)) !== null) names.add(m[1]);
  return names;
}

/**
 * Strip all top-level `export const X = (...) => { ... };` arrow-function declarations.
 * In rendered HTML these are invisible (only referenced via JSX tags); in raw markdown
 * they just leak implementation into the reader's view.
 */
function stripExportedConstDeclarations(content) {
  return content.replace(
    /^\s*export\s+const\s+[A-Za-z_][\w]*\s*=[\s\S]*?^\};\s*$/gm,
    ""
  );
}

function transformFileLocalComponents(content, localNames) {
  let out = stripExportedConstDeclarations(content);
  for (const name of localNames) {
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`<${esc}\\b[^>]*?/>`, "g"), "");
    out = out.replace(
      new RegExp(`<${esc}\\b[^>]*?>([\\s\\S]*?)</${esc}>`, "g"),
      "$1"
    );
  }
  return out;
}

function transformSnippets(content, snippetMap) {
  // <General.node_ver />, <Fees.FPC />, <TopLevel />, <TopLevel/>
  // Second segment may be lowercase (e.g. General.node_ver).
  return content.replace(
    /<([A-Z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)?)\s*\/?>/g,
    (match, name) => {
      if (snippetMap.has(name)) {
        return "\n\n" + snippetMap.get(name) + "\n\n";
      }
      return match;
    }
  );
}

// ---------------------------------------------------------------------------
// Per-file processing.
// ---------------------------------------------------------------------------
const KNOWN_BENIGN_TAGS = new Set([
  // Tags that legitimately appear inside code blocks in the source. We strip code blocks
  // from the drift-check scan so these don't matter, but keep the list for documentation.
]);

/**
 * Remove fenced code blocks and inline code so we don't false-positive on things like
 * `<HashMap>` in Noir. Walks line-by-line tracking fence state since the file may contain
 * an odd number of fence markers across its history.
 */
function stripCodeBlocks(content) {
  const lines = content.split("\n");
  const out = [];
  let fence = null; // the exact marker that opened the current fence, or null
  for (const line of lines) {
    const trimmed = line.trimStart();
    if (fence) {
      if (trimmed.startsWith(fence)) {
        fence = null;
      }
      continue;
    }
    const fenceMatch = trimmed.match(/^(```+|~~~+)/);
    if (fenceMatch) {
      fence = fenceMatch[1];
      continue;
    }
    out.push(line.replace(/`[^`\n]*`/g, ""));
  }
  return out.join("\n");
}

function driftCheck(content, relativeSource) {
  const scanned = stripCodeBlocks(content);
  const leftoverRegex = /<([A-Z][A-Za-z0-9_.]*)\b/g;
  const leftovers = new Set();
  let m;
  while ((m = leftoverRegex.exec(scanned)) !== null) {
    leftovers.add(m[1]);
  }
  if (leftovers.size === 0) return;
  throw new Error(
    `Unhandled MDX components in ${relativeSource}: ${[...leftovers].join(", ")}. ` +
      `Add a transform in generate_markdown_variants.js.`
  );
}

async function transformFile(filePath, snippetMap) {
  const raw = await fsp.readFile(filePath, "utf8");
  const localComponents = detectFileLocalComponents(raw);
  const { content: withoutFrontmatter } = matter(raw);
  const withPartials = await resolvePartialImports(withoutFrontmatter, filePath);
  // cleanMarkdownContent with excludeImports strips `import ... from ...` lines.
  const stripped = cleanMarkdownContent(withPartials, true, false);
  let out = stripped;
  out = transformFileLocalComponents(out, localComponents);
  out = transformImages(out);
  out = transformTabs(out);
  out = transformDocCardList(out);
  out = transformSnippets(out, snippetMap);
  driftCheck(out, path.relative(DOCS_ROOT, filePath));
  return out.replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

// ---------------------------------------------------------------------------
// Version -> URL-prefix resolution.
// ---------------------------------------------------------------------------
function resolveVersionPrefixes(versionConfig) {
  // Matches docusaurus.config.js logic:
  //   mainnet version -> path: ""
  //   testnet version (if != mainnet) -> path: "testnet"
  // Returns [{ version, urlSegment }, ...] for versions that actually have a docs dir.
  const entries = [];
  const mainnet = versionConfig.mainnet || null;
  const testnet = versionConfig.testnet || null;
  if (mainnet) entries.push({ version: mainnet, urlSegment: "" });
  if (testnet && testnet !== mainnet) {
    entries.push({ version: testnet, urlSegment: "testnet" });
  }
  // Additional release types (devnet/nightly) currently only served in non-production;
  // skip them for markdown generation.
  return entries;
}

function outputPathFor(versionedDocsDir, versionDir, relativeInVersion, routePrefix, urlSegment) {
  // relativeInVersion e.g. "overview.md" or "docs/aztec-js/how_to_pay_fees.md".
  // Docusaurus serves these at `/${routePrefix}/${urlSegment ? urlSegment+"/" : ""}${slug}`.
  const slug = relativeInVersion.replace(/\.mdx?$/, "");
  const segments = [routePrefix];
  if (urlSegment) segments.push(urlSegment);
  segments.push(slug);
  const url = "/" + segments.filter(Boolean).join("/");
  return path.join(BUILD_DIR, url.slice(1) + ".md");
}

// ---------------------------------------------------------------------------
// Main.
// ---------------------------------------------------------------------------
async function processInstance({ instanceName, versionedDocsDir, routePrefix, versionConfig, snippetMap }) {
  if (!fs.existsSync(versionedDocsDir)) {
    console.log(`[markdown-variants] ${instanceName}: no versioned docs dir at ${versionedDocsDir}, skipping`);
    return { written: 0, skipped: 0 };
  }
  const prefixes = resolveVersionPrefixes(versionConfig);
  let written = 0;
  let skipped = 0;
  for (const { version, urlSegment } of prefixes) {
    const versionDir = path.join(versionedDocsDir, `version-${version}`);
    if (!fs.existsSync(versionDir)) {
      console.warn(`[markdown-variants] ${instanceName} ${version}: directory missing, skipping`);
      continue;
    }
    const files = await readMarkdownFiles(versionDir, versionDir, []);
    for (const filePath of files) {
      const relativeInVersion = path.relative(versionDir, filePath);
      const outPath = outputPathFor(versionedDocsDir, versionDir, relativeInVersion, routePrefix, urlSegment);
      try {
        const transformed = await transformFile(filePath, snippetMap);
        await fsp.mkdir(path.dirname(outPath), { recursive: true });
        await fsp.writeFile(outPath, transformed, "utf8");
        written++;
      } catch (err) {
        skipped++;
        console.error(
          `[markdown-variants] Failed to transform ${path.relative(DOCS_ROOT, filePath)}: ${err.message}`
        );
      }
    }
    console.log(
      `[markdown-variants] ${instanceName} ${version} -> /${routePrefix}${urlSegment ? "/" + urlSegment : ""}/ : ${files.length} files`
    );
  }
  return { written, skipped };
}

async function main() {
  if (!fs.existsSync(BUILD_DIR)) {
    console.error(
      `[markdown-variants] build/ not found at ${BUILD_DIR}; run 'docusaurus build' first`
    );
    process.exit(1);
  }
  const developerVersionConfig = require(path.join(
    DOCS_ROOT,
    "developer_version_config.json"
  ));
  const networkVersionConfig = require(path.join(
    DOCS_ROOT,
    "network_version_config.json"
  ));
  const snippetMap = buildSnippetMap();

  const dev = await processInstance({
    instanceName: "developer",
    versionedDocsDir: DEVELOPER_VERSIONED_DOCS,
    routePrefix: "developers",
    versionConfig: developerVersionConfig,
    snippetMap,
  });
  const net = await processInstance({
    instanceName: "operate",
    versionedDocsDir: NETWORK_VERSIONED_DOCS,
    routePrefix: "operate",
    versionConfig: networkVersionConfig,
    snippetMap,
  });

  const totalWritten = dev.written + net.written;
  const totalSkipped = dev.skipped + net.skipped;
  console.log(
    `[markdown-variants] wrote ${totalWritten} .md files; ${totalSkipped} failed`
  );
  if (totalSkipped > 0) process.exit(1);
}

main().catch((err) => {
  console.error("[markdown-variants] fatal:", err);
  process.exit(1);
});
