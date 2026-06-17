// One-shot converter: old positional IPC schema -> friendly JSONC form.
// Usage: node convert_schema.ts <old.json> <ServicePrefix> [outFriendly.jsonc]
import { readFileSync, writeFileSync } from "fs";
import {
  SchemaVisitor,
  friendlyToPositional,
} from "../src/schema_visitor.ts";

const PRIM: Record<string, string> = {
  bool: "bool",
  int: "u32",
  "unsigned int": "u32",
  "unsigned short": "u16",
  "unsigned long": "u64",
  "unsigned long long": "u64",
  "unsigned char": "u8",
  double: "f64",
  string: "string",
  bin32: "bin32",
};

function convert(oldPath: string, prefix: string) {
  const old = JSON.parse(readFileSync(oldPath, "utf-8"));
  const aliases: Record<string, string> = {};
  const types: Record<string, Record<string, string>> = {};

  const typeToShorthand = (t: any): string => {
    if (typeof t === "string") {
      return PRIM[t] ?? t; // primitive or a named (struct) reference
    }
    if (Array.isArray(t)) {
      const [kind, args] = t;
      if (kind === "vector") {
        const [el] = args;
        if (el === "unsigned char") return "bytes";
        return typeToShorthand(el) + "[]";
      }
      if (kind === "array")
        return typeToShorthand(args[0]) + "[" + args[1] + "]";
      if (kind === "optional") return typeToShorthand(args[0]) + "?";
      if (kind === "shared_ptr") return typeToShorthand(args[0]);
      if (kind === "alias") {
        const [name, underlying] = args;
        aliases[name] = underlying === "bin32" ? "bin32" : PRIM[underlying];
        if (!aliases[name])
          throw new Error(`alias ${name} underlying ${underlying}`);
        return name;
      }
      throw new Error(`unknown type kind: ${kind}`);
    }
    if (t && typeof t === "object" && t.__typename) {
      const tn = t.__typename as string;
      if (!(tn in types)) {
        types[tn] = {}; // reserve to break cycles
        types[tn] = structFields(t);
      }
      return tn;
    }
    throw new Error(`cannot convert type ${JSON.stringify(t)}`);
  };

  const structFields = (struct: any): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(struct)) {
      if (k === "__typename") continue;
      out[k] = typeToShorthand(v);
    }
    return out;
  };

  const commandPairs = old.commands[1] as Array<[string, any]>;
  const responsePairs = old.responses[1] as Array<[string, any]>;
  const respByName = new Map(responsePairs);

  const errEntry = responsePairs.find(([n]) => n.endsWith("ErrorResponse"))!;
  const error = structFields(errEntry[1]);

  const commands: Record<string, any> = {};
  for (const [cmdName, cmdStruct] of commandPairs) {
    const key = cmdName.startsWith(prefix)
      ? cmdName.slice(prefix.length)
      : cmdName;
    const request = structFields(cmdStruct);
    const respStruct = respByName.get(`${cmdName}Response`);
    let response: any;
    if (respStruct === undefined) {
      throw new Error(`No response named ${cmdName}Response`);
    } else if (typeof respStruct === "string") {
      response = respStruct.startsWith(prefix)
        ? respStruct.slice(prefix.length)
        : respStruct;
    } else {
      response = structFields(respStruct);
    }
    commands[key] = { request, response };
  }

  return { service: prefix, aliases, types, error, commands };
}

// Deep structural equality of CompiledSchema, ignoring Map insertion order.
// Struct references are compared by NAME only: generators emit nested structs
// by name from the top-level `structs` map, so the embedded fields on a struct
// ref are irrelevant (and differ benignly between string-ref and inline forms).
function normalize(c: any): any {
  const normType = (t: any): any => {
    if (t == null || typeof t !== "object") return t;
    if (t.kind === "struct")
      return { kind: "struct", structName: t.struct?.name };
    if (t.element)
      return { kind: t.kind, size: t.size, element: normType(t.element) };
    return {
      kind: t.kind,
      primitive: t.primitive,
      originalName: t.originalName,
    };
  };
  const norm = (s: any) => ({
    name: s.name,
    fields: s.fields.map((f: any) => ({
      name: f.name,
      type: normType(f.type),
    })),
  });
  return {
    structs: Object.fromEntries(
      [...c.structs.entries()].map(([k, v]: any) => [k, norm(v)]).sort(),
    ),
    responses: Object.fromEntries(
      [...c.responses.entries()].map(([k, v]: any) => [k, norm(v)]).sort(),
    ),
    commands: [...c.commands]
      .map((x: any) => ({
        name: x.name,
        responseType: x.responseType,
        fields: x.fields.map((f: any) => ({
          name: f.name,
          type: normType(f.type),
        })),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    errorTypeName: c.errorTypeName,
  };
}

const [oldPath, prefix, outPath] = process.argv.slice(2);
const friendly = convert(oldPath, prefix);
const friendlyText = JSON.stringify(friendly, null, 2);
if (outPath) writeFileSync(outPath, friendlyText + "\n");

const old = JSON.parse(readFileSync(oldPath, "utf-8"));
const oldCompiled = new SchemaVisitor().visit(old.commands, old.responses);
const { commands, responses } = friendlyToPositional(friendly);
const newCompiled = new SchemaVisitor().visit(commands, responses);

const a = JSON.stringify(normalize(oldCompiled));
const b = JSON.stringify(normalize(newCompiled));
if (a === b) {
  console.log(
    `ROUND-TRIP OK  service=${prefix}  commands=${friendly.commands && Object.keys(friendly.commands).length}  types=${Object.keys(friendly.types).length}  aliases=${Object.keys(friendly.aliases).length}`,
  );
} else {
  console.log(`ROUND-TRIP MISMATCH for ${prefix}`);
  // show first divergence
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      console.log("old:", a.slice(Math.max(0, i - 80), i + 80));
      console.log("new:", b.slice(Math.max(0, i - 80), i + 80));
      break;
    }
  }
  process.exit(1);
}
