/**
 * TypeScript Code Generator - String template based
 *
 * Philosophy:
 *   - String templates for file structure
 *   - Simple type mapping
 *   - Idiomatic TypeScript conventions
 *   - No complex abstraction
 */

import type { CompiledSchema, Type, Struct, Field } from './schema_visitor.js';

export class TypeScriptCodegen {
  // Type mapping: Schema type -> TypeScript type
  private mapType(type: Type, forMsgpack = false): string {
    switch (type.kind) {
      case 'primitive':
        switch (type.primitive) {
          case 'bool': return 'boolean';
          case 'u8':
          case 'u16':
          case 'u32':
          case 'u64':
          case 'f64': return 'number';
          case 'string': return 'string';
          case 'bytes': return 'Uint8Array';
        }
        break;

      case 'vector':
        return `${this.mapType(type.element!, forMsgpack)}[]`;

      case 'array':
        return `${this.mapType(type.element!, forMsgpack)}[]`;

      case 'optional':
        return `${this.mapType(type.element!, forMsgpack)} | undefined`;

      case 'struct':
        const structName = this.toPascalCase(type.struct!.name);
        return forMsgpack ? `Msgpack${structName}` : structName;
    }

    return 'unknown';
  }

  // Convert name to camelCase
  private toCamelCase(name: string): string {
    return name.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '').replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  }

  // Convert type name to PascalCase
  private toPascalCase(name: string): string {
    if (!name.includes('_') && name[0] === name[0].toUpperCase()) {
      return name;
    }
    return name.split('_').map(part =>
      part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
    ).join('');
  }

  // Generate struct field
  private generateField(field: Field, forMsgpack = false): string {
    const fieldName = forMsgpack ? field.name : this.toCamelCase(field.name);
    const fieldType = this.mapType(field.type, forMsgpack);
    return `  ${fieldName}: ${fieldType};`;
  }

  // Generate a struct definition
  private generateStruct(struct: Struct): string {
    const tsName = this.toPascalCase(struct.name);
    const msgpackName = 'Msgpack' + tsName;

    const publicFields = struct.fields.map(f => this.generateField(f, false)).join('\n');
    const msgpackFields = struct.fields.map(f => this.generateField(f, true)).join('\n');

    const publicInterface = `/// ${struct.name}
export interface ${tsName} {
${publicFields}
}`;

    const msgpackInterface = `/// Msgpack format for ${struct.name}
interface ${msgpackName} {
${msgpackFields}
}`;

    // Generate conversion functions
    const toMethod = this.generateToMethod(struct, tsName, msgpackName);
    const fromMethod = this.generateFromMethod(struct, tsName, msgpackName);

    return `${publicInterface}\n\n${msgpackInterface}\n\n${toMethod}\n\n${fromMethod}`;
  }

  // Generate to-function (msgpack -> public)
  private generateToMethod(struct: Struct, tsName: string, msgpackName: string): string {
    const conversions = struct.fields.map(f => {
      const publicName = this.toCamelCase(f.name);
      const msgpackName = f.name;
      const converter = this.generateToConverter(f.type, `o.${msgpackName}`);
      return `    ${publicName}: ${converter},`;
    }).join('\n');

    return `export function to${tsName}(o: ${msgpackName}): ${tsName} {
  return {
${conversions}
  };
}`;
  }

  // Generate from-function (public -> msgpack)
  private generateFromMethod(struct: Struct, tsName: string, msgpackName: string): string {
    const conversions = struct.fields.map(f => {
      const publicName = this.toCamelCase(f.name);
      const msgpackName = f.name;
      const converter = this.generateFromConverter(f.type, `o.${publicName}`);
      return `    ${msgpackName}: ${converter},`;
    }).join('\n');

    return `export function from${tsName}(o: ${tsName}): ${msgpackName} {
  return {
${conversions}
  };
}`;
  }

  // Generate to-converter (msgpack -> public)
  private generateToConverter(type: Type, value: string): string {
    switch (type.kind) {
      case 'vector':
      case 'array':
        const elemConverter = this.generateToConverter(type.element!, 'v');
        if (elemConverter === 'v') {
          return value;
        }
        return `${value}.map(v => ${elemConverter})`;

      case 'optional':
        const optConverter = this.generateToConverter(type.element!, value);
        if (optConverter === value) {
          return value;
        }
        return `${value} === undefined ? undefined : ${optConverter}`;

      case 'struct':
        const toFunc = `to${this.toPascalCase(type.struct!.name)}`;
        return `${toFunc}(${value})`;

      default:
        return value;
    }
  }

  // Generate from-converter (public -> msgpack)
  private generateFromConverter(type: Type, value: string): string {
    switch (type.kind) {
      case 'vector':
      case 'array':
        const elemConverter = this.generateFromConverter(type.element!, 'v');
        if (elemConverter === 'v') {
          return value;
        }
        return `${value}.map(v => ${elemConverter})`;

      case 'optional':
        const optConverter = this.generateFromConverter(type.element!, value);
        if (optConverter === value) {
          return value;
        }
        return `${value} === undefined ? undefined : ${optConverter}`;

      case 'struct':
        const fromFunc = `from${this.toPascalCase(type.struct!.name)}`;
        return `${fromFunc}(${value})`;

      default:
        return value;
    }
  }

  // Generate types file
  generateTypes(schema: CompiledSchema): string {
    // Generate all structs (commands first, then responses)
    const commandStructs = Array.from(schema.structs.values())
      .map(s => this.generateStruct(s))
      .join('\n\n');

    const responseStructs = Array.from(schema.responses.values())
      .map(s => this.generateStruct(s))
      .join('\n\n');

    // Generate BbApiBase interface
    const apiInterface = this.generateBbApiBaseInterface(schema);

    return `// AUTOGENERATED - DO NOT EDIT
// Generated from Barretenberg msgpack schema

${commandStructs}

${responseStructs}

${apiInterface}
`;
  }

  // Generate BbApiBase interface
  private generateBbApiBaseInterface(schema: CompiledSchema): string {
    const methods = schema.commands.map(c => {
      const methodName = this.toCamelCase(c.name);
      const cmdType = this.toPascalCase(c.name);
      const respType = this.toPascalCase(c.responseType);
      return `  ${methodName}(command: ${cmdType}): Promise<${respType}>;`;
    }).join('\n');

    return `/// Base API interface
export interface BbApiBase {
${methods}
  destroy(): Promise<void>;
}`;
  }

  // Generate API implementation
  generateApi(schema: CompiledSchema, mode: 'sync' | 'async'): string {
    const className = mode === 'sync' ? 'SyncApi' : 'AsyncApi';
    const backendType = mode === 'sync' ? 'IMsgpackBackendSync' : 'IMsgpackBackendAsync';
    const isAsync = mode === 'async';

    const methods = schema.commands
      .map(c => this.generateApiMethod(c, isAsync))
      .join('\n\n');

    const msgpackCallHelper = this.generateMsgpackCallHelper(backendType, isAsync);
    const destroyMethod = this.generateDestroyMethod(isAsync);

    // Import all needed types
    const imports = this.generateApiImports(schema, backendType);

    return `${imports}

${msgpackCallHelper}

export class ${className}${isAsync ? ' implements BbApiBase' : ''} {
  constructor(protected backend: ${backendType}) {}

${methods}

${destroyMethod}
}
`;
  }

  // Generate imports for API file
  private generateApiImports(schema: CompiledSchema, backendType: string): string {
    const types = new Set<string>();
    const conversionFns = new Set<string>();

    for (const cmd of schema.commands) {
      const cmdType = this.toPascalCase(cmd.name);
      const respType = this.toPascalCase(cmd.responseType);
      types.add(cmdType);
      types.add(respType);
      conversionFns.add(`from${cmdType}`);
      conversionFns.add(`to${respType}`);
    }

    types.add('BbApiBase');

    const typeImports = Array.from(types).concat(Array.from(conversionFns)).sort().join(', ');

    return `// AUTOGENERATED - DO NOT EDIT
import { ${typeImports} } from './api_types.js';
import { ${backendType} } from '../bb_backends/interface.js';
import { Decoder, Encoder } from 'msgpackr';`;
  }

  // Generate msgpackCall helper
  private generateMsgpackCallHelper(backendType: string, isAsync: boolean): string {
    const awaitKeyword = isAsync ? 'await ' : '';
    const asyncKeyword = isAsync ? 'async ' : '';

    return `${asyncKeyword}function msgpackCall(backend: ${backendType}, input: any[]) {
  const inputBuffer = new Encoder({ useRecords: false }).pack(input);
  const encodedResult = ${awaitKeyword}backend.call(inputBuffer);
  return new Decoder({ useRecords: false }).unpack(encodedResult);
}`;
  }

  // Generate destroy method
  private generateDestroyMethod(isAsync: boolean): string {
    if (isAsync) {
      return `  destroy(): Promise<void> {
    return this.backend.destroy ? this.backend.destroy() : Promise.resolve();
  }`;
    } else {
      return `  destroy(): void {
    if (this.backend.destroy) this.backend.destroy();
  }`;
    }
  }

  // Generate API method
  private generateApiMethod(command: { name: string, fields: Field[], responseType: string }, isAsync: boolean): string {
    const methodName = this.toCamelCase(command.name);
    const cmdType = this.toPascalCase(command.name);
    const respType = this.toPascalCase(command.responseType);
    const capitalizedName = command.name.charAt(0).toUpperCase() + command.name.slice(1);

    if (isAsync) {
      return `  ${methodName}(command: ${cmdType}): Promise<${respType}> {
    const msgpackCommand = from${cmdType}(command);
    return msgpackCall(this.backend, [["${capitalizedName}", msgpackCommand]]).then(([variantName, result]: [string, any]) => {
      if (variantName !== '${respType}') {
        throw new Error(\`Expected variant name '${respType}' but got '\${variantName}'\`);
      }
      return to${respType}(result);
    });
  }`;
    } else {
      return `  ${methodName}(command: ${cmdType}): ${respType} {
    const msgpackCommand = from${cmdType}(command);
    const [variantName, result] = msgpackCall(this.backend, [["${capitalizedName}", msgpackCommand]]);
    if (variantName !== '${respType}') {
      throw new Error(\`Expected variant name '${respType}' but got '\${variantName}'\`);
    }
    return to${respType}(result);
  }`;
    }
  }
}
