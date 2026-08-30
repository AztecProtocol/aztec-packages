/**
 * TypeScript Code Generator - String template based
 *
 * Philosophy:
 *   - String templates for file structure
 *   - Simple type mapping
 *   - Idiomatic TypeScript conventions
 *   - No complex abstraction
 */

import type {
  CompiledSchema,
  Type,
  Struct,
  Field,
  Command,
} from "./schema_visitor.ts";
import {
  toPascalCase,
  toSnakeCase,
  toCamelCase,
  toAliasName,
  dedupeStructsByName,
} from "./naming.ts";

/**
 * Above this length a fixed-size array is emitted as `T[]`, not a tuple.
 *
 * Pairs are the extension-field coordinates (Fq2), which callers build as
 * two-element literals and pass positionally, so the arity carries its weight
 * in the type. Longer fixed arrays are filled programmatically and read better
 * as plain arrays — and typing them as tuples would reject the array
 * expressions callers already pass.
 */
const TUPLE_SIZE_LIMIT = 2;

export class TypeScriptCodegen {
  private errorTypeName: string = "ErrorResponse";
  /** Prefix to strip from command names when generating method names (e.g. "Bb" -> BbCircuitProve becomes circuitProve) */
  private methodPrefix: string = "";
  /** Prefix to strip from generated type and converter names (e.g. "Bb" -> BbCircuitProve becomes CircuitProve) */
  private typePrefix: string = "";

  constructor(options?: { stripMethodPrefix?: string; stripTypePrefix?: string }) {
    if (options?.stripMethodPrefix) {
      this.methodPrefix = options.stripMethodPrefix;
    }
    if (options?.stripTypePrefix) {
      this.typePrefix = options.stripTypePrefix;
    }
  }

  /**
   * The generated identifier for a schema name: PascalCase, with the service
   * prefix stripped when asked. Wire strings always keep the schema name, so
   * this must never be used where a tag is emitted.
   */
  private typeName(schemaName: string): string {
    let name = schemaName;
    if (this.typePrefix && name.startsWith(this.typePrefix)) {
      const rest = name.slice(this.typePrefix.length);
      // Only strip when what remains still starts a PascalCase word, so a
      // command legitimately beginning with the prefix letters is untouched.
      if (rest && rest[0] === rest[0].toUpperCase()) {
        name = rest;
      }
    }
    return toPascalCase(name);
  }

  /** Strip the method prefix and convert to camelCase for API method names */
  private toMethodName(commandName: string): string {
    let name = commandName;
    if (this.methodPrefix && name.startsWith(this.methodPrefix)) {
      name = name.slice(this.methodPrefix.length);
    }
    return toCamelCase(name);
  }

  /**
   * A fixed-size array is a tuple: `[T, T]` rather than `T[]`. That preserves
   * the arity in the type, and keeps a readonly tuple literal assignable,
   * which a plain array type would reject. Long arrays stay `T[]` so the
   * emitted types remain readable.
   */
  private fixedArrayType(element: string, size?: number): string {
    if (size === undefined || size > TUPLE_SIZE_LIMIT) {
      return `${element}[]`;
    }
    return `[${Array(size).fill(element).join(", ")}]`;
  }

  private primitiveType(type: Type): string {
    switch (type.primitive) {
      case "bool":
        return "boolean";
      case "u8":
      case "u16":
      case "u32":
      case "u64":
      case "f64":
        return "number";
      case "string":
        return "string";
      case "bytes":
      case "bin32":
        return "Uint8Array";
    }
    throw new Error(`Unsupported primitive type: ${type.primitive}`);
  }

  private isU8Array(type: Type): boolean {
    return (
      type.kind === "array" &&
      type.element?.kind === "primitive" &&
      type.element.primitive === "u8"
    );
  }

