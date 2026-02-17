/**
 * TypeScript Code Generator - String template based
 *
 * Philosophy:
 *   - String templates for file structure
 *   - Simple type mapping
 *   - Idiomatic TypeScript conventions
 *   - No complex abstraction
 */

import type { CompiledSchema, Type, Struct, Field, Command } from './schema_visitor.js';
import { toPascalCase } from './naming.js';

function toCamelCase(name: string): string {
  const pascal = toPascalCase(name);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

export class TypeScriptCodegen {
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
          case 'field2': return '[Uint8Array, Uint8Array]';  // Extension field (Fq2)
        }
        break;

      case 'vector':
        return `${this.mapType(type.element!)}[]`;

      case 'array':
        return `${this.mapType(type.element!)}[]`;

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
          case 'field2': return '[Uint8Array, Uint8Array]';
        }
        break;

      case 'vector':
        return `${this.mapMsgpackType(type.element!)}[]`;

      case 'array':
        return `${this.mapMsgpackType(type.element!)}[]`;

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
          return `${value} !== undefined ? ${this.generateToConverter(type.element!, value)} : undefined`;
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
          return `${value} !== undefined ? ${this.generateFromConverter(type.element!, value)} : undefined`;
        }
        return value;
      case 'struct':
        return `from${toPascalCase(type.struct!.name)}(${value})`;
    }
    return value;
  }

  // Generate types file (api_types.ts)
  generateTypes(schema: CompiledSchema): string {
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

    return `// AUTOGENERATED FILE - DO NOT EDIT

// Type aliases for primitive types
export type Field2 = [Uint8Array, Uint8Array];

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
      if (variantName === 'ErrorResponse') {
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
}
