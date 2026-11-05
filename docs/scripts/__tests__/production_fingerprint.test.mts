import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import zlib from "node:zlib";
import { fingerprint } from "../production_fingerprint.mts";

function build(bundle: string, href: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fingerprint-"));
  const write = (rel: string, data: string | Uint8Array) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), data);
  };
  write(
    "developers/page.html",
    `<link rel=stylesheet href=/assets/css/styles.${bundle}.css /><script src=/assets/js/main.${bundle}.js defer></script>` +
      `<script>window.chunk="runtime~main.${bundle}.js"</script><main><a href=${href}>Next</a></main>`,
  );
  write("developers/page.md", "# Page\n");
  write("sitemap.xml", "<urlset><url><loc>https://docs.aztec.network/developers/page</loc></url></urlset>");
  const fragment = { url: "/developers/page", filters: { docusaurus_tag: ["docs-developer-v6.0.0"] } };
  write("pagefind/fragment/en_1.pf_fragment", zlib.gzipSync(Buffer.from(`pagefind_dcd${JSON.stringify(fragment)}`)));
  return dir;
}

test("the fingerprint ignores bundle names and changes with a rendered link", () => {
  const dirs = [build("aaaaaaaa", "/developers/next"), build("bbbbbbbb", "/developers/next"), build("aaaaaaaa", "/operate/next")];
  try {
    const [base, rebundled, relinked] = dirs.map(fingerprint);
    assert.deepEqual(rebundled, base);
    assert.notDeepEqual(relinked, base);
    assert.ok(base.includes("sitemap /developers/page"));
    assert.ok(base.includes("search-tag docs-developer-v6.0.0 1"));
  } finally {
    for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
  }
});
