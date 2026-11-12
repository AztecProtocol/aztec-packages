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
