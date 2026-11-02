const { it } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

// Real nargo doc pages from the mainnet reference.
const fixture = (name) => fs.readFileSync(path.join(__dirname, "fixtures/aztec_nr", name), "utf8");
const folder = "/aztec-nr-api/mainnet/";
const banner = "Aztec.nr API reference, v6.0.0 (mainnet and testnet). Index: https://x/aztec-nr-api/mainnet/llms.txt";

async function convert(html, pagePath) {
  const { convertRustdocPage } = await import("../../scripts/aztec_nr_api_markdown.mjs");
  return convertRustdocPage(html, { pagePath: `${folder}${pagePath}`, folder, banner });
}

it("keeps a struct's method signatures, where-clauses and examples as rust blocks", async () => {
  const md = await convert(fixture("struct.PublicMutable.html"), "noir_aztec/state_vars/struct.PublicMutable.html");
  assert.ok(md.startsWith(`> ${banner}\n\n# Struct PublicMutable\n\nModule: \`noir_aztec::state_vars\`\n\n\`\`\`rust\npub struct PublicMutable<T, Context>\n`));
  assert.match(md, /```rust\nimpl<T> PublicMutable<T, PublicContext>\n```\n\n```rust\npub fn read\(self\) -> T\nwhere\n {4}T: Packable\n```/);
  assert.match(md, /```rust\n#\[storage\]\nstruct Storage<C> \{\n/);
  assert.match(md, /\[`Packable`\]\(\/aztec-nr-api\/mainnet\/protocol_types\/traits\/trait\.Packable\.md\)/);
  assert.match(md, /\[`write`\]\(\/aztec-nr-api\/mainnet\/noir_aztec\/state_vars\/struct\.PublicMutable\.md#write\)/);
  assert.doesNotMatch(md, /All items|In module state_vars|Search/);
});

it("keeps a function's whole signature and a trait's declaration", async () => {
  const fn = await convert(fixture("fn.assert_current_call_valid_authwit.html"), "noir_aztec/authwit/auth/fn.assert_current_call_valid_authwit.html");
  assert.match(fn, /^# Function assert_current_call_valid_authwit$/m);
  assert.match(fn, /```rust\npub fn assert_current_call_valid_authwit<let N: u32>\(\n {4}context: &mut PrivateContext,\n {4}on_behalf_of: AztecAddress,\n\)\n```/);
  const trait = await convert(fixture("trait.Packable.html"), "protocol_types/traits/trait.Packable.html");
  assert.match(trait, /```rust\npub trait Packable \{\n {4}let N: u32;\n\n {4}\/\/ Required methods\n {4}pub fn pack\(self\) -> \[Field; N\];/);
  assert.match(trait, /```rust\npub fn unpack\(packed: \[Field; N\]\) -> Self\n```/);
});

it("turns a module's tables and item lists into GFM tables and one line per item", async () => {
  const md = await convert(fixture("state_vars_index.html"), "noir_aztec/state_vars/index.html");
  assert.match(md, /^\| State Variable +\| Mutable\? +\|/m);
  assert.match(md, /^\| \[`PublicMutable`\]\(\/aztec-nr-api\/mainnet\/noir_aztec\/state_vars\/struct\.PublicMutable\.md\) +\| yes +\|/m);
  assert.match(md, /^- \[Map\]\(\/aztec-nr-api\/mainnet\/noir_aztec\/state_vars\/struct\.Map\.md\): A key-value container for state variables\.$/m);
});

it("drops hidden content and links without an http(s) target", async () => {
  const html = `<main><div><a href="../index.html">aztec-nr</a> - x</div><h1>Module x</h1><div id="page-content">
    <p>shown</p><p hidden>one</p><div aria-hidden="true">two</div><span style="display: none">three</span><!-- four -->
    <p><a href="javascript:alert(1)">js</a> <a href="">empty</a> <a href="https://noir-lang.org/docs">ext</a> <a href="../y/">dir</a></p>
  </div></main>`;
  const md = await convert(html, "x/index.html");
  assert.match(md, /shown/);
  assert.doesNotMatch(md, /one|two|three|four|javascript/);
  assert.match(md, /^js empty \[ext\]\(https:\/\/noir-lang\.org\/docs\) \[dir\]\(\/aztec-nr-api\/mainnet\/y\/index\.md\)$/m);
  assert.strictEqual(await convert("<p>not a nargo doc page</p>", "x.html"), null);
});
