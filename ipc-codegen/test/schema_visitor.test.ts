/**
 * Schema validation tests. Run with:
 *   node --experimental-strip-types --no-warnings test/schema_visitor.test.ts
 * Exits non-zero on failure.
 */
import {
  SchemaVisitor,
  stripJsonc,
  friendlyToPositional,
  mergeExtendedSchema,
  mergeImportedTypes,
  parseExtends,
  parseImports,
} from "../src/schema_visitor.ts";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

let failures = 0;

function expectThrows(label: string, fn: () => void, messagePart: string) {
  try {
    fn();
    console.error(`FAIL: ${label} did not throw`);
    failures++;
  } catch (e: any) {
    if (!e.message.includes(messagePart)) {
      console.error(
        `FAIL: ${label} threw wrong error: ${e.message} (expected to include '${messagePart}')`,
      );
      failures++;
    } else {
      console.log(`ok: ${label}`);
    }
  }
}

function expectOk(label: string, fn: () => void) {
  try {
    fn();
    console.log(`ok: ${label}`);
  } catch (e: any) {
    console.error(`FAIL: ${label} threw: ${e.message}`);
    failures++;
  }
}

const errResp = ["FooErrorResponse", { message: "string" }];

expectOk("echo schema is valid", () => {
  const schemaPath = path.join(
    import.meta.dirname,
    "../echo_example/schema/schema.jsonc",
  );
  const parsed = JSON.parse(stripJsonc(fs.readFileSync(schemaPath, "utf8")));
  const { commands, responses } = friendlyToPositional(parsed);
  new SchemaVisitor().visit(commands, responses);
});

expectThrows(
  "missing error response",
  () =>
    new SchemaVisitor().visit(
      ["named_union", [["FooBar", { x: "unsigned int" }]]],
      ["named_union", [["FooBarResponse", { y: "unsigned int" }]]],
    ),
  "no error response",
);

expectThrows(
  "duplicate command",
  () =>
    new SchemaVisitor().visit(
      [
        "named_union",
        [
          ["FooA", {}],
          ["FooA", {}],
        ],
      ],
      ["named_union", [["FooAResponse", {}], ["FooAResponse", {}], errResp]],
    ),
  "Duplicate command name",
);

expectOk("response reuse by position is allowed", () =>
  new SchemaVisitor().visit(
    ["named_union", [["FooBar", {}]]],
    ["named_union", [["FooSharedResponse", {}], errResp]],
  ),
);

expectThrows(
  "misordered unions",
  () =>
    new SchemaVisitor().visit(
      [
        "named_union",
        [
          ["FooA", {}],
          ["FooB", {}],
        ],
      ],
      ["named_union", [["FooBResponse", {}], ["FooAResponse", {}], errResp]],
    ),
  "misordered",
);

expectOk("string response reference resolves to earlier inline struct", () =>
  new SchemaVisitor().visit(
    [
      "named_union",
      [
        ["FooMake", {}],
        ["FooGet", {}],
      ],
    ],
    [
      "named_union",
      [
        [
          "FooMakeResponse",
          {
            __typename: "FooMakeResponse",
            item: { __typename: "FooGetResponse", x: "unsigned int" },
          },
        ],
        ["FooGetResponse", "FooGetResponse"],
        errResp,
      ],
    ],
  ),
);

expectThrows(
  "dangling string response reference",
  () =>
    new SchemaVisitor().visit(
      ["named_union", [["FooBar", {}]]],
      ["named_union", [["FooBarResponse", "NeverDefined"], errResp]],
    ),
  "not defined earlier",
);

expectThrows(
  "bad error struct shape",
  () =>
    new SchemaVisitor().visit(
      ["named_union", [["FooBar", {}]]],
      [
        "named_union",
        [
          ["FooBarResponse", {}],
          ["FooErrorResponse", { msg: "string" }],
        ],
      ],
    ),
  "exactly one field 'message: string'",
);

expectThrows(
  "reserved word field",
  () =>
    new SchemaVisitor().visit(
      ["named_union", [["FooBar", { type: "unsigned int" }]]],
      ["named_union", [["FooBarResponse", {}], errResp]],
    ),
  "reserved word",
);

expectThrows(
  "colliding field projections",
  () =>
    new SchemaVisitor().visit(
      [
        "named_union",
        [["FooBar", { forkId: "unsigned int", fork_id: "unsigned int" }]],
      ],
      ["named_union", [["FooBarResponse", {}], errResp]],
    ),
  "both map to",
);

expectThrows(
  "bad top-level shape",
  () => new SchemaVisitor().visit({ commands: [] }, ["named_union", []]),
  "named_union",
);

