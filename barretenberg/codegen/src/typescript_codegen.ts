/**
 * TypeScript Code Generator - String template based
 *
 * Philosophy:
 *   - String templates for file structure
 *   - Simple type mapping
 *   - Idiomatic TypeScript conventions
 *   - No complex abstraction
 */

import type { CompiledSchema, Type, Struct, Field, Command } from './schema_visitor.ts';
import { toPascalCase } from './naming.ts';

function toCamelCase(name: string): string {
  // If no underscores, assume already camelCase (e.g. forkId, classId)
  if (!name.includes('_')) {
    return name.charAt(0).toLowerCase() + name.slice(1);
  }
  const pascal = toPascalCase(name);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

export class TypeScriptCodegen {
  private errorTypeName: string = 'ErrorResponse';

  // Type mapping: Schema type -> TypeScript type
  private mapType(type: Type): string {
    switch (type.kind) {
      case 'primitive':
        switch (type.primitive) {
          case 'bool': return 'boolean';
          case 'u8': return 'number';
          case 'u16': return 'number';
          case 'u32': return 'number';
          case 'u64': return 'number';
          case 'f64': return 'number';
          case 'string': return 'string';
          case 'bytes': return 'Uint8Array';
          case 'fr': return 'Fr';  // 32-byte field element
          case 'field2': return '[Fr, Fr]';  // Extension field (Fq2)
          case 'enum_u32': return 'number';  // C++ enum as integer
          case 'map_u32_pair': return 'Record<number, [Uint8Array, number]>';  // map<enum, pair<fr, index>>
        }
        break;

      case 'vector': {
        const inner = this.mapType(type.element!);
        // Wrap union types in parens to avoid precedence issues: (Foo | undefined)[]
        return type.element!.kind === 'optional' ? `(${inner})[]` : `${inner}[]`;
      }

      case 'array': {
        const inner = this.mapType(type.element!);
        return type.element!.kind === 'optional' ? `(${inner})[]` : `${inner}[]`;
      }

      case 'optional':
        return `${this.mapType(type.element!)} | undefined`;

      case 'struct':
        return toPascalCase(type.struct!.name);
    }

    return 'unknown';
  }

  // Type mapping for msgpack interfaces (uses Msgpack* prefix for structs)
  private mapMsgpackType(type: Type): string {
    switch (type.kind) {
      case 'primitive':
        switch (type.primitive) {
          case 'bool': return 'boolean';
          case 'u8': return 'number';
          case 'u16': return 'number';
          case 'u32': return 'number';
          case 'u64': return 'number';
          case 'f64': return 'number';
          case 'string': return 'string';
          case 'bytes': return 'Uint8Array';
          case 'fr': return 'Uint8Array';  // Fr on the wire is still 32 bytes
          case 'field2': return '[Uint8Array, Uint8Array]';
          case 'enum_u32': return 'number';
          case 'map_u32_pair': return 'Record<number, [Uint8Array, number]>';
        }
        break;

      case 'vector': {
        const inner = this.mapMsgpackType(type.element!);
        return type.element!.kind === 'optional' ? `(${inner})[]` : `${inner}[]`;
      }

      case 'array': {
        const inner = this.mapMsgpackType(type.element!);
        return type.element!.kind === 'optional' ? `(${inner})[]` : `${inner}[]`;
      }

      case 'optional':
        return `${this.mapMsgpackType(type.element!)} | undefined`;

      case 'struct':
        return `Msgpack${toPascalCase(type.struct!.name)}`;
    }

    return 'unknown';
  }

  // Check if type needs conversion (has nested structs)
  private needsConversion(type: Type): boolean {
    switch (type.kind) {
      case 'primitive':
        return false;
      case 'vector':
      case 'array':
      case 'optional':
        return this.needsConversion(type.element!);
      case 'struct':
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
    const fields = struct.fields.map(f => this.generateField(f)).join('\n');

    return `export interface ${tsName} {
${fields}
}`;
  }

  // Generate msgpack interface (internal)
  private generateMsgpackInterface(struct: Struct): string {
    const tsName = toPascalCase(struct.name);
    const fields = struct.fields.map(f => this.generateMsgpackField(f)).join('\n');

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
      .map(f => `  if (o.${f.name} === undefined) { throw new Error("Expected ${f.name} in ${tsName} deserialization"); }`)
      .join('\n');

    const conversions = struct.fields
      .map(f => {
        const tsFieldName = toCamelCase(f.name);
        const converter = this.generateToConverter(f.type, `o.${f.name}`);
        return `    ${tsFieldName}: ${converter},`;
      })
      .join('\n');

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
      .map(f => {
        const tsFieldName = toCamelCase(f.name);
        return `  if (o.${tsFieldName} === undefined) { throw new Error("Expected ${tsFieldName} in ${tsName} serialization"); }`;
      })
      .join('\n');

    const conversions = struct.fields
      .map(f => {
        const tsFieldName = toCamelCase(f.name);
        const converter = this.generateFromConverter(f.type, `o.${tsFieldName}`);
        return `  ${f.name}: ${converter},`;
      })
      .join('\n');

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
      case 'vector':
      case 'array':
        if (this.needsConversion(type.element!)) {
          return `${value}.map((v: any) => ${this.generateToConverter(type.element!, 'v')})`;
        }
        return value;
      case 'optional':
        if (this.needsConversion(type.element!)) {
          return `${value} != null ? ${this.generateToConverter(type.element!, value)} : undefined`;
        }
        return value;
      case 'struct':
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
      case 'vector':
      case 'array':
        if (this.needsConversion(type.element!)) {
          return `${value}.map((v: any) => ${this.generateFromConverter(type.element!, 'v')})`;
        }
        return value;
      case 'optional':
        if (this.needsConversion(type.element!)) {
          return `${value} != null ? ${this.generateFromConverter(type.element!, value)} : undefined`;
        }
        return value;
      case 'struct':
        return `from${toPascalCase(type.struct!.name)}(${value})`;
    }
    return value;
  }

  // Generate types file (api_types.ts)
  generateTypes(schema: CompiledSchema, schemaHash?: string): string {
    const allStructs = [...schema.structs.values(), ...schema.responses.values()];

    // Public interfaces
    const publicInterfaces = allStructs
      .map(s => this.generateInterface(s))
      .join('\n\n');

    // Msgpack interfaces
    const msgpackInterfaces = allStructs
      .map(s => this.generateMsgpackInterface(s))
      .join('\n\n');

    // Conversion functions
    const toFunctions = allStructs
      .map(s => 'export ' + this.generateToFunction(s))
      .join('\n\n');

    const fromFunctions = allStructs
      .map(s => 'export ' + this.generateFromFunction(s))
      .join('\n\n');

    // BbApiBase interface
    const apiMethods = schema.commands
      .map(c => `  ${toCamelCase(c.name)}(command: ${toPascalCase(c.name)}): Promise<${toPascalCase(c.responseType)}>;`)
      .join('\n');

    const hashLine = schemaHash ? `\n/** Schema version hash for compatibility checking */\nexport const SCHEMA_HASH = '${schemaHash}';\n` : '';

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

// Base API interface
export interface BbApiBase {
${apiMethods}
  destroy(): Promise<void>;
}
`;
  }

  // Generate API method
  private generateAsyncApiMethod(command: Command): string {
    const methodName = toCamelCase(command.name);
    const cmdType = toPascalCase(command.name);
    const respType = toPascalCase(command.responseType);

    return `  ${methodName}(command: ${cmdType}): Promise<${respType}> {
    const msgpackCommand = from${cmdType}(command);
    return msgpackCall(this.backend, [["${command.name}", msgpackCommand]]).then(([variantName, result]: [string, any]) => {
      if (variantName === '${this.errorTypeName}') {
        throw new BBApiException(result.message || 'Unknown error from barretenberg');
      }
      if (variantName !== '${command.responseType}') {
        throw new BBApiException(\`Expected variant name '${command.responseType}' but got '\${variantName}'\`);
      }
      return to${respType}(result);
    });
  }`;
  }

  private generateSyncApiMethod(command: Command): string {
    const methodName = toCamelCase(command.name);
    const cmdType = toPascalCase(command.name);
    const respType = toPascalCase(command.responseType);

    return `  ${methodName}(command: ${cmdType}): ${respType} {
    const msgpackCommand = from${cmdType}(command);
    const [variantName, result] = msgpackCall(this.backend, [["${command.name}", msgpackCommand]]);
    if (variantName === 'ErrorResponse') {
      throw new BBApiException(result.message || 'Unknown error from barretenberg');
    }
    if (variantName !== '${command.responseType}') {
      throw new BBApiException(\`Expected variant name '${command.responseType}' but got '\${variantName}'\`);
    }
    return to${respType}(result);
  }`;
  }

  // Generate async API file
  generateAsyncApi(schema: CompiledSchema): string {
    this.errorTypeName = schema.errorTypeName || 'ErrorResponse';
    const imports = this.generateApiImports(schema);
    const methods = schema.commands
      .map(c => this.generateAsyncApiMethod(c))
      .join('\n\n');

    return `// AUTOGENERATED FILE - DO NOT EDIT

import { IMsgpackBackendAsync } from '../../bb_backends/interface.js';
import { Decoder, Encoder } from 'msgpackr';
import { BBApiException } from '../../bbapi_exception.js';
${imports}

async function msgpackCall(backend: IMsgpackBackendAsync, input: any[]) {
  const inputBuffer = new Encoder({ useRecords: false }).pack(input);
  const encodedResult = await backend.call(inputBuffer);
  return new Decoder({ useRecords: false }).unpack(encodedResult);
}

export class AsyncApi implements BbApiBase {
  constructor(protected backend: IMsgpackBackendAsync) {}

${methods}

  destroy(): Promise<void> {
    return this.backend.destroy ? this.backend.destroy() : Promise.resolve();
  }
}
`;
  }

  // Generate sync API file
  generateSyncApi(schema: CompiledSchema): string {
    this.errorTypeName = schema.errorTypeName || 'ErrorResponse';
    const imports = this.generateApiImports(schema);
    const methods = schema.commands
      .map(c => this.generateSyncApiMethod(c))
      .join('\n\n');

    return `// AUTOGENERATED FILE - DO NOT EDIT

import { IMsgpackBackendSync } from '../../bb_backends/interface.js';
import { Decoder, Encoder } from 'msgpackr';
import { BBApiException } from '../../bbapi_exception.js';
${imports}

function msgpackCall(backend: IMsgpackBackendSync, input: any[]) {
  const inputBuffer = new Encoder({ useRecords: false }).pack(input);
  const encodedResult = backend.call(inputBuffer);
  return new Decoder({ useRecords: false }).unpack(encodedResult);
}

export class SyncApi {
  constructor(protected backend: IMsgpackBackendSync) {}

${methods}

  destroy(): void {
    if (this.backend.destroy) this.backend.destroy();
  }
}
`;
  }

  // Generate import statement for API files
  private generateApiImports(schema: CompiledSchema): string {
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

    // Add BbApiBase
    types.add('BbApiBase');

    const sortedTypes = Array.from(types).sort();
    return `import { ${sortedTypes.join(', ')} } from './api_types.js';`;
  }

  // -----------------------------------------------------------------------
  // Server-side code generation
  // -----------------------------------------------------------------------

  /** Generate a server handler interface and dispatch function */
  generateServerApi(schema: CompiledSchema): string {
    this.errorTypeName = schema.errorTypeName || 'ErrorResponse';
    const errorType = toPascalCase(this.errorTypeName);

    // Generate handler interface
    const handlerMethods = schema.commands
      .filter(c => !c.name.endsWith('Shutdown'))
      .map(c => {
        const methodName = toCamelCase(c.name);
        const cmdType = toPascalCase(c.name);
        const respType = toPascalCase(c.responseType);
        return `  ${methodName}(command: ${cmdType}): Promise<${respType}>;`;
      })
      .join('\n');

    // Generate dispatch switch cases
    const dispatchCases = schema.commands
      .filter(c => !c.name.endsWith('Shutdown'))
      .map(c => {
        const methodName = toCamelCase(c.name);
        const cmdType = toPascalCase(c.name);
        const respType = toPascalCase(c.responseType);
        return `      case '${c.name}': {
        const cmd = to${cmdType}(payload);
        const result = await handler.${methodName}(cmd);
        return ['${c.responseType}', from${respType}(result)];
      }`;
      })
      .join('\n');

    // Collect imports
    const importTypes = new Set<string>();
    for (const cmd of schema.commands) {
      if (cmd.name.endsWith('Shutdown')) continue;
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

import { ${sortedImports.join(', ')} } from './api_types.js';

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
}