  // Type mapping: Schema type -> TypeScript type
  private mapType(type: Type): string {
    switch (type.kind) {
      case "primitive":
        return type.originalName
          ? toAliasName(type.originalName)
          : this.primitiveType(type);

      case "vector": {
        const inner = this.mapType(type.element!);
        // Wrap union types in parens to avoid precedence issues: (Foo | undefined)[]
        return type.element!.kind === "optional"
          ? `(${inner})[]`
          : `${inner}[]`;
      }

      case "array": {
        if (this.isU8Array(type)) {
          return "Uint8Array";
        }
        const inner = this.mapType(type.element!);
        const element =
          type.element!.kind === "optional" ? `(${inner})` : inner;
        return this.fixedArrayType(element, type.size);
      }

      case "optional":
        return `${this.mapType(type.element!)} | null`;

      case "struct":
        return this.typeName(type.struct!.name);
    }

    throw new Error(`Unsupported type kind: ${type.kind}`);
  }

  // Type mapping for msgpack interfaces (uses Msgpack* prefix for structs)
  private mapMsgpackType(type: Type): string {
    switch (type.kind) {
      case "primitive":
        // u64 crosses the wire as bigint beyond 32 bits (see toWireU64).
        return type.primitive === "u64"
          ? "number | bigint"
          : this.primitiveType(type);

      case "vector": {
        const inner = this.mapMsgpackType(type.element!);
        // Parenthesize union element types: number | bigint[] != (number | bigint)[]
        return inner.includes("|") ? `(${inner})[]` : `${inner}[]`;
      }

      case "array": {
        if (this.isU8Array(type)) {
          return "Uint8Array";
        }
        const inner = this.mapMsgpackType(type.element!);
        const element = inner.includes("|") ? `(${inner})` : inner;
        return this.fixedArrayType(element, type.size);
      }

      case "optional":
        return `${this.mapMsgpackType(type.element!)} | null`;

      case "struct":
        return `Msgpack${this.typeName(type.struct!.name)}`;
    }

    throw new Error(`Unsupported msgpack type kind: ${type.kind}`);
  }

  // Check if type needs conversion (has nested structs)
  private needsConversion(type: Type): boolean {
    switch (type.kind) {
      case "primitive":
        return false;
      case "vector":
      case "array":
      case "optional":
        return this.needsConversion(type.element!);
      case "struct":
        return true;
    }
    return false;
  }

  // Generate field
  private generateField(field: Field): string {
    const tsName = toCamelCase(field.name);
    const tsType = this.mapType(field.type);
    return `  ${tsName}: ${tsType};`;
  }

  // Generate msgpack field (original names, uses Msgpack* types for structs)
  private generateMsgpackField(field: Field): string {
    const tsType = this.mapMsgpackType(field.type);
    return `  ${field.name}: ${tsType};`;
  }

  // Generate public interface
  private generateInterface(struct: Struct): string {
    const tsName = this.typeName(struct.name);
    const fields = struct.fields.map((f) => this.generateField(f)).join("\n");

    return `export interface ${tsName} {
${fields}
}`;
  }

  // Generate msgpack interface (internal)
  private generateMsgpackInterface(struct: Struct): string {
    const tsName = this.typeName(struct.name);
    const fields = struct.fields
      .map((f) => this.generateMsgpackField(f))
      .join("\n");

    return `interface Msgpack${tsName} {
${fields}
}`;
  }

  // Generate to* conversion function
  private generateToFunction(struct: Struct): string {
    const tsName = this.typeName(struct.name);

    if (struct.fields.length === 0) {
      return `function to${tsName}(o: Msgpack${tsName}): ${tsName} {
  return {};
}`;
    }

    const checks = struct.fields
      .filter((f) => f.type.kind !== "optional")
      .map(
        (f) =>
          `  if (o.${f.name} === undefined) { throw new Error("Expected ${f.name} in ${tsName} deserialization"); }`,
      )
      .join("\n");

    const conversions = struct.fields
      .map((f) => {
        const tsFieldName = toCamelCase(f.name);
        const converter = this.generateToConverter(f.type, `o.${f.name}`);
        return `    ${tsFieldName}: ${converter},`;
      })
      .join("\n");

    return `function to${tsName}(o: Msgpack${tsName}): ${tsName} {
${checks};
  return {
${conversions}
  };
}`;
  }

