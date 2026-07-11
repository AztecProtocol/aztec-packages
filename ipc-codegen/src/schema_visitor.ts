/**
 * Schema Visitor - Minimal abstraction over raw msgpack schema
 *
 * Philosophy:
 *   - Keep raw schema structure
 *   - Resolve type references into a graph
 *   - No normalization - languages handle their own conventions
 *   - Output is "compiled schema" with resolved types
 */

import { toSnakeCase, toCamelCase } from "./naming.ts";

export type PrimitiveType =
  | "bool"
  | "u8"
  | "u16"
  | "u32"
  | "u64"
  | "f64"
  | "string"
  | "bytes"
  | "bin32";

export interface Type {
  kind: "primitive" | "vector" | "array" | "optional" | "struct";
  primitive?: PrimitiveType;
  element?: Type; // For vector, array, optional
  size?: number; // For array
  struct?: Struct; // For struct types
  originalName?: string; // Alias name from schema, when present.
}

export interface Field {
  name: string;
  type: Type;
}

export interface Struct {
  name: string;
  fields: Field[];
}

export interface Command {
  name: string;
  fields: Field[];
  responseType: string;
  /** Command opted in to a zero-copy streamed variant (schema: "streamed": true). */
  streamed?: boolean;
}

export interface CompiledSchema {
  // All unique struct types discovered
  structs: Map<string, Struct>;

  // Command -> Response mappings
  commands: Command[];

  // Response types
  responses: Map<string, Struct>;

  // Error response type name (e.g. 'WsdbErrorResponse'). Always present:
  // schema validation rejects schemas without an error variant.
  errorTypeName: string;
}

/**
 * Words that are keywords (or otherwise unusable as plain identifiers) in at
 * least one target language. Field names whose snake_case or camelCase
 * projection lands here would generate broken code.
 */
const RESERVED_WORDS = new Set([
  // Rust
  "type",
  "fn",
  "match",
  "impl",
  "trait",
  "mod",
  "use",
  "ref",
  "self",
  "super",
  "crate",
  "move",
  "dyn",
  "async",
  "await",
  "loop",
  "where",
  // Zig
  "error",
  "var",
  "comptime",
  "defer",
  "errdefer",
  "test",
  "union",
  "undefined",
  "unreachable",
  "orelse",
  "and",
  "or",
  // C++
  "namespace",
  "int",
  "char",
  "short",
  "long",
  "float",
  "double",
  "signed",
  "unsigned",
  "register",
  "template",
  "typename",
  "operator",
  "virtual",
  "inline",
  "friend",
  "mutable",
  "explicit",
  "export",
  "this",
  "delete",
  // JS/TS
  "new",
  "class",
  "function",
  "extends",
  "instanceof",
  "typeof",
  "in",
  "void",
  "with",
  "yield",
  "let",
  // Shared / common
  "const",
  "static",
  "struct",
  "enum",
  "if",
  "else",
  "for",
  "while",
  "do",
  "switch",
  "case",
  "default",
  "break",
  "continue",
  "return",
  "true",
  "false",
  "null",
  "bool",
  "throw",
  "try",
  "catch",
  "public",
  "private",
  "protected",
]);

function validateNamedUnionShape(schema: any, label: string): void {
  if (
    !Array.isArray(schema) ||
    schema[0] !== "named_union" ||
    !Array.isArray(schema[1]) ||
    !schema[1].every(
      (entry: any) => Array.isArray(entry) && typeof entry[0] === "string",
    )
  ) {
    throw new Error(
      `Schema '${label}' is not in ["named_union", [[name, schema], ...]] form`,
    );
  }
}

/**
 * SchemaVisitor - Walks raw msgpack schema and resolves references
 */
export class SchemaVisitor {
  private structs = new Map<string, Struct>();
  private responses = new Map<string, Struct>();

