import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { BASELINE_FILE, type Baseline, countSuppressions, isRule, parseDirectives, pinnedBiome } from "../biome_baseline.mts";

// Built from parts, so this file holds no directive the count would find.
const IGNORE = "biome-" + "ignore";

test("directives are read wherever Biome reads them, with every rule they name, but not range ends", () => {
  const source = [
    `// ${IGNORE} lint/a/b: line`,
    `const x = 1; // ${IGNORE} lint/a/c: after code`,
    `/* ${IGNORE}-all lint/a/b lint/c/d: two rules */`,
    `/** ${IGNORE} lint/a/d: jsdoc */`,
    "/**",
    " * Text first.",
    `\u3000* ${IGNORE} lint/a/e: a later line indented with Unicode whitespace`,
    ` ${IGNORE} lint/a/f: a later line without a star */`,
    `{/* ${IGNORE}-start lint/e/f: a range */}`,
    `// ${IGNORE}-end lint/e/f: a range`,
    `//\u00a0${IGNORE}\u2003lint/a/g: Unicode whitespace, which Biome trims too`,
    `/* ${IGNORE}\u2028lint/a/h: a line separator, which Biome accepts after the form */`,
    `/* Text first. ${IGNORE} lint/x/y: Biome ignores this one */`,
    `const s = "${IGNORE} lint/x/z: not at the start of a comment";`,
  ].join("\n");
  assert.deepEqual(parseDirectives(source), [
    { form: IGNORE, categories: ["lint/a/b"] },
    { form: IGNORE, categories: ["lint/a/c"] },
    { form: `${IGNORE}-all`, categories: ["lint/a/b", "lint/c/d"] },
    { form: IGNORE, categories: ["lint/a/d"] },
    { form: IGNORE, categories: ["lint/a/e"] },
    { form: IGNORE, categories: ["lint/a/f"] },
    { form: `${IGNORE}-start`, categories: ["lint/e/f"] },
    { form: IGNORE, categories: ["lint/a/g"] },
    { form: IGNORE, categories: ["lint/a/h"] },
  ]);
  assert.deepEqual(["lint/complexity/noExcessiveCognitiveComplexity", "lint/complexity", "lint"].map(isRule), [true, false, false]);
});

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: baselined 2026-11-12: predates the complexity budget
test("the Biome suppressions in the tree are exactly biome-baseline.json's, for the Biome version package.json pins", () => {
  const baseline: Baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, "utf8"));
  assert.equal(
    baseline.biome,
    pinnedBiome(),
    "biome-baseline.json was written for another Biome: run `node scripts/biome_baseline.mts write` and review what changed",
  );
  const actual = countSuppressions();
  const problems: string[] = [];
  for (const key of new Set([...Object.keys(actual), ...Object.keys(baseline.suppressions)])) {
    const files = new Set([...Object.keys(actual[key] ?? {}), ...Object.keys(baseline.suppressions[key] ?? {})]);
    for (const file of files) {
      const found = actual[key]?.[file] ?? 0;
      const allowed = baseline.suppressions[key]?.[file] ?? 0;
      if (found && !isRule(key.split(" ")[1])) problems.push(`${file}: \`${key}\` hides more than one rule; name the rule (lint/<group>/<rule>)`);
      else if (found > allowed) problems.push(`${file}: ${found} \`${key}\`, the baseline allows ${allowed}; fix the finding instead (the baseline only shrinks)`);
      else if (found < allowed) problems.push(`${file}: ${found} \`${key}\`, the baseline records ${allowed}; lower it with \`node scripts/biome_baseline.mts write\``);
    }
  }
  assert.deepEqual(problems, []);
});