// ---------------------------------------------------------------------------
// extends
// ---------------------------------------------------------------------------

const baseSchema = {
  service: "Kv",
  aliases: { Key: "bin32" },
  types: { Entry: { key: "Key", value: "bytes" } },
  error: { message: "string" },
  commands: {
    Get: { request: { key: "Key" }, response: { entry: "Entry?" } },
    Put: { request: { entry: "Entry" }, response: {} },
  },
};
const baseExt = { schema: "base.jsonc", interface: "KvBase" };

expectOk("extends merges additively and records the parent interface", () => {
  const merged = mergeExtendedSchema(
    baseSchema,
    {
      types: { Stats: { count: "u64" } },
      commands: { Stats: { request: {}, response: { stats: "Stats" } } },
    },
    baseExt,
  );
  const keys = Object.keys(merged.commands).join(",");
  if (keys !== "Get,Put,Stats") throw new Error(`commands: ${keys}`);
  if (merged.service !== "Kv") throw new Error("service not inherited");
  const inherited = JSON.stringify(merged.__inherited);
  if (inherited !== '[{"name":"KvBase","commandNames":["KvGet","KvPut"]}]') {
    throw new Error(`inherited: ${inherited}`);
  }
  const { commands, responses } = friendlyToPositional(merged);
  new SchemaVisitor().visit(commands, responses);
});

expectOk("extends chains list each level's full command set", () => {
  const mid = mergeExtendedSchema(
    baseSchema,
    { commands: { Del: { request: { key: "Key" }, response: {} } } },
    baseExt,
  );
  const top = mergeExtendedSchema(
    mid,
    { commands: { Stats: { request: {}, response: {} } } },
    { schema: "mid.jsonc", interface: "KvMid" },
  );
  const levels = top.__inherited.map(
    (l: any) => `${l.name}=${l.commandNames.join("+")}`,
  );
  if (levels.join(" ") !== "KvBase=KvGet+KvPut KvMid=KvGet+KvPut+KvDel") {
    throw new Error(levels.join(" "));
  }
});

expectThrows(
  "extends rejects redefining an inherited command",
  () =>
    mergeExtendedSchema(
      baseSchema,
      { commands: { Get: { request: {}, response: {} } } },
      baseExt,
    ),
  "'Get' in 'commands' redefines",
);

expectThrows(
  "extends rejects redefining an inherited type",
  () => mergeExtendedSchema(baseSchema, { types: { Entry: {} } }, baseExt),
  "'Entry' in 'types' redefines",
);

expectThrows(
  "extends rejects redefining an inherited alias differently",
  () => mergeExtendedSchema(baseSchema, { aliases: { Key: "u32" } }, baseExt),
  "'Key' in 'aliases' redefines",
);

expectOk("extends accepts an identical repeat of an inherited type", () =>
  mergeExtendedSchema(
    baseSchema,
    { aliases: { Key: "bin32" }, types: { Entry: { key: "Key", value: "bytes" } } },
    baseExt,
  ),
);

// ---------------------------------------------------------------------------
// imports
// ---------------------------------------------------------------------------

const sharedTypes = {
  aliases: { Hash: "bin32" },
  types: { Pair: { a: "Hash", b: "Hash" } },
};

expectOk("imports brings in aliases and types only", () => {
  const merged = mergeImportedTypes(
    { service: "Other", error: { message: "string" }, commands: {} },
    { ...sharedTypes, service: "Kv", commands: { Get: {} } },
    "shared.jsonc",
  );
  if (merged.service !== "Other") throw new Error("service changed");
  if (Object.keys(merged.commands).length !== 0) throw new Error("imported commands");
  if (!merged.types.Pair || merged.aliases.Hash !== "bin32") throw new Error("types missing");
});

expectOk("imports tolerates the same type reached twice", () => {
  const once = mergeImportedTypes({}, sharedTypes, "a.jsonc");
  mergeImportedTypes(once, sharedTypes, "b.jsonc");
});

expectThrows(
  "imports rejects a conflicting type",
  () =>
    mergeImportedTypes(
      { types: { Pair: { a: "Hash" } } },
      sharedTypes,
      "shared.jsonc",
    ),
  "'Pair' in 'types' redefines a definition inherited from shared.jsonc",
);

expectThrows(
  "imports must be a list of paths",
  () => parseImports("shared.jsonc"),
  "'imports' must be",
);

expectThrows(
  "extends rejects a different service",
  () => mergeExtendedSchema(baseSchema, { service: "Other" }, baseExt),
  "must keep its service 'Kv'",
);

