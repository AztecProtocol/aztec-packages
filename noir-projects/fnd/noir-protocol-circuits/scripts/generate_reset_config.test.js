// Run with: node --test scripts/generate_reset_config.test.js

const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const {
  artifactPath,
  buildConfig,
  parseCircuitSize,
  serialize,
} = require("./generate_reset_config.js");

const TARGET_DIR = path.resolve(__dirname, "../target");

const variants = {
  inner: [
    { name: "inner_sm", dimensions: [4, 4, 4, 4, 4, 4, 0, 0, 0] },
    { name: "inner_nhpr_overflow", dimensions: [64, 0, 0, 0, 0, 0, 0, 0, 0] },
  ],
  finalTail: [
    { name: "md_pay", dimensions: [0, 8, 0, 8, 4, 0, 4, 16, 8] },
    { name: "all_64", dimensions: [64, 64, 64, 64, 64, 64, 64, 64, 64] },
  ],
  finalTailToPublic: [
    { name: "all_64", dimensions: [64, 64, 64, 64, 64, 64, 64, 64, 64] },
  ],
};

// A deterministic stand-in for `bb gates`: distinct per group and shape, so a cost attached to the
// wrong entry is visible.
const fakeMeasure = (group, dims) =>
  group.length * 1000 + dims.reduce((a, b) => a + b, 0);

test("artifactPath maps the full shape to the base artifact and others to a tagged one", () => {
  assert.equal(
    artifactPath("inner", [64, 64, 64, 64, 64, 64, 64, 64, 64]),
    path.join(TARGET_DIR, "private_kernel_reset.json"),
  );
  assert.equal(
    artifactPath("finalTail", [0, 8, 0, 8, 4, 0, 4, 16, 8]),
    path.join(TARGET_DIR, "private_kernel_reset_tail_0_8_0_8_4_0_4_16_8.json"),
  );
  assert.equal(
    artifactPath("finalTailToPublic", [4, 4, 4, 4, 4, 4, 4, 4, 4]),
    path.join(
      TARGET_DIR,
      "private_kernel_reset_tail_to_public_4_4_4_4_4_4_4_4_4.json",
    ),
  );
});

test("artifactPath rejects a catalog group with no variant family", () => {
  assert.throws(
    () => artifactPath("finalTailToRollup", [4, 4, 4, 4, 4, 4, 4, 4, 4]),
    /No variant family for catalog group "finalTailToRollup"/,
  );
});

test("parseCircuitSize reads the report bb prints after its log lines", () => {
  const out = [
    "Scheme is: chonk",
    "some other log line",
    '{"functions": [',
    "  {",
    '        "acir_opcodes": 12345,',
    '        "circuit_size": 67089',
    "  }",
    "]}",
    "",
  ].join("\n");
  assert.equal(parseCircuitSize(out), 67089);
});

test("parseCircuitSize rejects output without a report", () => {
  assert.throws(() => parseCircuitSize("bb: command failed\n"), /Failed to parse bb gates output/);
});

test("buildConfig attaches each entry's measured cost and keeps the catalog order", () => {
  const calls = [];
  const config = buildConfig(variants, (group, dims) => {
    calls.push([group, dims]);
    return fakeMeasure(group, dims);
  });

  assert.deepEqual(Object.keys(config), ["inner", "finalTail", "finalTailToPublic"]);
  for (const group of Object.keys(variants)) {
    assert.deepEqual(
      config[group],
      variants[group].map((entry) => ({
        ...entry,
        cost: fakeMeasure(group, entry.dimensions),
      })),
    );
  }
  assert.deepEqual(
    calls,
    Object.entries(variants).flatMap(([group, entries]) =>
      entries.map((entry) => [group, entry.dimensions]),
    ),
  );
});

test("buildConfig covers every group in the catalog, not a fixed list", () => {
  const config = buildConfig({ finalTail: variants.finalTail }, fakeMeasure);
  assert.deepEqual(Object.keys(config), ["finalTail"]);
});

test("buildConfig rejects a measurement that is not a positive integer", () => {
  for (const bad of [undefined, 0, -1, 1.5, "67089", NaN]) {
    assert.throws(
      () => buildConfig(variants, () => bad),
      /Invalid cost .* for inner\/inner_sm \[4_4_4_4_4_4_0_0_0\]/,
      `cost ${bad}`,
    );
  }
});

test("buildConfig does not mutate the catalog it reads", () => {
  const before = JSON.stringify(variants);
  buildConfig(variants, fakeMeasure);
  assert.equal(JSON.stringify(variants), before);
});

test("serialize writes one entry per line and round-trips through JSON.parse", () => {
  const config = buildConfig(variants, fakeMeasure);
  const text = serialize(config);

  assert.deepEqual(JSON.parse(text), config);
  assert.ok(text.endsWith("}\n"));

  const entryLines = text.split("\n").filter((line) => line.includes('"name"'));
  assert.equal(entryLines.length, 5);
  assert.equal(
    entryLines[0],
    '    { "name": "inner_sm", "dimensions": [4, 4, 4, 4, 4, 4, 0, 0, 0], "cost": 5024 },',
  );
  assert.equal(
    entryLines[4],
    '    { "name": "all_64", "dimensions": [64, 64, 64, 64, 64, 64, 64, 64, 64], "cost": 17576 }',
  );
});
