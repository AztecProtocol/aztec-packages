const { describe, it } = require("node:test");
const assert = require("node:assert");
const { processConditionalBlocks } = require("../conditional_content");

describe("processConditionalBlocks", () => {
  const process = (content, releaseType) =>
    processConditionalBlocks(content, releaseType, "test.md");

  describe("basic conditional structures", () => {
    it("#if/#endif - includes content when matched", () => {
      const content = `Before\n#if(devnet)\nDevnet\n#endif\nAfter`;
      assert.strictEqual(process(content, "devnet"), "Before\nDevnet\nAfter");
    });

    it("#if/#endif - excludes content when not matched", () => {
      const content = `Before\n#if(devnet)\nDevnet\n#endif\nAfter`;
      assert.strictEqual(process(content, "testnet"), "Before\n\nAfter");
    });

    it("#if/#else/#endif - uses if branch when matched", () => {
      const content = `#if(devnet)\nDevnet\n#else\nOther\n#endif`;
      assert.strictEqual(process(content, "devnet"), "Devnet");
    });

    it("#if/#else/#endif - uses else branch when not matched", () => {
      const content = `#if(devnet)\nDevnet\n#else\nOther\n#endif`;
      assert.strictEqual(process(content, "testnet"), "Other");
    });

    it("#if/#elif/#endif - matches correct branch", () => {
      const content = `#if(nightly)\nNightly\n#elif(devnet)\nDevnet\n#elif(testnet)\nTestnet\n#endif`;
      assert.strictEqual(process(content, "devnet"), "Devnet");
      assert.strictEqual(process(content, "testnet"), "Testnet");
      assert.strictEqual(process(content, "mainnet"), "");
    });

    it("#if/#elif/#else/#endif - falls through to else", () => {
      const content = `#if(nightly)\nNightly\n#elif(devnet)\nDevnet\n#else\nDefault\n#endif`;
      assert.strictEqual(process(content, "nightly"), "Nightly");
      assert.strictEqual(process(content, "devnet"), "Devnet");
      assert.strictEqual(process(content, "testnet"), "Default");
    });
  });

  describe("mainnet/ignition aliasing", () => {
    it("mainnet condition matches ignition release type", () => {
      const content = `#if(mainnet)\nMainnet content\n#endif`;
      assert.strictEqual(process(content, "ignition"), "Mainnet content");
    });

    it("ignition condition matches mainnet release type", () => {
      const content = `#if(ignition)\nIgnition content\n#endif`;
      assert.strictEqual(process(content, "mainnet"), "Ignition content");
    });
  });

  describe("content preservation", () => {
    it("handles JSON with nested braces", () => {
      const content = `#if(devnet)\n\`\`\`json\n{"nested": {"a": 1}}\n\`\`\`\n#endif`;
      assert.ok(process(content, "devnet").includes('{"nested": {"a": 1}}'));
    });

    it("handles code blocks with braces", () => {
      const content = `#if(devnet)\nfunction() { if (x) { y(); } }\n#endif`;
      assert.ok(process(content, "devnet").includes("if (x) { y(); }"));
    });

    it("preserves internal newlines and indentation", () => {
      const content = `#if(devnet)\nLine 1\n\n  indented\n#endif`;
      assert.ok(process(content, "devnet").includes("Line 1\n\n  indented"));
    });

    it("preserves surrounding content", () => {
      const content = `Header\n#if(devnet)\nMiddle\n#endif\nFooter`;
      const result = process(content, "devnet");
      assert.ok(result.includes("Header") && result.includes("Middle") && result.includes("Footer"));
    });
  });

  describe("error handling", () => {
    it("throws on unknown condition", () => {
      assert.throws(() => process(`#if(unknown)\nX\n#endif`, "devnet"), /Unknown condition/);
    });

    it("throws on nested conditionals", () => {
      assert.throws(() => process(`#if(devnet)\n#if(nightly)\nX\n#endif\n#endif`, "devnet"), /Nested/);
    });

    it("leaves incomplete blocks unchanged", () => {
      const content = `#if(devnet)\nNo endif`;
      assert.strictEqual(process(content, "devnet"), content);
    });
  });
});