  visit(commandsSchema: any, responsesSchema: any): CompiledSchema {
    // Reset state
    this.structs.clear();
    this.responses.clear();

    const commands: Command[] = [];

    // Schema format: ["named_union", [[name, schema], ...]]
    validateNamedUnionShape(commandsSchema, "commands");
    validateNamedUnionShape(responsesSchema, "responses");
    const commandPairs = commandsSchema[1] as Array<[string, any]>;
    const responsePairs = responsesSchema[1] as Array<[string, any]>;

    // First, visit all response types (including ErrorResponse). A string
    // schema is a reference to a struct defined earlier in the document —
    // schema reflection dedups repeated definitions to name strings (e.g. a
    // response type that also appears inline as a field of an earlier
    // response). It must resolve; a dangling reference means the generators
    // would emit a type nothing defines.
    for (const [respName, respSchema] of responsePairs) {
      if (typeof respSchema === "string") {
        const resolved =
          this.structs.get(respSchema) ?? this.responses.get(respSchema);
        if (!resolved) {
          throw new Error(
            `Response '${respName}' references '${respSchema}', which is not defined earlier in the schema`,
          );
        }
        this.responses.set(respName, resolved);
        continue;
      }
      const respStruct = this.visitStruct(respName, respSchema);
      this.responses.set(respName, respStruct);
    }

    // Find the error response type name (e.g. 'WsdbErrorResponse')
    const errorResponses = responsePairs.filter(([name]: [string, any]) =>
      name.endsWith("ErrorResponse"),
    );
    if (errorResponses.length === 0) {
      throw new Error(
        "Schema has no error response: the responses union must contain a variant named '*ErrorResponse'",
      );
    }
    const errorTypeName = errorResponses[0][0];
    const errorStruct = this.responses.get(errorTypeName)!;
    if (
      errorStruct.fields.length !== 1 ||
      errorStruct.fields[0].name !== "message" ||
      errorStruct.fields[0].type.primitive !== "string"
    ) {
      throw new Error(
        `Error response '${errorTypeName}' must have exactly one field 'message: string'`,
      );
    }

    // Commands pair with non-error responses by position (the schema is
    // reflected from C++ unions declared in matching order, and a command
    // may deliberately reuse another command's response shape, so names
    // alone cannot pair them). Two guards close the silent-mispair hole the
    // old unchecked indexing had: the counts must match exactly, and when a
    // response named '<Command>Response' exists it must be the one at the
    // command's position — anything else means the unions are misordered.
    const normalResponses = responsePairs.filter(
      ([name]: [string, any]) => !name.endsWith("ErrorResponse"),
    );
    if (normalResponses.length !== commandPairs.length) {
      throw new Error(
        `Schema has ${commandPairs.length} commands but ${normalResponses.length} non-error responses`,
      );
    }
    const normalResponseNames = new Set(
      normalResponses.map(([name]: [string, any]) => name),
    );
    const seenCommands = new Set<string>();
    for (let i = 0; i < commandPairs.length; i++) {
      const [cmdName, cmdSchema] = commandPairs[i];
      if (seenCommands.has(cmdName)) {
        throw new Error(`Duplicate command name: ${cmdName}`);
      }
      seenCommands.add(cmdName);

      const [respName] = normalResponses[i];
      const conventionalName = `${cmdName}Response`;
      if (
        respName !== conventionalName &&
        normalResponseNames.has(conventionalName)
      ) {
        throw new Error(
          `Command '${cmdName}' pairs with '${respName}' by position, but a response named '${conventionalName}' exists elsewhere — the unions are misordered`,
        );
      }

      // Discover command structure
      const cmdStruct = this.visitStruct(cmdName, cmdSchema);
      this.structs.set(cmdName, cmdStruct);

      // Create command mapping
      commands.push({
        name: cmdName,
        fields: cmdStruct.fields,
        responseType: respName,
      });
    }

    const compiled = {
      structs: this.structs,
      commands,
      responses: this.responses,
      errorTypeName,
    };
    this.validateStructReferences(compiled);
    this.validateIdentifiers(compiled);
    return compiled;
  }

  private visitStruct(name: string, schema: any): Struct {
    const fields: Field[] = [];

    // Schema is an object with __typename and fields
    for (const [key, value] of Object.entries(schema)) {
      if (key === "__typename") continue;

      fields.push({
        name: key,
        type: this.visitType(value),
      });
    }

    return { name, fields };
  }

  private visitType(schema: any): Type {
    // Primitive string type
    if (typeof schema === "string") {
      return this.resolvePrimitive(schema);
    }

    // Array type descriptor: ['vector', [elementType]]
    if (Array.isArray(schema)) {
      const [kind, args] = schema;

      switch (kind) {
        case "vector": {
          const [elemType] = args as [any];
          // Special case: vector<unsigned char> = bytes
          if (elemType === "unsigned char") {
            return { kind: "primitive", primitive: "bytes" };
          }
          return {
            kind: "vector",
            element: this.visitType(elemType),
          };
        }

        case "array": {
          const [elemType, size] = args as [any, number];
          return {
            kind: "array",
            element: this.visitType(elemType),
            size,
          };
        }

        case "optional": {
          const [elemType] = args as [any];
          return {
            kind: "optional",
            element: this.visitType(elemType),
          };
        }

        case "shared_ptr": {
          // Dereference shared_ptr - just use inner type
          const [innerType] = args as [any];
          return this.visitType(innerType);
        }

        case "alias": {
          // Aliases carry [aliasName, underlyingKind]. The underlying kind is
          // usually a primitive schema string. We preserve the alias name so
          // generators can emit named zero-cost aliases over primitive wire
          // shapes.
          const [aliasName, underlying] = args as [string, string];
          if (underlying === "bin32") {
            return {
              kind: "primitive",
              primitive: "bin32",
              originalName: aliasName,
            };
          }
          return {
            ...this.resolvePrimitive(underlying),
            originalName: aliasName,
          };
        }

        default:
          throw new Error(`Unknown type kind: ${kind}`);
      }
    }

    // Inline struct definition
    if (typeof schema === "object" && schema.__typename) {
      const structName = schema.__typename as string;
      // Check if already visited
      if (!this.structs.has(structName)) {
        const struct = this.visitStruct(structName, schema);
        this.structs.set(structName, struct);
      }
      return {
        kind: "struct",
        struct: this.structs.get(structName)!,
      };
    }

    throw new Error(`Cannot resolve type: ${JSON.stringify(schema)}`);
  }

