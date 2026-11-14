import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import {
  classList,
  codeBlockTexts,
  dropdownLinks,
  expectedSections,
  type FooterColumn,
  footerLinks,
  hasFooter,
  hasSearchTrigger,
  MATH_PAGES,
  main,
  type Model,
  pageUrl,
} from "../check_built_site.mts";

// Shaped like the minified markup of a real build: unquoted attributes where the minifier can drop quotes.
const dropdown = (links: string) =>
  `<div class="navbar__item dropdown dropdown--hoverable dropdown--right"><a aria-current=page class="navbar__link active" role=button href=/operate/x>dev</a><ul class=dropdown__menu>${links}</ul></div>`;
const resources =
  '<div class="navbar__item dropdown dropdown--hoverable dropdown--right"><a href=# class=navbar__link>Resources</a><ul class=dropdown__menu>' +
  '<li><a class="dropdown__link no-external-icon" href=/developers/ai_tooling>AI Tooling</a><li><a href=https://forum.aztec.network target=_blank class=dropdown__link>Forum</a></ul></div>';
const search = '<button type=button class=trigger_m_iV aria-label="Search (Ctrl+K)" aria-haspopup=dialog>';
const footerColumns: FooterColumn[] = [
  { title: "Docs", items: [{ label: "Introduction", to: "/" }, { label: "Aztec.nr", href: "https://github.com/aztec-labs-eng/aztec-nr" }] },
  { title: "Community", items: [{ label: "Forum", href: "https://forum.aztec.network" }] },
];
const icon = "<svg width=13.5 height=13.5 aria-hidden=true class=externalLinkIcon_x1yZ><use href=#theme-svg-external-link /></svg>";
const footer =
  '<footer class="footer footer--dark"><div class=container><form class=subscriptionForm_ymif><button type=submit disabled><svg width=20 height=20><path d="M5 12h14"/></svg></button></form>' +
  '<div class="row footer__links"><div class="col footer__col"><div class=footer__title>Docs</div><ul class="footer__items clean-list">' +
  `<li class=footer__item><a class=footer__link-item href=/>Introduction</a><li class=footer__item><a class=footer__link-item href=https://github.com/aztec-labs-eng/aztec-nr>Aztec.nr${icon}</a></ul></div>` +
  `<div class="col footer__col"><div class=footer__title>Community</div><ul class="footer__items clean-list"><li class=footer__item><a class=footer__link-item href=https://forum.aztec.network>Forum${icon}</a></ul></div></div>` +
  '<div class="footer__bottom text--center"><div class=footer__copyright>© <!-- -->2026<!-- --> Aztec Labs.</div></div></div></footer>';

test("dropdownLinks reads the items of the dropdown that offers the page, in any attribute order and quoting", () => {
  const html =
    resources +
    dropdown(
      '<li><a aria-current=page class="dropdown__link dropdown__link--active" href=/operate/x>dev</a>' +
        "<li><a href='/operate/alpha/x' class=dropdown__link>Tierra (v6.0.0)</a>" +
        '<li><a class=dropdown__link href="/operate/v5.2.0/x?a=1&amp;b=2">v5.2.0</a>',
    );
  assert.deepEqual(dropdownLinks(html, "/operate/x"), ["/operate/x", "/operate/alpha/x", "/operate/v5.2.0/x?a=1&b=2"]);
  assert.equal(dropdownLinks(resources, "/operate/x"), null);
  assert.equal(dropdownLinks("<nav></nav>", "/operate/x"), null);
});

test("codeBlockTexts joins a block's highlighted spans and decodes entities", () => {
  const html =
    '<p>{{NOT_CODE}}</p><pre tabindex=0 class="prism-code language-bash"><code><div class=token-line><span class="token plain"># Data & Keys</span><br/></div>' +
    '<div class=token-line><span class="token plain">ETHEREUM_HOSTS=</span><span class=token>{{</span><span>ETH_RPC}}</span> &lt;url&gt; &#x27;q&#39;</div></code></pre>';
  assert.deepEqual(codeBlockTexts(html), ["# Data & KeysETHEREUM_HOSTS={{ETH_RPC}} <url> 'q'"]);
  assert.deepEqual(codeBlockTexts("<p>no code</p>"), []);
});

test("classList, hasFooter and hasSearchTrigger read attribute values, not text", () => {
  assert.deepEqual(classList('<div id=a class="x  y">'), ["x", "y"]);
  assert.deepEqual(classList("<div class=x>"), ["x"]);
  assert.equal(hasFooter(footer), true);
  assert.equal(hasFooter('<footer class="theme-doc-footer docusaurus-mt-lg"></footer>'), false);
  assert.equal(hasFooter('<div class="footer">'), false);
  assert.equal(hasSearchTrigger(search), true);
  assert.equal(hasSearchTrigger('<p>aria-label="Search (Ctrl+K)"</p>'), false);
});

