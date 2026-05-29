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
import { toPascalCase, toSnakeCase } from "./naming.ts";

function toCamelCase(name: string): string {
  // If no underscores, assume already camelCase (e.g. forkId, classId)
  if (!name.includes("_")) {
    return name.charAt(0).toLowerCase() + name.slice(1);
  }
  const pascal = toPascalCase(name);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

export class TypeScriptCodegen {
  private errorTypeName: string = "ErrorResponse";
  /** Prefix to strip from command names when generating method names (e.g. "Bb" -> BbCircuitProve becomes circuitProve) */
  private methodPrefix: string = "";

  constructor(options?: { stripMethodPrefix?: string }) {
    if (options?.stripMethodPrefix) {
      this.methodPrefix = options.stripMethodPrefix;
    }
  }

  /** Strip the method prefix and convert to camelCase for API method names */
  private toMethodName(commandName: string): string {
    let name = commandName;
    if (this.methodPrefix && name.startsWith(this.methodPrefix)) {
      name = name.slice(this.methodPrefix.length);
    }
    return toCamelCase(name);
  }

  // Type mapping: Schema type -> TypeScript type
  private mapType(type: Type): string {
    switch (type.kind) {
      case "primitive":
        switch (type.primitive) {
          case "bool":
            return "boolean";
          case "u8":
            return "number";
          case "u16":
            return "number";
          case "u32":
            return "number";
          case "u64":
            return "number";
          case "f64":
            return "number";
          case "string":
            return "string";
          case "bytes":
            return "Uint8Array";
          case "fr":
            return "Fr"; // 32-byte field element
          case "field2":
            return "[Fr, Fr]"; // Extension field (Fq2)
          case "enum_u32":
            return "number"; // C++ enum as integer
          case "map_u32_pair":
            return "Record<number, [Uint8Array, number]>"; // map<enum, pair<fr, index>>
        }
        break;

      case "vector": {
        const inner = this.mapType(type.element!);
        // Wrap union types in parens to avoid precedence issues: (Foo | undefined)[]
        return type.element!.kind === "optional"
          ? `(${inner})[]`
          : `${inner}[]`;
      }

      case "array": {
        const inner = this.mapType(type.element!);
        return type.element!.kind === "optional"
          ? `(${inner})[]`
          : `${inner}[]`;
      }

      case "optional":
        return `${this.mapType(type.element!)} | null`;

      case "struct":
        return toPascalCase(type.struct!.name);
    }

    return "unknown";
  }

  // Type mapping for msgpack interfaces (uses Msgpack* prefix for structs)
  private mapMsgpackType(type: Type): string {
    switch (type.kind) {
      case "primitive":
        switch (type.primitive) {
          case "bool":
            return "boolean";
          case "u8":
            return "number";
          case "u16":
            return "number";
          case "u32":
            return "number";
          case "u64":
            return "number";
          case "f64":
            return "number";
          case "string":
            return "string";
          case "bytes":
            return "Uint8Array";
          case "fr":
            return "Uint8Array"; // Fr on the wire is still 32 bytes
          case "field2":
            return "[Uint8Array, Uint8Array]";
          case "enum_u32":
            return "number";
          case "map_u32_pair":
            return "Record<number, [Uint8Array, number]>";
        }
        break;

      case "vector": {
        const inner = this.mapMsgpackType(type.element!);
        return type.element!.kind === "optional"
          ? `(${inner})[]`
          : `${inner}[]`;
      }

      case "array": {
        const inner = this.mapMsgpackType(type.element!);
        return type.element!.kind === "optional"
          ? `(${inner})[]`
          : `${inner}[]`;
      }

      case "optional":
        return `${this.mapMsgpackType(type.element!)} | null`;

      case "struct":
        return `Msgpack${toPascalCase(type.struct!.name)}`;
    }

    return "unknown";
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
    const tsName = toPascalCase(struct.name);
    const fields = struct.fields.map((f) => this.generateField(f)).join("\n");

    return `export interface ${tsName} {
${fields}
}`;
  }

  // Generate msgpack interface (internal)
  private generateMsgpackInterface(struct: Struct): string {
    const tsName = toPascalCase(struct.name);
    const fields = struct.fields
      .map((f) => this.generateMsgpackField(f))
      .join("\n");

    return `interface Msgpack${tsName} {
${fields}
}`;
  }

  // Generate to* conversion function
  private generateToFunction(struct: Struct): string {
    const tsName = toPascalCase(struct.name);

    if (struct.fields.length === 0) {
      return `function to${tsName}(o: Msgpack${tsName}): ${tsName} {
  return {};
}`;
    }

    const checks = struct.fields
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
    const tsName = toPascalCase(struct.name);

    if (struct.fields.length === 0) {
      return `function from${tsName}(o: ${tsName}): Msgpack${tsName} {
  return {};
}`;
    }

    const checks = struct.fields
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

  // Generate converter for to* function
  private generateToConverter(type: Type, value: string): string {
    if (!this.needsConversion(type)) {
      return value;
    }

    switch (type.kind) {
      case "vector":
      case "array":
        if (this.needsConversion(type.element!)) {
          return `${value}.map((v: any) => ${this.generateToConverter(type.element!, "v")})`;
        }
        return value;
      case "optional":
        if (this.needsConversion(type.element!)) {
          return `${value} != null ? ${this.generateToConverter(type.element!, value)} : null`;
        }
        return value;
      case "struct":
        return `to${toPascalCase(type.struct!.name)}(${value})`;
    }
    return value;
  }

  // Generate converter for from* function
  private generateFromConverter(type: Type, value: string): string {
    if (!this.needsConversion(type)) {
      return value;
    }

    switch (type.kind) {
      case "vector":
      case "array":
        if (this.needsConversion(type.element!)) {
          return `${value}.map((v: any) => ${this.generateFromConverter(type.element!, "v")})`;
        }
        return value;
      case "optional":
        if (this.needsConversion(type.element!)) {
          return `${value} != null ? ${this.generateFromConverter(type.element!, value)} : null`;
        }
        return value;
      case "struct":
        return `from${toPascalCase(type.struct!.name)}(${value})`;
    }
    return value;
  }

  // Generate types file (api_types.ts)
  generateTypes(schema: CompiledSchema, schemaHash?: string): string {
    const allStructs = [
      ...schema.structs.values(),
      ...schema.responses.values(),
    ];

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
          `  ${this.toMethodName(c.name)}(command: ${toPascalCase(c.name)}): Promise<${toPascalCase(c.responseType)}>;`,
      )
      .join("\n");
    const syncApiMethods = schema.commands
      .map(
        (c) =>
          `  ${this.toMethodName(c.name)}(command: ${toPascalCase(c.name)}): ${toPascalCase(c.responseType)};`,
      )
      .join("\n");

    const hashLine = schemaHash
      ? `\n/** Schema version hash for compatibility checking */\nexport const SCHEMA_HASH = '${schemaHash}';\n`
      : "";

    return `// AUTOGENERATED FILE - DO NOT EDIT
${hashLine}
// Type aliases for primitive types
/** 32-byte field element (Fr/Fq). Branded Uint8Array — no arithmetic, just type safety. */
export type Fr = Uint8Array;
export type Field2 = [Fr, Fr];

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
    const cmdType = toPascalCase(command.name);
    const respType = toPascalCase(command.responseType);

    return `  ${methodName}(command: ${cmdType}): Promise<${respType}> {
    const msgpackCommand = from${cmdType}(command);
    return msgpackCall(this.backend, [["${command.name}", msgpackCommand]]).then(([variantName, result]: [string, any]) => {
      if (variantName === '${this.errorTypeName}') {
        throw new Error(result.message || 'Unknown error from server');
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
    const cmdType = toPascalCase(command.name);
    const respType = toPascalCase(command.responseType);

    return `  ${methodName}(command: ${cmdType}): ${respType} {
    const msgpackCommand = from${cmdType}(command);
    const [variantName, result] = msgpackCall(this.backend, [["${command.name}", msgpackCommand]]);
    if (variantName === '${this.errorTypeName}') {
      throw new Error(result.message || 'Unknown error from server');
    }
    if (variantName !== '${command.responseType}') {
      throw new Error(\`Expected variant name '${command.responseType}' but got '\${variantName}'\`);
    }
    return to${respType}(result);
  }`;
  }

  // Generate async API file
  generateAsyncApi(schema: CompiledSchema): string {
    this.errorTypeName = schema.errorTypeName || "ErrorResponse";
    const imports = this.generateApiImports(schema, "AsyncApiBase");
    const methods = schema.commands
      .map((c) => this.generateAsyncApiMethod(c))
      .join("\n\n");

    return `// AUTOGENERATED FILE - DO NOT EDIT

import type { IpcClientAsync } from '@aztec/ipc-runtime';
import { Decoder, Encoder } from 'msgpackr';
${imports}

async function msgpackCall(backend: IpcClientAsync, input: any[]) {
  const inputBuffer = new Encoder({ useRecords: false, variableMapSize: true }).pack(input);
  const encodedResult = await backend.call(inputBuffer);
  return new Decoder({ useRecords: false }).unpack(encodedResult);
}

export class AsyncApi implements AsyncApiBase {
  constructor(protected backend: IpcClientAsync) {}

${methods}

  destroy(): Promise<void> {
    return this.backend.destroy();
  }
}
`;
  }

  // Generate sync API file
  generateSyncApi(schema: CompiledSchema): string {
    this.errorTypeName = schema.errorTypeName || "ErrorResponse";
    const imports = this.generateApiImports(schema, "SyncApiBase");
    const methods = schema.commands
      .map((c) => this.generateSyncApiMethod(c))
      .join("\n\n");

    return `// AUTOGENERATED FILE - DO NOT EDIT

import type { IpcClientSync } from '@aztec/ipc-runtime';
import { Decoder, Encoder } from 'msgpackr';
${imports}

function msgpackCall(backend: IpcClientSync, input: any[]) {
  const inputBuffer = new Encoder({ useRecords: false, variableMapSize: true }).pack(input);
  const encodedResult = backend.call(inputBuffer);
  return new Decoder({ useRecords: false }).unpack(encodedResult);
}

export class SyncApi implements SyncApiBase {
  constructor(protected backend: IpcClientSync) {}

${methods}

  destroy(): void {
    this.backend.destroy();
  }
}
`;
  }

  // Generate import statement for API files
  private generateApiImports(schema: CompiledSchema, baseInterface: string): string {
    const types = new Set<string>();

    // Add command types and their conversion functions
    for (const cmd of schema.commands) {
      const cmdType = toPascalCase(cmd.name);
      const respType = toPascalCase(cmd.responseType);
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
    this.errorTypeName = schema.errorTypeName || "ErrorResponse";
    const errorType = toPascalCase(this.errorTypeName);

    // Generate handler interface
    const handlerMethods = schema.commands
      .filter((c) => !c.name.endsWith("Shutdown"))
      .map((c) => {
        const methodName = this.toMethodName(c.name);
        const cmdType = toPascalCase(c.name);
        const respType = toPascalCase(c.responseType);
        return `  ${methodName}(command: ${cmdType}): Promise<${respType}>;`;
      })
      .join("\n");

    // Generate dispatch switch cases
    const dispatchCases = schema.commands
      .filter((c) => !c.name.endsWith("Shutdown"))
      .map((c) => {
        const methodName = this.toMethodName(c.name);
        const cmdType = toPascalCase(c.name);
        const respType = toPascalCase(c.responseType);
        return `      case '${c.name}': {
        const cmd = to${cmdType}(payload);
        const result = await handler.${methodName}(cmd);
        return ['${c.responseType}', from${respType}(result)];
      }`;
      })
      .join("\n");

    // Collect imports
    const importTypes = new Set<string>();
    for (const cmd of schema.commands) {
      if (cmd.name.endsWith("Shutdown")) continue;
      const cmdType = toPascalCase(cmd.name);
      const respType = toPascalCase(cmd.responseType);
      importTypes.add(cmdType);
      importTypes.add(respType);
      importTypes.add(`to${cmdType}`);
      importTypes.add(`from${respType}`);
    }
    const sortedImports = Array.from(importTypes).sort();

    return `// AUTOGENERATED FILE - DO NOT EDIT
// Server-side dispatch for IPC protocol

import { ${sortedImports.join(", ")} } from './api_types.js';

/** Handler interface — implement this to serve commands. */
export interface Handler {
${handlerMethods}
}

/**
 * Dispatch a [commandName, payload] pair to the handler.
 * Returns [responseName, responsePayload] for serialization.
 */
export async function dispatch(
  handler: Handler,
  commandName: string,
  payload: any,
): Promise<[string, any]> {
  switch (commandName) {
${dispatchCases}
      default:
        throw new Error(\`Unknown command: \${commandName}\`);
  }
}
`;
  }

  // -----------------------------------------------------------------------
  // Skeleton generation (one-time handler stubs + main + build files)
  // -----------------------------------------------------------------------

  /** Generate handler stub implementations that throw "not implemented" */
  generateHandlerStubs(schema: CompiledSchema, prefix: string): string {
    const serverModule = `${toSnakeCase(prefix)}_server`;

    // Collect import types
    const importTypes = new Set<string>();
    for (const cmd of schema.commands) {
      if (cmd.name.endsWith("Shutdown")) continue;
      importTypes.add(toPascalCase(cmd.name));
      importTypes.add(toPascalCase(cmd.responseType));
    }
    importTypes.add("Handler");
    const sortedImports = Array.from(importTypes).sort();

    const stubs = schema.commands
      .filter((c) => !c.name.endsWith("Shutdown"))
      .map((c) => {
        const methodName = this.toMethodName(c.name);
        const cmdType = toPascalCase(c.name);
        const respType = toPascalCase(c.responseType);
        return `  async ${methodName}(command: ${cmdType}): Promise<${respType}> {
    throw new Error('not implemented: ${c.name}');
  }`;
      })
      .join("\n\n");

    return `// Handler stubs — implement your service logic here.
// This file is generated ONCE. Edit freely — it will not be overwritten.

import { ${sortedImports.join(", ")} } from './generated/${serverModule}.js';

/** Shared context for your service — add database connections, state, etc. */
export interface ${prefix}Context {
  // Add your shared state here
}

/** Handler implementation */
export class ${prefix}Handler implements Handler {
  constructor(public ctx: ${prefix}Context) {}

${stubs}
}
`;
  }

  /** Generate a main.ts entry point for a standalone service */
  generateMain(schema: CompiledSchema, prefix: string): string {
    const serverModule = `${toSnakeCase(prefix)}_server`;

    return `// Entry point for ${prefix} service.
// This file is generated ONCE. Edit freely — it will not be overwritten.

import { serve } from './generated/ipc_server.js';
import { dispatch } from './generated/${serverModule}.js';
import { ${prefix}Handler } from './${toSnakeCase(prefix)}_handlers.js';

const socketPath = process.argv[2];
if (!socketPath) {
  console.error('Usage: ${toSnakeCase(prefix)} <socket_path>');
  process.exit(1);
}

const ctx = {};
const handler = new ${prefix}Handler(ctx);

console.error(\`${prefix} server starting on \${socketPath}\`);
serve(socketPath, (commandName: string, payload: any) => dispatch(handler, commandName, payload));
`;
  }

  /** Generate package.json for a standalone service */
  generateBuildFile(prefix: string): string {
    const pkgName = toSnakeCase(prefix).replace(/_/g, "-");

    return (
      JSON.stringify(
        {
          name: `${pkgName}-service`,
          version: "0.1.0",
          type: "module",
          scripts: {
            build: "tsc",
            start: "node --experimental-strip-types main.ts",
            generate: "bash generate.sh",
          },
          dependencies: {
            msgpackr: "^1.10.0",
          },
          devDependencies: {
            typescript: "^5.4.0",
          },
        },
        null,
        2,
      ) + "\n"
    );
  }

  /** Generate .gitignore for the skeleton project */
  generateGitignore(): string {
    return `# Generated IPC code — do not edit, re-run generate.sh instead
generated/
node_modules/
dist/
`;
  }

  /** Generate a shell script to re-run codegen */
  generateGenerateScript(schemaPath: string, prefix: string): string {
    return `#!/usr/bin/env bash
# Re-generate IPC types, server, and client from schema.
# Run from the project root directory.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
SCHEMA="${schemaPath}"

node --experimental-strip-types "$(dirname "$SCRIPT_DIR")/codegen/src/generate.ts" \\
  --schema "$SCHEMA" \\
  --lang ts \\
  --out "$SCRIPT_DIR/generated" \\
  --prefix ${prefix} \\
  --server
`;
  }
}
