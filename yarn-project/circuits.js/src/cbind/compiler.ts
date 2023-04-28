import camelCase from 'lodash.camelcase';

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
  /**
   * High-level typescript type name.
   */
  typeName: string;
  /**
   * Msgpack type name. The actual type returned by raw C-binds.
   * Only given if different.
   */
  msgpackTypeName?: string;
  needsInterface?: boolean;
  isImport?: boolean;
  isAlias?: boolean;
  isTuple?: boolean;
  arraySubtype?: TypeInfo;
  mapSubtypes?: [TypeInfo, TypeInfo];
  declaration?: string;
  toClassMethod?: string;
  fromClassMethod?: string;
  toMsgpackMethod?: string;
}

function msgpackConverterExpr(typeInfo: TypeInfo, value: string): string {
  const { typeName } = typeInfo;
  if (typeInfo.isAlias) {
    return `${typeName}.fromBuffer(${value})`;
  } else if (typeInfo.arraySubtype) {
    const { typeName, msgpackTypeName } = typeInfo.arraySubtype;
    const convFn = `(v: ${msgpackTypeName || typeName}) => ${msgpackConverterExpr(typeInfo.arraySubtype, 'v')}`;
    if (typeInfo.isTuple) {
      return `mapTuple(${value}, ${convFn})`;
    } else {
      return `${value}.map(${convFn})`;
    }
  } else if (typeInfo.mapSubtypes) {
    const { typeName, msgpackTypeName } = typeInfo.mapSubtypes[1];
    const convFn = `(v: ${msgpackTypeName || typeName}) => ${msgpackConverterExpr(typeInfo.mapSubtypes[1], 'v')}`;
    return `mapValues(${value}, ${convFn})`;
  } else if (typeInfo.isImport) {
    return `to${typeName}(${value})`;
  } else {
    return value;
  }
}

