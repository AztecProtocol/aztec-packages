// Writes a markdown sibling (x.html → x.md) for every page of each Aztec.nr API reference folder
// a network reads, in a built site. The pages are nargo doc output: the sidebar repeats the whole
// module on every page, signatures sit in <code class="code-header"> outside any <pre>, and code
// blocks carry no language, so a generic HTML-to-markdown pass loses the signatures.

import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { select } from "hast-util-select";
import { toString } from "hast-util-to-string";
import rehypeParse from "rehype-parse";
import rehypeRemark from "rehype-remark";
import remarkGfm from "remark-gfm";
import remarkStringify from "remark-stringify";
import { unified } from "unified";

const require = createRequire(import.meta.url);
const { apiReferenceDirs, docsInstances } = require("../src/network_docs.js");
const { llmsSiteUrl } = require("../src/site_url.js");

const parser = unified().use(rehypeParse);
const toMarkdown = unified()
  .use(rehypeRemark)
  .use(remarkGfm)
  .use(remarkStringify, { bullet: "-", fences: true, rule: "-" });

const element = (tagName, properties, children) => ({ type: "element", tagName, properties, children });
const text = (value) => ({ type: "text", value });
const classes = (node) => [].concat(node.properties?.className ?? []);
const isElement = (node, tag) => node?.type === "element" && (!tag || node.tagName === tag);

// Content a browser does not show: an agent should not read text a person cannot see.
function isHidden(node) {
  if (!isElement(node)) return node.type === "comment";
  const { hidden, ariaHidden, id, style } = node.properties ?? {};
  return (
    ["script", "style", "template", "button", "input"].includes(node.tagName) ||
    hidden != null ||
    String(ariaHidden) === "true" ||
    String(id ?? "").startsWith("search-") ||
    /display\s*:\s*none/i.test(String(style ?? ""))
  );
}

const fence = (code, language = "language-rust") => element("pre", {}, [element("code", { className: [language] }, [text(code)])]);

/**
 * The root-relative markdown target of a link on `pagePath`, or null for a link to drop (no target,
 * or a scheme other than http(s)). Links leaving `folder` keep their path.
 */
function markdownHref(href, pagePath, folder) {
  if (href.startsWith("#")) return href;
  let url;
  try {
    url = new URL(href, `https://page.invalid${pagePath}`);
  } catch {
    return null;
  }
  if (!href || !["http:", "https:"].includes(url.protocol)) return null;
  if (url.host !== "page.invalid") return href;
  let target = url.pathname;
  if (target.startsWith(folder)) target = target.replace(/\/$/, "/index.html").replace(/\.html$/, ".md");
  return target + url.hash;
}

function rewrite(node, context) {
  node.children = node.children.flatMap((child) => {
    if (isHidden(child)) return [];
    if (!isElement(child)) return [child];
    // A signature: impl headers sit in an <h3>, method and field signatures beside their docs.
    const header = isElement(child, "h3") && child.children.find((c) => isElement(c, "code") && classes(c).includes("code-header"));
    if (header || (isElement(child, "code") && classes(child).includes("code-header"))) {
      return [fence(toString(header || child).trim())];
    }
    if (isElement(child, "pre")) {
      const code = child.children.find((c) => isElement(c, "code")) ?? child;
      const language = classes(code).find((c) => c.startsWith("language-"));
      return [fence(toString(code).replace(/\n$/, ""), language)];
    }
    if (isElement(child, "a")) {
      const href = markdownHref(String(child.properties?.href ?? ""), context.pagePath, context.folder);
      rewrite(child, context);
      if (href === null) return child.children;
      child.properties = { href };
      return [child];
    }
    rewrite(child, context);
    // A module's item list: one line per item, "name: description".
    if (isElement(child, "li")) {
      const [name, description] = ["item-name", "item-description"].map((c) =>
        child.children.find((d) => isElement(d, "div") && classes(d).includes(c)),
      );
      if (name) {
        const words = (description?.children ?? []).flatMap((d) => (isElement(d, "p") ? d.children : [d]));
        child.children = [...name.children, ...(toString(description ?? text("")).trim() ? [text(": "), ...words] : [])];
      }
    }
    return [child];
  });
}