expectThrows(
  "extends rejects a different error",
  () =>
    mergeExtendedSchema(
      baseSchema,
      { error: { message: "string", code: "u32" } },
      baseExt,
    ),
  "redefines 'error'",
);

expectThrows(
  "extends rejects reusing an interface name up the chain",
  () =>
    mergeExtendedSchema(
      mergeExtendedSchema(baseSchema, {}, baseExt),
      {},
      { schema: "mid.jsonc", interface: "KvBase" },
    ),
  "already used",
);

expectThrows(
  "extends must name the parent interface",
  () => parseExtends("base.jsonc"),
  "'extends' must be",
);

expectThrows(
  "extends interface must be PascalCase",
  () => parseExtends({ schema: "base.jsonc", interface: "kv-base" }),
  "'extends' must be",
);

// End to end through the generator: files on disk, relative parent path, TS interfaces.
{
  const generator = path.join(import.meta.dirname, "../src/generate.ts");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ipc-codegen-extends-"));
  fs.mkdirSync(path.join(dir, "base"));
  fs.writeFileSync(
    path.join(dir, "base", "base.jsonc"),
    JSON.stringify(baseSchema),
  );
  fs.writeFileSync(
    path.join(dir, "child.jsonc"),
    `// child
{
  "extends": { "schema": "base/base.jsonc", "interface": "KvBase" },
  "commands": { "Stats": { "request": {}, "response": { "count": "u64" } } }
}`,
  );
  const run = (schema: string, out: string) =>
    execFileSync(
      process.execPath,
      [
        "--experimental-strip-types",
        "--no-warnings",
        generator,
        "--schema",
        path.join(dir, schema),
        "--lang",
        "ts",
        "--out",
        path.join(dir, out),
        "--client",
      ],
      { stdio: "pipe" },
    );

  expectOk("generator resolves extends and emits the parent interfaces", () => {
    run("child.jsonc", "out");
    const types = fs.readFileSync(path.join(dir, "out", "api_types.ts"), "utf8");
    for (const needle of [
      "export interface AsyncKvBaseApi {",
      "export interface SyncKvBaseApi {",
      "export interface AsyncApiBase extends AsyncKvBaseApi {",
      "export interface SyncApiBase extends SyncKvBaseApi {",
      "stats(command: KvStats): Promise<KvStatsResponse>;",
    ]) {
      if (!types.includes(needle)) throw new Error(`missing: ${needle}`);
    }
    const base = types.slice(
      types.indexOf("export interface AsyncKvBaseApi {"),
      types.indexOf("export interface SyncKvBaseApi {"),
    );
    if (base.includes("stats(")) {
      throw new Error("parent interface includes a child command");
    }
  });

  expectOk("generator leaves a schema without extends unchanged", () => {
    run("base/base.jsonc", "out-base");
    const types = fs.readFileSync(
      path.join(dir, "out-base", "api_types.ts"),
      "utf8",
    );
    if (!types.includes("export interface AsyncApiBase {")) {
      throw new Error("AsyncApiBase should not extend anything");
    }
  });

  fs.writeFileSync(path.join(dir, "shared.jsonc"), JSON.stringify(sharedTypes));
  fs.writeFileSync(
    path.join(dir, "other.jsonc"),
    JSON.stringify({
      service: "Other",
      imports: ["shared.jsonc"],
      error: { message: "string" },
      commands: { Swap: { request: { pair: "Pair" }, response: { pair: "Pair" } } },
    }),
  );
  expectOk("generator resolves imports for a different service", () => {
    run("other.jsonc", "out-other");
    const types = fs.readFileSync(path.join(dir, "out-other", "api_types.ts"), "utf8");
    for (const needle of ["export interface Pair {", "export type Hash = Uint8Array;", "swap(command: OtherSwap)"]) {
      if (!types.includes(needle)) throw new Error(`missing: ${needle}`);
    }
  });

  fs.writeFileSync(
    path.join(dir, "loop_a.jsonc"),
    JSON.stringify({ extends: { schema: "loop_b.jsonc", interface: "A" } }),
  );
  fs.writeFileSync(
    path.join(dir, "loop_b.jsonc"),
    JSON.stringify({ extends: { schema: "loop_a.jsonc", interface: "B" } }),
  );
  expectThrows(
    "generator rejects a schema cycle",
    () => {
      try {
        run("loop_a.jsonc", "out-loop");
      } catch (e: any) {
        throw new Error(String(e.stderr));
      }
    },
    "schema cycle",
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(`${failures} test(s) failed`);
  process.exit(1);
}
console.log("schema_visitor tests passed");