test("footerLinks reads every link of the site footer in order, under its column, and skips the doc footer", () => {
  const docFooter = '<footer class="theme-doc-footer docusaurus-mt-lg"><a href=/edit>Edit this page</a></footer>';
  assert.deepEqual(footerLinks(docFooter + footer), [
    { title: "Docs", label: "Introduction", href: "/" },
    { title: "Docs", label: "Aztec.nr", href: "https://github.com/aztec-labs-eng/aztec-nr" },
    { title: "Community", label: "Forum", href: "https://forum.aztec.network" },
  ]);
  const unclassed = footer.replace("</ul></div></div>", "<li><a href=https://example.com/x>X &amp; Y</a></ul></div></div>");
  assert.deepEqual(footerLinks(unclassed).at(-1), { title: "Community", label: "X & Y", href: "https://example.com/x" });
  assert.deepEqual(footerLinks("<main></main>"), []);
});

test("expectedSections follows the layout model: production drops the dev docs and lines and moves operate's release to its root", () => {
  const configs = { developer: { mainnet: "v6.0.0", testnet: "v6.0.0" }, network: { mainnet: "v6.0.0", testnet: "v6.0.0" } };
  const cut = { developer: ["v6.0.0", "v5.2.0"], network: ["v6.0.0", "v5.2.0"] };
  const urls = (production: boolean) =>
    expectedSections({ configs, cut, lines: ["v6"], production, footer: [] }).map(({ base, rootUrl, urls }) => ({ base, rootUrl, urls }));
  assert.deepEqual(urls(true), [
    { base: "developers", rootUrl: "/developers/overview", urls: ["/developers/overview", "/developers/v5.2.0/overview"] },
    {
      base: "operate",
      rootUrl: "/operate/operators/solo-sequencer/configure-environment",
      urls: ["/operate/operators/solo-sequencer/configure-environment", "/operate/v5.2.0/operators/solo-sequencer/configure-environment"],
    },
  ]);
  const preview = urls(false);
  assert.deepEqual(preview[0].urls, ["/developers/overview", "/developers/dev/overview", "/developers/v5.2.0/overview"]);
  assert.deepEqual(preview[1].urls, [
    "/operate/alpha/operators/solo-sequencer/configure-environment",
    "/operate/operators/solo-sequencer/configure-environment",
    "/operate/v5.2.0/operators/solo-sequencer/configure-environment",
  ]);
  assert.deepEqual(
    preview.slice(2).map(({ base, rootUrl, urls }) => ({ base, rootUrl, urls })),
    [
      { base: "developers-v6", rootUrl: null, urls: ["/developers-v6/overview"] },
      { base: "operate-v6", rootUrl: null, urls: ["/operate-v6/operators/solo-sequencer/configure-environment"] },
    ],
  );
  assert.equal(pageUrl("operate", "", "operators/x"), "/operate/operators/x");
});

const fixtures: string[] = [];
after(() => {
  for (const dir of fixtures) fs.rmSync(dir, { recursive: true, force: true });
});

/** A minimal production-layout build that passes, so each test below breaks exactly one thing. */
function fixtureBuild(): { dir: string; write: (url: string, html: string) => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "built-site-"));
  fixtures.push(dir);
  const write = (url: string, html: string) => {
    const file = path.join(dir, url === "/" ? "index.html" : `${url.slice(1)}.html`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, html);
  };
  const shell = (body: string) => `<nav>${search}${body}</nav><main></main>${footer}`;
  const devLinks = ["/developers/overview", "/developers/v5.2.0/overview"];
  const opPage = "operators/solo-sequencer/configure-environment";
  const opLinks = [`/operate/${opPage}`, `/operate/v5.2.0/${opPage}`];
  const items = (links: string[]) => links.map((l) => `<li><a class=dropdown__link href=${l}>v</a>`).join("");
  for (const url of ["/", "/404", "/participate", "/developers/v5.2.0/overview"]) write(url, shell(""));
  write("/developers/overview", shell(dropdown(items(devLinks))));
  const config = '<pre class=prism-code><code><span>ETHEREUM_HOSTS={{ETH_RPC}}</span></code></pre>';
  write(`/operate/${opPage}`, shell(dropdown(items(opLinks))) + config);
  write(`/operate/v5.2.0/${opPage}`, shell("") + config);
  for (const v of ["", "v5.2.0/"]) write(`/operate/${v}operators/solo-sequencer/install-toolchain`, shell("") + "<code>v6.0.0</code>");
  for (const page of MATH_PAGES) write(`/developers/${page}`, shell("") + math);
  return { dir, write };
}
const math = "<p>rollup <span class=katex><span class=katex-html aria-hidden=true>n</span></span></p>";

