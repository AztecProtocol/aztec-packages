const { it } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const rehypeCodeBlocks = require("../rehype_code_blocks");

// The llms plugin's conversion: rehype-parse, the "before" plugins, rehype-remark, remark-stringify.
async function toMarkdown(html) {
  const { unified } = await import("unified");
  const rehypeParse = (await import("rehype-parse")).default;
  const rehypeRemark = (await import("rehype-remark")).default;
  const remarkStringify = (await import("remark-stringify")).default;
  const processor = unified().use(rehypeParse, { fragment: true }).use(rehypeCodeBlocks).use(rehypeRemark).use(remarkStringify);
  return String(await processor.process(html));
}

// Real build output: the aztec.js install block and the first lines of an #include_code block.
const [install, titled] = fs.readFileSync(path.join(__dirname, "fixtures/code_blocks.html"), "utf8").trim().split("\n");

it("keeps one line per line and the language, so a \\ continuation survives", async () => {
  const md = await toMarkdown(install);
  assert.match(md, /^```bash\nnpm install @aztec-labs\/aztec\.js@6\.0\.0 \\\n {2}@aztec-labs\/accounts@6\.0\.0 \\\n/);
  assert.doesNotMatch(md, /\\\n\n/);
});

it("drops a snippet identifier title", async () => {
  const md = await toMarkdown(titled);
  assert.doesNotMatch(md, /connect/);
  assert.match(md, /^```typescript\nimport \{ createAztecNodeClient, waitForNode \} from "@aztec-labs\/aztec\.js\/node";\nimport /);
});

it("keeps a path title as a File: line and other titles as text", async () => {
  const withTitle = (title) => titled.replace(/(<div class=codeBlockTitle_\w+>)[^<]*/, `$1${title}`);
  assert.match(await toMarkdown(withTitle("src/main.nr")), /^File: `src\/main\.nr`\n\n```typescript\n/);
  assert.match(await toMarkdown(withTitle("Example output")), /^Example output\n\n```typescript\n/);
});

it("leaves a <pre> of another shape untouched", async () => {
  const html = '<div class="theme-code-block"><div><pre class="prism-code language-bash"><code><span>a</span></code></pre></div></div>';
  assert.strictEqual(await toMarkdown(html), "```\na\n```\n");
});