  private resolvePrimitive(name: string): Type {
    const primitiveMap: Record<string, PrimitiveType> = {
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

    const primitive = primitiveMap[name];
    if (primitive) {
      return { kind: "primitive", primitive };
    }

    const knownStruct = this.structs.get(name);
    if (knownStruct) {
      return { kind: "struct", struct: knownStruct };
    }

    // Unknown primitive - treat as a forward struct reference.
    return {
      kind: "struct",
      struct: { name, fields: [] },
    };
  }

  /**
   * Reject field names that produce broken or colliding identifiers in any
   * target language. Field names are emitted as snake_case (Rust/Zig/C++)
   * and camelCase (TS), so both projections are checked.
   */
  private validateIdentifiers(schema: CompiledSchema): void {
    const allStructs = [
      ...schema.structs.values(),
      ...schema.responses.values(),
    ];
    for (const struct of allStructs) {
      const snakeSeen = new Map<string, string>();
      const camelSeen = new Map<string, string>();
      for (const field of struct.fields) {
        const snake = toSnakeCase(field.name);
        const camel = toCamelCase(field.name);
        if (RESERVED_WORDS.has(snake) || RESERVED_WORDS.has(camel)) {
          throw new Error(
            `Field '${struct.name}.${field.name}' maps to a reserved word in a target language`,
          );
        }
        const snakeClash = snakeSeen.get(snake);
        if (snakeClash !== undefined && snakeClash !== field.name) {
          throw new Error(
            `Fields '${struct.name}.${snakeClash}' and '${struct.name}.${field.name}' both map to '${snake}'`,
          );
        }
        snakeSeen.set(snake, field.name);
        const camelClash = camelSeen.get(camel);
        if (camelClash !== undefined && camelClash !== field.name) {
          throw new Error(
            `Fields '${struct.name}.${camelClash}' and '${struct.name}.${field.name}' both map to '${camel}'`,
          );
        }
        camelSeen.set(camel, field.name);
      }
    }
  }

  private validateStructReferences(schema: CompiledSchema): void {
    const knownNames = new Set([
      ...schema.structs.keys(),
      ...schema.responses.keys(),
    ]);
    const visitType = (type: Type): void => {
      if (
        type.kind === "struct" &&
        type.struct &&
        !knownNames.has(type.struct.name)
      ) {
        throw new Error(`Unknown struct reference: ${type.struct.name}`);
      }
      if (
        (type.kind === "vector" ||
          type.kind === "array" ||
          type.kind === "optional") &&
        type.element
      ) {
        visitType(type.element);
      }
    };

    for (const struct of schema.structs.values()) {
      for (const field of struct.fields) {
        visitType(field.type);
      }
    }
    for (const struct of schema.responses.values()) {
      for (const field of struct.fields) {
        visitType(field.type);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Friendly (human-authored) schema front-end
//
// The committed schemas are hand-edited. The friendly format is a single
// object per service with shorthand string type references; this front-end
// lowers it to the positional ["named_union", ...] form that SchemaVisitor
// already consumes, so the generators are untouched and the produced
// CompiledSchema is identical to the equivalent positional schema.
// ---------------------------------------------------------------------------

/** Strip line and block comments from JSONC, preserving string contents. */
export function stripJsonc(text: string): string {
  let out = "";
  let inStr = false;
  let strCh = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const n = text[i + 1];
    if (inStr) {
      out += c;
      if (c === "\\") {
        out += n ?? "";
        i++;
      } else if (c === strCh) {
        inStr = false;
      }
      continue;
    }
    if (c === '"' || c === "'") {
      inStr = true;
      strCh = c;
      out += c;
      continue;
    }
    if (c === "/" && n === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && n === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i++; // skip the closing '/'
      continue;
    }
    out += c;
  }
  return out;
}

/** A parsed friendly schema is recognised by its top-level `service` key. */
export function isFriendlySchema(parsed: any): boolean {
  return (
    parsed != null &&
    typeof parsed === "object" &&
    !Array.isArray(parsed) &&
    typeof parsed.service === "string"
  );
}

// u32 etc. -> the positional primitive spellings resolvePrimitive() accepts.
const PRIMITIVE_SHORTHAND: Record<string, string> = {
  bool: "bool",
  u8: "unsigned char",
  u16: "unsigned short",
  u32: "unsigned int",
  u64: "unsigned long",
  f64: "double",
  string: "string",
  bin32: "bin32",
};

/**
 * Lower a friendly schema object into the positional `{ commands, responses }`
 * named_union pair, plus the service name (used as the type prefix). Type names
 * are `service + commandKey`; method names are derived by the generators via
 * the service prefix. Named `types` are inlined at every reference — visit()
 * dedups them by `__typename`, so the resulting CompiledSchema matches the
 * positional form exactly.
 */
export function friendlyToPositional(parsed: any): {
  commands: any;
  responses: any;
  service: string;
  streamedCommands: Set<string>;
} {
  const service: string = parsed.service;
  if (!service) {
    throw new Error("Friendly schema requires a non-empty string 'service'");
  }
  const aliases: Record<string, string> = parsed.aliases ?? {};
  const types: Record<string, any> = parsed.types ?? {};
  // An alias is either a nominal byte type (bin32) or a transparent scalar
  // synonym over a primitive (e.g. MerkleTreeId = u32). The underlying is given
  // in shorthand; map it to the positional spelling visitType() consumes.
  const aliasUnderlying = (name: string): string => {
    const u = aliases[name];
    if (u === "bin32") return "bin32";
    const prim = PRIMITIVE_SHORTHAND[u];
    if (!prim) {
      throw new Error(
        `Alias '${name}' underlying '${u}' is not 'bin32' or a primitive`,
      );
    }
    return prim;
  };
  for (const [name] of Object.entries(aliases)) {
    aliasUnderlying(name); // validate up front
  }

  const parseTypeRef = (ref: string): any => {
    const s = ref.trim();
    if (s.endsWith("?")) {
      return ["optional", [parseTypeRef(s.slice(0, -1))]];
    }
    if (s.endsWith("]")) {
      const lb = s.lastIndexOf("[");
      if (lb < 0) throw new Error(`Malformed type reference '${ref}'`);
      const inner = s.slice(0, lb);
      const n = s.slice(lb + 1, -1).trim();
      if (n === "") {
        return ["vector", [parseTypeRef(inner)]];
      }
      const size = Number(n);
      if (!Number.isInteger(size) || size <= 0) {
        throw new Error(`Bad fixed-array size in type reference '${ref}'`);
      }
      return ["array", [parseTypeRef(inner), size]];
    }
    if (s === "bytes") return ["vector", ["unsigned char"]];
    if (s in PRIMITIVE_SHORTHAND) return PRIMITIVE_SHORTHAND[s];
    if (s in aliases) return ["alias", [s, aliasUnderlying(s)]];
    if (s in types) return inlineType(s);
    throw new Error(
      `Unknown type reference '${ref}' (not a primitive, declared alias, or declared type)`,
    );
  };

  const structBody = (fieldObj: Record<string, string>, typename: string) => {
    const body: any = { __typename: typename };
    for (const [fname, fref] of Object.entries(fieldObj ?? {})) {
      body[fname] = parseTypeRef(fref);
    }
    return body;
  };

  const inlineType = (typeName: string): any =>
    structBody(types[typeName], typeName);

  const commands: any = ["named_union", []];
  const responses: any = ["named_union", []];
  const streamedCommands = new Set<string>();

  for (const [key, def] of Object.entries<any>(parsed.commands ?? {})) {
    const cmdName = service + key;
    if (def.streamed === true) {
      streamedCommands.add(cmdName);
    }
    commands[1].push([cmdName, structBody(def.request, cmdName)]);

    if (typeof def.response === "string") {
      // Reuse another command's response shape: dedup string-ref form.
      const respName = service + def.response;
      responses[1].push([respName, respName]);
    } else {
      const respName = `${cmdName}Response`;
      responses[1].push([respName, structBody(def.response, respName)]);
    }
  }

  const errorName = `${service}ErrorResponse`;
  responses[1].push([errorName, structBody(parsed.error, errorName)]);

  return { commands, responses, service, streamedCommands };
}