/**
 * Converts one nargo doc page to markdown: the banner, the page title, a `Module:` line from the
 * breadcrumb, then the page content with every signature and code block as a fenced block (`rust`
 * unless the page names another language) and links as root-relative `.md` paths.
 *
 * @param {string} html the page
 * @param {{pagePath: string, folder: string, banner: string}} options `pagePath` is the page's URL
 *   path (`/aztec-nr-api/mainnet/noir_aztec/index.html`), `folder` its reference folder's
 *   (`/aztec-nr-api/mainnet/`), `banner` the line that opens the page
 * @returns {string | null} null for a page without nargo doc's <main>
 */
export function convertRustdocPage(html, { pagePath, folder, banner }) {
  const body = select("main", parser.parse(html));
  const content = body && select("#page-content", body);
  if (!content) return null;
  const title = toString(select("h1", body) ?? text("")).trim();
  const crumbs = body.children.find((c) => isElement(c, "div") && !classes(c).length);
  const module = crumbs ? toString(crumbs).split(" - ").slice(1).join(" - ").trim() : "";
  const context = { pagePath, folder };
  rewrite(content, context);
  const page = element("div", {}, [
    element("h1", {}, [text(title)]),
    ...(module ? [element("p", {}, [text("Module: "), element("code", {}, [text(module)])])] : []),
    ...content.children,
  ]);
  const markdown = toMarkdown.stringify(toMarkdown.runSync({ type: "root", children: [page] }));
  return `> ${banner}\n\n${unescapeIntraword(markdown).trim()}\n`;
}

// remark escapes every `_`, but CommonMark never reads a run of them between two alphanumerics as
// emphasis; unescaped, a search for `assert_current_call_valid_authwit` finds the title and lists.
function unescapeIntraword(markdown) {
  let code = false;
  return markdown
    .split("\n")
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) code = !code;
      return code ? line : line.replace(/(?<=[A-Za-z0-9])(?:\\_)+(?=[A-Za-z0-9])/g, (run) => run.replaceAll("\\", ""));
    })
    .join("\n");
}

function* htmlFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* htmlFiles(file);
    else if (entry.name.endsWith(".html")) yield file;
  }
}

/** Converts every Aztec.nr folder `apiReferenceDirs` lists under `buildDir`; returns the exit code. */
export function main(buildDir, env = process.env) {
  const config = (name) => JSON.parse(fs.readFileSync(new URL(`../${name}_version_config.json`, import.meta.url), "utf8"));
  const [developer] = docsInstances(config("developer"), config("network"), env.CONTEXT === "production");
  let failed = false;
  for (const { kind, dir, version, networks } of apiReferenceDirs(developer)) {
    if (kind !== "aztec-nr") continue;
    const root = path.join(buildDir, dir);
    if (!fs.existsSync(root)) {
      console.error(`aztec-nr markdown: ${dir} is not in the build`);
      failed = true;
      continue;
    }
    const started = process.hrtime.bigint();
    const banner = `Aztec.nr API reference, ${version} (${networks.join(" and ")}). Index: ${llmsSiteUrl(env)}/${dir}/llms.txt`;
    let pages = 0;
    let bytes = 0;
    for (const file of htmlFiles(root)) {
      const pagePath = `/${path.relative(buildDir, file).split(path.sep).join("/")}`;
      const markdown = convertRustdocPage(fs.readFileSync(file, "utf8"), { pagePath, folder: `/${dir}/`, banner });
      if (markdown === null) {
        console.error(`aztec-nr markdown: ${pagePath} has no nargo doc page content`);
        failed = true;
        continue;
      }
      fs.writeFileSync(file.replace(/\.html$/, ".md"), markdown);
      pages++;
      bytes += Buffer.byteLength(markdown);
    }
    const seconds = Number(process.hrtime.bigint() - started) / 1e9;
    console.log(`aztec-nr markdown: ${dir}: ${pages} pages, ${(bytes / 1e6).toFixed(1)} MB in ${seconds.toFixed(1)} s`);
  }
  return failed ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main(process.argv[2] ?? "build");