  // Generate from* conversion function
  private generateFromFunction(struct: Struct): string {
    const tsName = this.typeName(struct.name);

    if (struct.fields.length === 0) {
      return `function from${tsName}(o: ${tsName}): Msgpack${tsName} {
  return {};
}`;
    }

    const checks = struct.fields
      .filter((f) => f.type.kind !== "optional")
      .map((f) => {
        const tsFieldName = toCamelCase(f.name);
        return `  if (o.${tsFieldName} === undefined) { throw new Error("Expected ${tsFieldName} in ${tsName} serialization"); }`;
      })
      .join("\n");

    const conversions = struct.fields
      .map((f) => {
        const tsFieldName = toCamelCase(f.name);
        const converter = this.generateFromConverter(
          f.type,
          `o.${tsFieldName}`,
        );
        return `  ${f.name}: ${converter},`;
      })
      .join("\n");

    return `function from${tsName}(o: ${tsName}): Msgpack${tsName} {
${checks};
  return {
${conversions}
  };
}`;
  }

  /**
   * Generate a conversion expression for a field in either direction.
   * Primitives that can be silently mis-encoded get runtime guards:
   * u64 (precision loss past 2^53 until a bigint migration) and bin32
   * (length must be exactly 32 — other languages enforce this).
   * Optionals normalize undefined to null so omitted fields are valid.
   */
  private generateConverter(
    dir: "to" | "from",
    type: Type,
    value: string,
  ): string {
    switch (type.kind) {
      case "primitive":
        if (type.primitive === "u64") {
          return dir === "from"
            ? `toWireU64(${value}, ${JSON.stringify(value)})`
            : `assertU64(${value}, ${JSON.stringify(value)})`;
        }
        if (type.primitive === "bin32") {
          return `assertBin32(${value}, ${JSON.stringify(value)})`;
        }
        return value;
      case "vector":
      case "array": {
        if (this.isU8Array(type)) {
          return value;
        }
        const elem = this.generateConverter(dir, type.element!, "v");
        if (elem === "v") {
          return value;
        }
        const mapped = `${value}.map((v: any) => ${elem})`;
        // map() widens a tuple to an array, so re-assert the arity for the
        // fixed-size case; the length itself is fixed by the schema.
        const target =
          type.kind === "array"
            ? dir === "to"
              ? this.fixedArrayType(this.mapType(type.element!), type.size)
              : this.fixedArrayType(
                  this.mapMsgpackType(type.element!),
                  type.size,
                )
            : undefined;
        return target && target.startsWith("[")
          ? `(${mapped} as ${target})`
          : mapped;
      }
      case "optional": {
        const inner = this.generateConverter(dir, type.element!, value);
        return inner === value
          ? `${value} ?? null`
          : `${value} != null ? ${inner} : null`;
      }
      case "struct":
        return `${dir}${this.typeName(type.struct!.name)}(${value})`;
    }
    return value;
  }

  private generateToConverter(type: Type, value: string): string {
    return this.generateConverter("to", type, value);
  }

  private generateFromConverter(type: Type, value: string): string {
    return this.generateConverter("from", type, value);
  }

