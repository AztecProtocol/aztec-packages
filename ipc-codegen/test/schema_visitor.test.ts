/**
 * Schema validation tests. Run with:
 *   node --experimental-strip-types --no-warnings test/schema_visitor.test.ts
 * Exits non-zero on failure.
 */
import {
  SchemaVisitor,
  stripJsonc,
  friendlyToPositional,
} from "../src/schema_visitor.ts";
import * as fs from "node:fs";
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

if (failures > 0) {
  console.error(`${failures} test(s) failed`);
  process.exit(1);
}
console.log("schema_visitor tests passed");
