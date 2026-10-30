const fs = require("node:fs");
const path = require("node:path");
const { EXCLUDE_SELECTORS, classifyPage, pageUrl, stampPage } = require("./pages");

function* htmlFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* htmlFiles(file);
    else if (entry.name.endsWith(".html")) yield file;
  }
}

/**
 * Writes a Pagefind index of the finished site to `<outDir>/pagefind`. Any page
 * Pagefind rejects fails the build; sitemap coverage is checked after the build
 * by `scripts/check_search_index.mts`, since `postBuild` hooks run concurrently.
 *
 * @param {{apiDirs: string[]}} options the Aztec.nr API trees to index
 */
module.exports = function pagefindPlugin(_context, { apiDirs }) {
  return {
    name: "pagefind",
    async postBuild({ outDir }) {
      const started = performance.now();
      const pagefind = await import("pagefind");
      const failures = [];
      let pages = 0;
      try {
        const { index, errors } = await pagefind.createIndex({
          forceLanguage: "en",
          excludeSelectors: EXCLUDE_SELECTORS,
        });
        failures.push(...errors);
        for (const file of failures.length ? [] : htmlFiles(outDir)) {
          const rel = path.relative(outDir, file).split(path.sep).join("/");
          const html = fs.readFileSync(file, "utf8");
          const page = classifyPage(rel, html, apiDirs);
          if (!page) continue;
          const content = stampPage(html, page);
          if (!content) {
            failures.push(`${rel}: no <${page.body}> element`);
            continue;
          }
          const added = await index.addHTMLFile({ url: pageUrl(rel), content });
          if (added.errors.length) failures.push(`${rel}: ${added.errors.join("; ")}`);
          else pages++;
        }
        if (!failures.length) {
          const written = await index.writeFiles({ outputPath: path.join(outDir, "pagefind") });
          failures.push(...written.errors);
        }
      } finally {
        await pagefind.close();
      }
      if (failures.length) throw new Error(`Pagefind indexing failed:\n${failures.join("\n")}`);
      const seconds = ((performance.now() - started) / 1000).toFixed(1);
      console.log(`[pagefind] Indexed ${pages} pages in ${seconds} s.`);
    },
  };
};
