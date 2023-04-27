import camelCase from 'lodash.camelcase';
import { type } from 'os';

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.substring(1);
}

type ObjectSchema = { [key: string]: Schema };
type Schema =
  | string
  | ObjectSchema
  | ['tuple', Schema[]]
  | ['map', [Schema, Schema]]
  | ['optional', [Schema]]
  | ['vector', [Schema]]
  | ['variant', Schema[]]
  | ['shared_ptr', [Schema]]
  | ['array', [Schema, number]]
  | ['alias', [string, string]];

export interface TypeInfo {
  typeName: string;
  needsInterface?: boolean;
  isImport?: boolean;
  aliasOf?: string;
  arraySubtype?: TypeInfo;
  mapSubtypes?: [TypeInfo, TypeInfo];
  declaration?: string;
  toClassMethod?: string;
  fromClassMethod?: string;
  toMsgpackMethod?: string;
}

/**
 * Converts a spec emitted from the WASM to typescript code.
 */
export class CbindCompiler {
  // Function and declaration output fragments
  private typeInfos: Record<string, TypeInfo> = {};
  // cbind outputs, put at end
  private funcDecls: string[] = [];

  private getTypeName(type: Schema): string {
    return this.getTypeInfo(type).typeName;
  }
  /**
   * Derive the TypeScript type name of a schema, compiling anything needed along the way.
   * @param type A schema.
   * @returns The type name.
   */
  private getTypeInfo(type: Schema): TypeInfo {
    if (Array.isArray(type)) {
      if (type[0] === 'array') {
        // array case
        const [_array, [subtype, size]] = type;
        const subtypeName = this.getTypeName(subtype);
        const typeName = `FixedArray<${subtypeName}, ${size}>`;
        return {
          typeName,
          arraySubtype: this.getTypeInfo(subtype),
        };
      } else if (type[0] === 'vector') {
        // vector case
        const [_vector, [subtype]] = type;
        if (subtype == 'unsigned char') {
          // buffer special case
          return { typeName: 'Buffer' };
        }
        const subtypeInfo = this.getTypeInfo(subtype);
        const typeName = `${subtypeInfo.typeName}[]`;
        return {
          typeName,
          arraySubtype: subtypeInfo,
        };
      } else if (type[0] === 'alias') {
        // alias case
        const [_alias, [typeName, msgpackName]] = type;
        this.typeInfos[typeName] = {
          typeName,
          isImport: true,
          aliasOf: msgpackName,
        };
        return this.typeInfos[typeName];
      } else if (type[0] === 'shared_ptr') {
        // shared_ptr case
        const [_sharedPtr, [subtype]] = type;
        return this.getTypeInfo(subtype);
      } else if (type[0] === 'map') {
        // map case
        const [_map, [keyType, valueType]] = type;
        return {
          typeName: `Record<${this.getTypeName(keyType)}, ${this.getTypeName(valueType)}>`,
          mapSubtypes: [this.getTypeInfo(keyType), this.getTypeInfo(valueType)],
        };
      }
    } else if (typeof type === 'string') {
      switch (type) {
        case 'bool':
          return { typeName: 'boolean' };
        case 'unsigned int':
          return { typeName: 'number' };
        case 'string':
          return { typeName: 'string' };
        case 'bin32':
          return { typeName: 'buffer' };
      }
      const typeName = capitalize(camelCase(type));
      if (!this.typeInfos[typeName]) {
        throw new Error('Unexpected type: ' + typeName + JSON.stringify(Object.keys(this.typeInfos)));
      }
      return this.typeInfos[typeName];
    } else if (typeof type === 'object') {
      const typeName = capitalize(camelCase(type.__typename as string));
      this.typeInfos[typeName] = this.typeInfos[typeName] || {
        typeName,
        isImport: true,
        declaration: this.generateInterface(typeName, type),
        toClassMethod: this.generateMsgpackConverter(typeName, type),
        fromClassMethod: this.generateClassConverter(typeName, type),
      };
      return {
        typeName,
        isImport: true,
      };
    }

    throw new Error(`Unsupported type: ${type}`);
  }

  /**
   * Generate an interface with the name 'name'.
   * @param name The interface name.
   * @param type The object schema with properties of the interface.
   */
  private generateInterface(name: string, type: ObjectSchema) {
    let result = `export interface I${name} {\n`;
    for (const [key, value] of Object.entries(type)) {
      if (key === '__typename') continue;
      result += `  ${camelCase(key)}: ${this.getTypeName(value)};\n`;
    }
    return result + '}';
  }