const model: Model = {
  configs: { developer: { mainnet: "v6.0.0" }, network: { mainnet: "v6.0.0" } },
  cut: { developer: ["v6.0.0", "v5.2.0"], network: ["v6.0.0", "v5.2.0"] },
  lines: ["v6"],
  production: true,
  footer: footerColumns,
};

function run(dir: string, layout: Model = model): { code: number; out: string } {
  const lines: string[] = [];
  const code = main(dir, layout, (line: string) => lines.push(line));
  return { code, out: lines.join("\n") };
}

test("main passes a healthy build and names each regression it is for", () => {
  const healthy = run(fixtureBuild().dir);
  assert.equal(healthy.code, 0, healthy.out);
  assert.match(healthy.out, /^built site: 9 pages, 0 problems \(production layout\)/);

  const breaks: [string, (b: ReturnType<typeof fixtureBuild>) => void, RegExp][] = [
    ["missing version", (b) => fs.rmSync(path.join(b.dir, "developers/v5.2.0"), { recursive: true }), /\/developers\/v5\.2\.0\/overview: missing/],
    ["dev docs in production", (b) => b.write("/developers/dev/overview", ""), /developers\/dev: served by production/],
    ["dev line in production", (b) => b.write("/operate-v6/x", ""), /operate-v6: served by production/],
    [
      "dropdown drops a version",
      (b) => b.write("/developers/overview", `<nav>${search}${dropdown("<li><a class=dropdown__link href=/developers/overview>v</a>")}</nav>${footer}`),
      /version menu on \/developers\/overview links \[\/developers\/overview\], expected \[\/developers\/overview, \/developers\/v5\.2\.0\/overview\]/,
    ],
    [
      "empty command template",
      (b) => b.write("/operate/v5.2.0/operators/solo-sequencer/configure-environment", `<nav>${search}</nav><pre class=prism-code></pre>${footer}`),
      /configure-environment: no code block holds a \{\{TOKEN\}\} template/,
    ],
    [
      "stale recommended version",
      (b) => b.write("/operate/operators/solo-sequencer/install-toolchain", `<nav>${search}</nav><code>v5.2.0</code>${footer}`),
      /install-toolchain: no <code>v6\.0\.0<\/code>/,
    ],
    ["search bar gone", (b) => b.write("/404", `<nav></nav>${footer}`), /\/404: no search button/],
    ["footer gone", (b) => b.write("/participate", `<nav>${search}</nav>`), /\/participate: no site footer/],
    [
      "footer link changed",
      (b) => b.write("/participate", `<nav>${search}</nav>${footer.replace("href=https://forum.aztec.network", "href=https://forum.example")}`),
      /\/participate: footer links \[.*Community: Forum https:\/\/forum\.example\], expected/,
    ],
    ["math outside MATH_PAGES", (b) => b.write("/participate/get-started", `<nav>${search}</nav>${math}${footer}`), /\/participate\/get-started: renders math/],
    [
      "stale MATH_PAGES entry",
      (b) => fs.rmSync(path.join(b.dir, `developers/${MATH_PAGES[1]}.html`)),
      /MATH_PAGES docs\/foundational-topics\/ethereum-aztec-messaging: no built page renders math there/,
    ],
  ];
  for (const [name, breakIt, expected] of breaks) {
    const b = fixtureBuild();
    breakIt(b);
    const { code, out } = run(b.dir);
    assert.equal(code, 1, name);
    assert.match(out, expected, name);
    assert.match(out, /1 problems/, name);
  }
});

test("a layout with one version needs the plain navbar link the menu then renders as", () => {
  const b = fixtureBuild();
  fs.rmSync(path.join(b.dir, "developers/v5.2.0"), { recursive: true });
  fs.rmSync(path.join(b.dir, "operate/v5.2.0"), { recursive: true });
  const op = "/operate/operators/solo-sequencer/configure-environment";
  const shell = (href: string) => `<nav>${search}<a class="navbar__item navbar__link" href=${href}>Tierra (v6.0.0)</a></nav>${footer}`;
  b.write("/developers/overview", shell("/developers/overview"));
  b.write(op, `${shell(op)}<pre><code>{{ETH_RPC}}</code></pre>`);
  const single = { ...model, cut: { developer: ["v6.0.0"], network: ["v6.0.0"] } };
  assert.equal(run(b.dir, single).code, 0, run(b.dir, single).out);
  b.write(op, `${shell("/operate/v5.2.0/operators")}<pre><code>{{ETH_RPC}}</code></pre>`);
  assert.match(run(b.dir, single).out, /version link on \/operate\/operators\/solo-sequencer\/configure-environment: none links this page/);
});