  // Generate types file (api_types.ts)
  generateTypes(schema: CompiledSchema, schemaHash?: string): string {
    const allStructs = dedupeStructsByName([
      ...schema.structs.values(),
      ...schema.responses.values(),
    ]);

    const aliasTypes = new Map<string, string>();
    const collectAliases = (type: Type): void => {
      if (type.kind === "primitive" && type.originalName) {
        aliasTypes.set(
          toAliasName(type.originalName),
          this.primitiveType(type),
        );
      } else if (
        type.kind === "vector" ||
        type.kind === "array" ||
        type.kind === "optional"
      ) {
        if (type.element) collectAliases(type.element);
      }
    };
    for (const s of allStructs) {
      for (const f of s.fields) collectAliases(f.type);
    }
    const aliasDecls = [...aliasTypes.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, underlying]) => `export type ${name} = ${underlying};`)
      .join("\n");

    // Public interfaces
    const publicInterfaces = allStructs
      .map((s) => this.generateInterface(s))
      .join("\n\n");

    // Msgpack interfaces
    const msgpackInterfaces = allStructs
      .map((s) => this.generateMsgpackInterface(s))
      .join("\n\n");

    // Conversion functions
    const toFunctions = allStructs
      .map((s) => "export " + this.generateToFunction(s))
      .join("\n\n");

    const fromFunctions = allStructs
      .map((s) => "export " + this.generateFromFunction(s))
      .join("\n\n");

    const asyncApiMethods = schema.commands
      .map(
        (c) =>
          `  ${this.toMethodName(c.name)}(command: ${this.typeName(c.name)}): Promise<${this.typeName(c.responseType)}>;`,
      )
      .join("\n");
    const syncApiMethods = schema.commands
      .map(
        (c) =>
          `  ${this.toMethodName(c.name)}(command: ${this.typeName(c.name)}): ${this.typeName(c.responseType)};`,
      )
      .join("\n");

    const hashLine = schemaHash
      ? `\n/** Schema version hash for compatibility checking */\nexport const SCHEMA_HASH = '${schemaHash}';\n`
      : "";

    return `// AUTOGENERATED FILE - DO NOT EDIT
${hashLine}
// Runtime guards for wire types that JS cannot represent natively.
// TODO: migrate u64 fields to bigint end-to-end and drop these.
//
// Decode: msgpackr returns uint64/int64 wire values as bigint once they
// exceed 32 bits; values must fit in the JS safe integer range.
function assertU64(value: number | bigint, ctx: string): number {
  if (typeof value === "bigint") {
    if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error(\`\${ctx}: u64 value \${value} is outside JS safe integer range\`);
    }
    return Number(value);
  }
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(\`\${ctx}: u64 value \${value} is outside JS safe integer range\`);
  }
  return value;
}

// Encode: msgpackr encodes JS numbers above 2^32 as float64, which strict
// u64 decoders reject; route them through bigint so the wire type stays uint.
function toWireU64(value: number | bigint, ctx: string): number | bigint {
  const checked = assertU64(value, ctx);
  return checked > 0xffffffff ? BigInt(checked) : checked;
}

function assertBin32(value: Uint8Array, ctx: string): Uint8Array {
  if (value.length !== 32) {
    throw new Error(\`\${ctx}: expected 32 bytes, got \${value.length}\`);
  }
  return value;
}

// Type aliases for primitive types
${aliasDecls}

// Public interfaces (exported)
${publicInterfaces}

// Private Msgpack interfaces (not exported)
${msgpackInterfaces}

// Conversion functions (exported)
${toFunctions}

${fromFunctions}

// Base API interfaces
export interface AsyncApiBase {
${asyncApiMethods}
  destroy(): Promise<void>;
}

export interface SyncApiBase {
${syncApiMethods}
  destroy(): void;
}
`;
  }

  // Generate API method
  private generateAsyncApiMethod(command: Command): string {
    const methodName = this.toMethodName(command.name);
    const cmdType = this.typeName(command.name);
    const respType = this.typeName(command.responseType);

    return `  ${methodName}(command: ${cmdType}): Promise<${respType}> {
    const msgpackCommand = from${cmdType}(command);
    return msgpackCall(this.backend, [["${command.name}", msgpackCommand]]).then(([variantName, result]: [string, any]) => {
      if (variantName === '${this.errorTypeName}') {
        throw this.createError(result.message || 'Unknown error from server');
      }
      if (variantName !== '${command.responseType}') {
        throw new Error(\`Expected variant name '${command.responseType}' but got '\${variantName}'\`);
      }
      return to${respType}(result);
    });
  }`;
  }

  private generateSyncApiMethod(command: Command): string {
    const methodName = this.toMethodName(command.name);
    const cmdType = this.typeName(command.name);
    const respType = this.typeName(command.responseType);

    return `  ${methodName}(command: ${cmdType}): ${respType} {
    const msgpackCommand = from${cmdType}(command);
    const [variantName, result] = msgpackCall(this.backend, [["${command.name}", msgpackCommand]]);
    if (variantName === '${this.errorTypeName}') {
      throw this.createError(result.message || 'Unknown error from server');
    }
    if (variantName !== '${command.responseType}') {
      throw new Error(\`Expected variant name '${command.responseType}' but got '\${variantName}'\`);
    }
    return to${respType}(result);
  }`;
  }

  // Generate async API file
  generateAsyncApi(schema: CompiledSchema): string {
    this.errorTypeName = schema.errorTypeName;
    const imports = this.generateApiImports(schema, "AsyncApiBase");
    const methods = schema.commands
      .map((c) => this.generateAsyncApiMethod(c))
      .join("\n\n");

    return `// AUTOGENERATED FILE - DO NOT EDIT

import { Decoder, Encoder } from 'msgpackr';
${imports}

export interface IpcClientAsync {
  call(input: Uint8Array): Promise<Uint8Array>;
  destroy(): Promise<void>;
}

export type IpcErrorFactory = (message: string) => Error;

async function msgpackCall(backend: IpcClientAsync, input: any[]) {
  const inputBuffer = new Encoder({ useRecords: false, variableMapSize: true }).pack(input);
  const encodedResult = await backend.call(inputBuffer);
  return new Decoder({ useRecords: false }).unpack(encodedResult);
}

export class AsyncApi implements AsyncApiBase {
  constructor(
    protected backend: IpcClientAsync,
    protected createError: IpcErrorFactory = message => new Error(message),
  ) {}

${methods}

  destroy(): Promise<void> {
    return this.backend.destroy();
  }
}
`;
  }

  // Generate sync API file
  generateSyncApi(schema: CompiledSchema): string {
    this.errorTypeName = schema.errorTypeName;
    const imports = this.generateApiImports(schema, "SyncApiBase");
    const methods = schema.commands
      .map((c) => this.generateSyncApiMethod(c))
      .join("\n\n");

    return `// AUTOGENERATED FILE - DO NOT EDIT

import { Decoder, Encoder } from 'msgpackr';
${imports}

export interface IpcClientSync {
  call(input: Uint8Array): Uint8Array;
  destroy(): void;
}

export type IpcErrorFactory = (message: string) => Error;

function msgpackCall(backend: IpcClientSync, input: any[]) {
  const inputBuffer = new Encoder({ useRecords: false, variableMapSize: true }).pack(input);
  const encodedResult = backend.call(inputBuffer);
  return new Decoder({ useRecords: false }).unpack(encodedResult);
}

export class SyncApi implements SyncApiBase {
  constructor(
    protected backend: IpcClientSync,
    protected createError: IpcErrorFactory = message => new Error(message),
  ) {}

${methods}

  destroy(): void {
    this.backend.destroy();
  }
}
`;
  }

  // Generate import statement for API files
  private generateApiImports(
    schema: CompiledSchema,
    baseInterface: string,
  ): string {
    const types = new Set<string>();

    // Add command types and their conversion functions
    for (const cmd of schema.commands) {
      const cmdType = this.typeName(cmd.name);
      const respType = this.typeName(cmd.responseType);
      types.add(cmdType);
      types.add(respType);
      types.add(`from${cmdType}`);
      types.add(`to${respType}`);
    }

    types.add(baseInterface);

    const sortedTypes = Array.from(types).sort();
    return `import { ${sortedTypes.join(", ")} } from './api_types.js';`;
  }

  // -----------------------------------------------------------------------
  // Server-side code generation
  // -----------------------------------------------------------------------

  /** Generate a server handler interface and dispatch function */
  generateServerApi(schema: CompiledSchema): string {
    this.errorTypeName = schema.errorTypeName;
    const errorType = this.typeName(this.errorTypeName);

    // Generate handler interface
    const handlerMethods = schema.commands
      .map((c) => {
        const methodName = this.toMethodName(c.name);
        const cmdType = this.typeName(c.name);
        const respType = this.typeName(c.responseType);
        return `  ${methodName}(command: ${cmdType}): Promise<${respType}>;`;
      })
      .join("\n");

    // Generate dispatch switch cases
    const dispatchCases = schema.commands
      .map((c) => {
        const methodName = this.toMethodName(c.name);
        const cmdType = this.typeName(c.name);
        const respType = this.typeName(c.responseType);
        return `      case '${c.name}': {
        const cmd = to${cmdType}(payload);
        const result = await handler.${methodName}(cmd);
        return ['${c.responseType}', from${respType}(result)];
      }`;
      })
      .join("\n");

    const typeImports = new Set<string>();
    const valueImports = new Set<string>();
    for (const cmd of schema.commands) {
      const cmdType = this.typeName(cmd.name);
      const respType = this.typeName(cmd.responseType);
      typeImports.add(cmdType);
      typeImports.add(respType);
      valueImports.add(`to${cmdType}`);
      valueImports.add(`from${respType}`);
    }
    const sortedTypeImports = Array.from(typeImports).sort();
    const sortedValueImports = Array.from(valueImports).sort();

    return `// AUTOGENERATED FILE - DO NOT EDIT
// Server-side dispatch for IPC protocol

import { Decoder, Encoder } from 'msgpackr';
import type { ${sortedTypeImports.join(", ")} } from './api_types.js';
import { ${sortedValueImports.join(", ")} } from './api_types.js';

/** Handler interface — implement this to serve commands. */
export interface Handler {
${handlerMethods}
}

/**
 * Dispatch a [commandName, payload] pair to the handler.
 * Returns [responseName, responsePayload] for serialization.
 * Handler failures are wrapped into the schema error variant.
 */
export async function dispatch(
  handler: Handler,
  commandName: string,
  payload: any,
): Promise<[string, any]> {
  try {
    switch (commandName) {
${dispatchCases}
      default:
        return ['${this.errorTypeName}', { message: \`Unknown command: \${commandName}\` }];
    }
  } catch (err: any) {
    return ['${this.errorTypeName}', { message: err?.message ?? String(err) }];
  }
}

const requestDecoder = new Decoder({ useRecords: false });
const responseEncoder = new Encoder({ useRecords: false, variableMapSize: true });

/**
 * Decode a framed request, dispatch it, and encode the framed response.
 * All failures (malformed framing included) produce a decodable error
 * variant rather than a throw, so transports can use this directly as
 * their request handler.
 */
export async function handleRequest(
  handler: Handler,
  requestBytes: Uint8Array,
): Promise<Uint8Array> {
  let commandName: string;
  let payload: any;
  try {
    const request = requestDecoder.unpack(requestBytes) as [[string, any]];
    [[commandName, payload]] = request;
    if (typeof commandName !== 'string') {
      throw new Error('expected [name, payload] request framing');
    }
  } catch (err: any) {
    return responseEncoder.pack([
      '${this.errorTypeName}',
      { message: \`Malformed request: \${err?.message ?? String(err)}\` },
    ]);
  }
  const [respName, respPayload] = await dispatch(handler, commandName, payload ?? {});
  return responseEncoder.pack([respName, respPayload]);
}
`;
  }
}