  /**
   * Generate conversion method 'to{name}' for a specific type 'name'.
   * @param name The class name.
   * @param type The object schema with properties of the interface.
   */
  private generateMsgpackConverter(name: string, type: ObjectSchema): string {
    const typename = capitalize(camelCase(type.__typename as string));

    const checkerSyntax = () => {
      const statements: string[] = [];
      for (const [key] of Object.entries(type)) {
        if (key === '__typename') continue;
        statements.push(
          `  if (o.${key} === undefined) { throw new Error("Expected ${key} in ${typename} deserialization"); }`,
        );
      }
      return statements.join('\n');
    };

    const bodySyntax = () => {
      const statements: string[] = [];
      for (const [key, value] of Object.entries(type)) {
        if (key === '__typename') continue;
        const resolveFromExpr = (typeInfo: TypeInfo, value: string): string => {
          const { typeName } = typeInfo;
          if (typeInfo.aliasOf?.startsWith('bin')) {
            return `${typeName}.fromBuffer(${value})`;
          } else if (typeInfo.arraySubtype) {
            return `${value}.map((v: any) => ${resolveFromExpr(typeInfo.arraySubtype, 'v')})`;
          } else if (typeInfo.isImport) {
            return `to${typeName}(${value})`;
          } else {
            return value;
          }
        };
        statements.push(`  ${camelCase(key)}: ${resolveFromExpr(this.getTypeInfo(value), `o.${key}`)},`);
      }
      return statements.join('\n');
    };

    const callSyntax = () => {
      return `${name}.from({\n${bodySyntax()}})`;
    };

    return `export function to${name}(o: any): ${name} {
${checkerSyntax()};
return ${callSyntax.call(this)};
}`;
  }

  /**
   * Generate conversion method 'from{name}' for a specific type 'name'.
   * @param name The class name.
   * @param type The object schema with properties of the interface.
   */
  private generateClassConverter(name: string, type: ObjectSchema): string {
    const typename = capitalize(camelCase(type.__typename as string));

    const checkerSyntax = () => {
      const statements: string[] = [];
      for (const [key] of Object.entries(type)) {
        if (key === '__typename') continue;
        statements.push(
          `  if (o.${camelCase(key)} === undefined) { throw new Error("Expected ${camelCase(
            key,
          )} in ${typename} serialization"); }`,
        );
      }
      return statements.join('\n');
    };

    const bodySyntax = () => {
      const statements: string[] = [];
      for (const [key, value] of Object.entries(type)) {
        if (key === '__typename') continue;
        const resolveToExpr = (typeInfo: TypeInfo, value: string): string => {
          const { typeName } = typeInfo;
          if (typeInfo.aliasOf?.startsWith('bin')) {
            return `${value}.toBuffer()`;
          } else if (typeInfo.arraySubtype) {
            return `${value}.map((v: any) => ${resolveToExpr(typeInfo.arraySubtype, 'v')})`;
          } else if (typeInfo.isImport) {
            return `to${typeName}(${value})`;
          } else {
            return value;
          }
        };
        statements.push(`  ${key}: ${resolveToExpr(this.getTypeInfo(value), `o.${camelCase(key)}`)},`);
      }
      return statements.join('\n');
    };

    const callSyntax = () => {
      return `{\n${bodySyntax()}}`;
    };

    return `export function from${name}(o: ${name}): any {
${checkerSyntax()};
return ${callSyntax.call(this)};
}`;
  }
  /**
   * Process a cbind schema.
   * @param name The cbind name.
   * @param cbind The cbind schema.
   * @returns The compiled schema.
   */
  processCbind(name: string, cbind: { args: ['tuple', Schema[]]; ret: Schema }) {
    const [_tuple, args] = cbind.args;
    const compiled = { args: args.map(arg => this.getTypeName(arg)), ret: this.getTypeName(cbind.ret) };
    const argStrings = args.map((arg, i) => `arg${i}: ${this.getTypeName(arg)}`);
    this.funcDecls.push(`export function ${camelCase(name)}(wasm: CircuitsWasm, ${argStrings.join(
      ', ',
    )}): Promise<${this.getTypeName(cbind.ret)}> {
return callCbind(wasm, '${name}', [${argStrings.map(s => s.split(':')[0]).join(', ')}]);
}`);
    return compiled;
  }

  compile(): string {
    const imports: string[] = [];
    const outputs: string[] = [
      `
/* eslint-disable */
// GENERATED FILE DO NOT EDIT
import { Buffer } from "buffer";
import { callCbind } from './cbind.js';
import { CircuitsWasm } from '../wasm/index.js';
`,
    ];
    for (const typeInfo of Object.values(this.typeInfos)) {
      if (typeInfo.isImport) {
        imports.push(typeInfo.typeName);
      }
      if (typeInfo.declaration) {
        outputs.push(typeInfo.declaration);
        outputs.push('\n');
      }
      if (typeInfo.toClassMethod) {
        outputs.push(typeInfo.toClassMethod);
        outputs.push('\n');
      }
      if (typeInfo.fromClassMethod) {
        outputs.push(typeInfo.fromClassMethod);
        outputs.push('\n');
      }
    }
    outputs[0] += `import {FixedArray, ${imports.join(', ')}} from "./types.js";`;
    for (const funcDecl of Object.values(this.funcDecls)) {
      outputs.push(funcDecl);
    }
    return outputs.join('\n');
  }
}
