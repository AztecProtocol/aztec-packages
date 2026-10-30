import assert from "node:assert/strict";
import { test } from "node:test";
import { type Hit, rankOf, servedVersions, sitemapPaths } from "../check_search_index.mts";

test("sitemapPaths returns each location's path", () => {
  const xml =
    '<urlset><url><loc>https://docs.aztec.network/</loc></url>' +
    "<url><loc>https://docs.aztec.network/developers/v5.2.0/ai_tooling</loc></url></urlset>";
  assert.deepEqual(sitemapPaths(xml), ["/", "/developers/v5.2.0/ai_tooling"]);
});

test("rankOf matches the expected page by tag and whole path segments", () => {
  const hits: Hit[] = [
    { url: "/operate/operators/setup/running_a_node", tags: ["docs-network-v6.0.0"] },
    { url: "/operate/v5.2.0/operators/setup/not_running_a_node", tags: ["docs-network-v5.2.0"] },
    { url: "/operate/v5.2.0/operators/setup/running_a_node", tags: ["docs-network-v5.2.0"] },
  ];
  const paths = ["operators/setup/running_a_node"];
  assert.equal(rankOf(hits, "docs-network-v6.0.0", paths), 1);
  assert.equal(rankOf(hits, "docs-network-v5.2.0", paths), 3);
  assert.equal(rankOf(hits, "docs-network-current", paths), 0);
});

test("servedVersions reads the versioned doc sets from the index's tags", () => {
  assert.deepEqual(
    servedVersions({
      default: 1345,
      "docs-developer-current": 120,
      "docs-developer-v6.0.0": 124,
      "docs-network-current": 90,
      "docs-participate-current": 23,
    }),
    { developer: ["current", "v6.0.0"], network: ["current"] },
  );
});
