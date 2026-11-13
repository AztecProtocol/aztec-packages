import assert from "node:assert/strict";
import { test } from "node:test";
import fences from "../../src/markdown_fences.js";

const fenced = (text: string) => fences.fencedLines(text.split("\n")).map(Number).join("");

test("fencedLines follows CommonMark openers and closers", () => {
  assert.equal(fenced("```ts new Wallet() ```\n### ZWallet"), "00");
  assert.equal(fenced("````md\n```\ninner\n```\n````\nafter"), "111110");
  assert.equal(fenced("~~~\n```\n~~~ \nafter"), "1110");
  assert.equal(fenced("1. Run:\n\n    ```bash\n    a \\\n    ```\nafter"), "001110");
});

test("fenceBlocks splits back-to-back fences and strips the opener's indentation", () => {
  const text = "```bash title=\"a\"\nls\n```\n```toml\nx = 1\n```\n1. Run:\n\n    ```sh\n    a \\\n      b\n    ```\n~~~\nopen";
  assert.deepEqual(fences.fenceBlocks(text.split("\n")), [
    { line: 1, info: 'bash title="a"', body: ["ls"] },
    { line: 4, info: "toml", body: ["x = 1"] },
    { line: 9, info: "sh", body: ["a \\", "  b"] },
    { line: 13, info: "", body: ["open"] },
  ]);
});