function classConverterExpr(typeInfo: TypeInfo, value: string): string {
  const { typeName } = typeInfo;
  if (typeInfo.isAlias) {
    // TODO other aliases?
    return `${value}.toBuffer()`;
  } else if (typeInfo.arraySubtype) {
    const { typeName } = typeInfo.arraySubtype;
    const convFn = `(v: ${typeName}) => ${classConverterExpr(typeInfo.arraySubtype, 'v')}`;
    if (typeInfo.isTuple) {
      return `mapTuple(${value}, ${convFn})`;
    } else {
      return `${value}.map(${convFn})`;
    }
  } else if (typeInfo.mapSubtypes) {
    const { typeName } = typeInfo.mapSubtypes[1];
    const convFn = `(v: ${typeName}) => ${classConverterExpr(typeInfo.mapSubtypes[1], 'v')}`;
    return `mapValues(${value}, ${convFn})`;
  } else if (typeInfo.isImport) {
    return `from${typeName}(${value})`;
  } else {
    return value;
  }
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
        // fixed-size array case
        const [_array, [subtype, size]] = type;
        const typeName = `TupleOf<${this.getTypeName(subtype)}, ${size}>`;
        const msgpackTypeName = `TupleOf<${this.getMsgpackTypename(subtype)}, ${size}>`;
        return {
          typeName,
          msgpackTypeName,
          isTuple: true,
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
        return {
          typeName: `${subtypeInfo.typeName}[]`,
          msgpackTypeName: `${this.getMsgpackTypename(subtype)}[]`,
          arraySubtype: subtypeInfo,
        };
      } else if (type[0] === 'alias') {
        // alias case
        const [_alias, [typeName, msgpackName]] = type;
        if (!msgpackName.startsWith('bin')) {
          throw new Error('Only buffer aliases currently supported');
        }
        this.typeInfos[typeName] = {
          typeName,
          isImport: true,
          isAlias: true,
          msgpackTypeName: 'Buffer',
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
          msgpackTypeName: `Record<${this.getMsgpackTypename(keyType)}, ${this.getMsgpackTypename(valueType)}>`,
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
          return { typeName: 'Buffer' };
      }
      const typeName = capitalize(camelCase(type));
      if (!this.typeInfos[typeName]) {
        throw new Error('Unexpected type: ' + typeName + JSON.stringify(Object.keys(this.typeInfos)));
      }
      return this.typeInfos[typeName];
    } else if (typeof type === 'object') {
      const typeName = capitalize(camelCase(type.__typename as string));
      // Set our typeInfos object to either what it already was, or, if not yet defined
      // the resolved type info (which will generate interfaces and helper methods)
      return (this.typeInfos[typeName] = this.typeInfos[typeName] || {
        typeName,
        msgpackTypeName: 'Msgpack' + typeName,
        isImport: true,
        declaration: this.generateInterfaces(typeName, type),
        toClassMethod: this.generateMsgpackConverter(typeName, type),
        fromClassMethod: this.generateClassConverter(typeName, type),
      });
    }

    throw new Error(`Unsupported type: ${type}`);
  }

  private getMsgpackTypename(schema: Schema): string {
    const { msgpackTypeName, typeName } = this.getTypeInfo(schema);
    return msgpackTypeName || typeName;
  }
  /**
   * Generate an interface with the name 'name'.
   * @param name The interface name.
   * @param type The object schema with properties of the interface.
   */
  private generateInterfaces(name: string, type: ObjectSchema) {
    // Raw object, used as return value of fromType() generated functions.
    let resultRaw = `export interface Msgpack${name} {\n`;
    for (const [key, value] of Object.entries(type)) {
      if (key === '__typename') continue;
      resultRaw += `  ${key}: ${this.getMsgpackTypename(value)};\n`;
    }
    resultRaw += '}';
    // High level object, use in Type.from() methods
    let resultHighLevel = `export interface I${name} {\n`;
    for (const [key, value] of Object.entries(type)) {
      if (key === '__typename') continue;
      resultHighLevel += `  ${camelCase(key)}: ${this.getTypeName(value)};\n`;
    }
    resultHighLevel += '}';
    return resultRaw + '\n' + resultHighLevel;
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

    // TODO should we always just call constructor?
    const constructorBodySyntax = () => {
      const statements: string[] = [];
      for (const [key, value] of Object.entries(type)) {
        if (key === '__typename') continue;
        statements.push(`  ${msgpackConverterExpr(this.getTypeInfo(value), `o.${key}`)},`);
      }
      return statements.join('\n');
    };

    const callSyntax = () => {
      // return `${name}.from({\n${objectBodySyntax()}})`;
      return `new ${name}(\n${constructorBodySyntax()})`;
    };

    return `export function to${name}(o: Msgpack${name}): ${name} {
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
        statements.push(`  ${key}: ${classConverterExpr(this.getTypeInfo(value), `o.${camelCase(key)}`)},`);
      }
      return statements.join('\n');
    };

    const callSyntax = () => {
      return `{\n${bodySyntax()}}`;
    };

    return `export function from${name}(o: ${name}): Msgpack${name} {
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
    const typeInfos = args.map(arg => this.getTypeInfo(arg));
    const argStrings = typeInfos.map((typeInfo, i) => `arg${i}: ${typeInfo.typeName}`);
    const callStrings = typeInfos.map((typeInfo, i) => `${classConverterExpr(typeInfo, `arg${i}`)}`);
    const innerCall = `await callCbind(wasm, '${name}', [${callStrings.join(', ')}])`;
    const retType = this.getTypeInfo(cbind.ret);
    this.funcDecls.push(`export async function ${camelCase(name)}(wasm: CircuitsWasm, ${argStrings.join(
      ', ',
    )}): Promise<${retType.typeName}> {
return ${msgpackConverterExpr(retType, innerCall)};
}`);
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
      if (typeInfo.isAlias) {
        outputs[0] += `type Msgpack${typeInfo.typeName} = Buffer;`;
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
    outputs[0] += `import {${imports.join(', ')}} from "./types.js";`;
    outputs[0] += `import {TupleOf, mapTuple, mapValues} from "@aztec/foundation/serialize";`;
    for (const funcDecl of Object.values(this.funcDecls)) {
      outputs.push(funcDecl);
    }
    return outputs.join('\n');
  }
}
