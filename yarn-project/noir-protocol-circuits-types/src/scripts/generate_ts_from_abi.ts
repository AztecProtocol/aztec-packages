import { type AbiType } from '@aztec/foundation/abi';
import { createConsoleLogger } from '@aztec/foundation/log';
import { type NoirCompiledCircuit, type NoirFunctionAbi } from '@aztec/types/noir';

import { pascalCase } from 'change-case';
import fs from 'fs/promises';

import {
  type AbiTypeWithGenerics,
  type BindingId,
  type StructType,
  findAllStructsInType,
  mapAbiTypeToAbiTypeWithGenerics,
} from './abi_type_with_generics.js';
import { Demonomorphizer } from './demonomorphizer.js';

const log = createConsoleLogger('aztec:noir-contracts');

/**
 * Keep track off all of the Noir primitive types that were used.
 * Most of these will not have a 1-1 definition in TypeScript,
 * so we will need to generate type aliases for them.
 *
 * We want to generate type aliases
 * for specific types that are used in the ABI.
 *
 * For example:
 * - If `Field` is used we want to alias that
 * with `number`.
 * - If `u32` is used we want to alias that with `number` too.
 */
type PrimitiveTypesUsed = {
  /**
   * The name of the type alias that we will generate.
   */
  aliasName: string;
  /**
   * The TypeScript type that we will alias to.
   */
  tsType: string;
};

const noirPrimitiveTypesToTsTypes = new Map<string, PrimitiveTypesUsed>();

/**
 * Typescript does not allow us to check for equality of non-primitive types
 * easily, so we create a addIfUnique function that will only add an item
 * to the map if it is not already there by using JSON.stringify.
 * @param item - The item to add to the map.
 */
function addIfUnique(item: PrimitiveTypesUsed) {
  const key = JSON.stringify(item);
  if (!noirPrimitiveTypesToTsTypes.has(key)) {
    noirPrimitiveTypesToTsTypes.set(key, item);
  }
}

/**
 * Converts an ABI type to a TypeScript type.
 * @param type - The ABI type to convert.
 * @returns The typescript code to define the type.
 */
function abiTypeToTs(type: AbiType): string {
  switch (type.kind) {
    case 'integer': {
      let tsIntType = '';
      if (type.sign === 'signed') {
        tsIntType = `i${type.width}`;
      } else {
        tsIntType = `u${type.width}`;
      }
      addIfUnique({ aliasName: tsIntType, tsType: 'string' });
      return tsIntType;
    }
    case 'boolean':
      return `boolean`;
    case 'array':
      return `FixedLengthArray<${abiTypeToTs(type.type)}, ${type.length}>`;
    case 'struct':
      return getLastComponentOfPath(type.path);
    case 'field':
      addIfUnique({ aliasName: 'Field', tsType: 'string' });
      return 'Field';
    default:
      throw new Error(`Unknown ABI type ${type}`);
  }
}

/**
 * Returns the last component of a path, e.g. "foo::bar::baz" -\> "baz"
 * Note: that if we have a path such as "Baz", we will return "Baz".
 *
 * Since these paths corresponds to structs, we can assume that we
 * cannot have "foo::bar::".
 *
 * We also make the assumption that since these paths are coming from
 * Noir, then we will not have two paths that look like this:
 * - foo::bar::Baz
 * - cat::dog::Baz
 * ie the last component of the path (struct name) is enough to uniquely identify
 * the whole path.
 *
 * TODO: We should double check this assumption when we use type aliases,
 * I expect that `foo::bar::Baz as Dog` would effectively give `foo::bar::Dog`
 * @param str - The path to get the last component of.
 * @returns The last component of the path.
 */
function getLastComponentOfPath(str: string): string {
  const parts = str.split('::');
  const lastPart = parts[parts.length - 1];
  return lastPart;
}

/**
 * Generates TypeScript interfaces for the structs used in the ABI.
 * @param type - The ABI type to generate the interface for.
 * @param output - The set of structs that we have already generated bindings for.
 * @returns The TypeScript code to define the struct.
 */
function generateStructInterfaces(type: AbiType, output: Set<string>): string {
  let result = '';

  // Edge case to handle the array of structs case.
  if (
    type.kind === 'array' &&
    ((type.type.kind === 'struct' && !output.has(getLastComponentOfPath(type.type.path))) || type.type.kind === 'array')
  ) {
    result += generateStructInterfaces(type.type, output);
  }

  if (type.kind !== 'struct') {
    return result;
  }

  // List of structs encountered while viewing this type that we need to generate
  // bindings for.
  const typesEncountered = new Set<AbiType>();

  // Codegen the struct and then its fields, so that the structs fields
  // are defined before the struct itself.
  let codeGeneratedStruct = '';
  let codeGeneratedStructFields = '';

  const structName = getLastComponentOfPath(type.path);
  if (!output.has(structName)) {
    codeGeneratedStruct += `export interface ${structName} {\n`;
    for (const field of type.fields) {
      codeGeneratedStruct += `  ${field.name}: ${abiTypeToTs(field.type)};\n`;
      typesEncountered.add(field.type);
    }
    codeGeneratedStruct += `}\n\n`;
    output.add(structName);

    // Generate code for the encountered structs in the field above
    for (const type of typesEncountered) {
      codeGeneratedStructFields += generateStructInterfaces(type, output);
    }
  }

  return codeGeneratedStructFields + '\n' + codeGeneratedStruct;
}

/**
 * Generates a TypeScript interface for the ABI.
 * @param abiObj - The ABI to generate the interface for.
 * @returns The TypeScript code to define the interface.
 */
function generateTsInterface(abiObj: NoirFunctionAbi): string {
  let result = ``;
  const outputStructs = new Set<string>();

  // Define structs for composite types
  for (const param of abiObj.parameters) {
    result += generateStructInterfaces(param.type, outputStructs);
  }

  // Generating Return type, if it exists
  //
  if (abiObj.return_type != null) {
    result += generateStructInterfaces(abiObj.return_type.abi_type, outputStructs);
    result += `export type ReturnType = ${abiTypeToTs(abiObj.return_type.abi_type)};\n`;
  }

  // Generating Input type
  result += '\nexport interface InputType {\n';
  for (const param of abiObj.parameters) {
    result += `  ${param.name}: ${abiTypeToTs(param.type)};\n`;
  }
  result += '}';

  // Add the primitive Noir types that do not have a 1-1 mapping to TypeScript.
  let primitiveTypeAliases = '';
  for (const [, value] of noirPrimitiveTypesToTsTypes) {
    primitiveTypeAliases += `\nexport type ${value.aliasName} = ${value.tsType};`;
  }

  const fixedLengthArray =
    '\nexport type FixedLengthArray<T, L extends number> = L extends 0 ? never[]: T[] & { length: L }';

  return (
    `/* Autogenerated file, do not edit! */\n\n/* eslint-disable */\n` +
    fixedLengthArray +
    '\n' +
    primitiveTypeAliases +
    '\n' +
    result
  );
}

function replaceNumericBinding(id: number | BindingId, genericsNameMap: Map<number, string>): string {
  if (typeof id === 'number') {
    return id.toString();
  } else {
    return genericsNameMap.get(id.id) ?? 'unknown';
  }
}

class TypingsGenerator {
  private primitiveTypesUsed = new Map<string, PrimitiveTypesUsed>();
  private allTypes: AbiTypeWithGenerics[] = [];
  private monomorphizedAbis: {
    circuitName: string;
    params: { name: string; type: AbiTypeWithGenerics }[];
    returnType?: AbiTypeWithGenerics;
  }[] = [];

  constructor(circuits: { abi: NoirFunctionAbi; circuitName: string }[]) {
    for (const { abi, circuitName } of circuits) {
      const params = abi.parameters.map(param => {
        const type = mapAbiTypeToAbiTypeWithGenerics(param.type);
        this.allTypes.push(type);
        return { name: param.name, type };
      });
      if (abi.return_type) {
        const returnType = mapAbiTypeToAbiTypeWithGenerics(abi.return_type.abi_type);
        this.allTypes.push(returnType);
        this.monomorphizedAbis.push({ circuitName, params, returnType });
      } else {
        this.monomorphizedAbis.push({ circuitName, params });
      }
    }
    Demonomorphizer.demonomorphize(this.allTypes);
  }

  public codegen(): string {
    this.primitiveTypesUsed = new Map<string, PrimitiveTypesUsed>();
    const structsCode = this.codegenAllStructs();
    const interfacesCode = this.codegenAllInterfaces();
    const primitivesCode = this.codegenAllPrimitives();

    return `
    /* Autogenerated file, do not edit! */
    /* eslint-disable */
    ${primitivesCode}
    ${structsCode}
    ${interfacesCode}`;
  }

  private codegenAllStructs(): string {
    const allStructs = this.allTypes.flatMap(findAllStructsInType);
    const structTypesToExport = new Map<string, StructType>();
    for (const struct of allStructs) {
      const id = Demonomorphizer.buildIdForStruct(struct);
      if (structTypesToExport.has(id)) {
        continue;
      }
      structTypesToExport.set(id, struct.structType);
    }

    let resultCode = '';

    for (const structType of structTypesToExport.values()) {
      resultCode += this.codegenStructType(structType);
    }

    return resultCode;
  }

  private codegenStructType(structType: StructType): string {
    const genericsNameMap = new Map<number, string>();
    structType.generics.forEach((generic, index) => {
      genericsNameMap.set(generic.id, String.fromCharCode('A'.charCodeAt(0) + index));
    });
    const name = structType.path.split('::').pop();
    const generics = structType.generics.length
      ? `<${structType.generics
          .map(generic => `${genericsNameMap.get(generic.id)}${generic.isNumeric ? ' extends number' : ''}`)
          .join(', ')}>`
      : '';
    let resultCode = `export interface ${name}${generics} {\n`;

    for (const field of structType.fields) {
      resultCode += `  ${field.name}: ${this.codegenType(field.type, genericsNameMap)};\n`;
    }

    resultCode += '}\n\n';

    return resultCode;
  }

  private codegenType(type: AbiTypeWithGenerics, genericsNameMap: Map<number, string>): string {
    switch (type.kind) {
      case 'field':
        this.addIfUnique({ aliasName: 'Field', tsType: 'string' });
        return 'Field';
      case 'boolean':
        return 'boolean';
      case 'integer': {
        let tsIntType = '';
        if (type.sign === 'signed') {
          tsIntType = `i${type.width}`;
        } else {
          tsIntType = `u${type.width}`;
        }
        this.addIfUnique({ aliasName: tsIntType, tsType: 'string' });
        return tsIntType;
      }
      case 'binding':
        return genericsNameMap.get(type.id.id) ?? 'unknown';
      case 'constant':
        return type.value.toString();
      case 'string':
        return `string`;
      case 'array':
        return `FixedLengthArray<${this.codegenType(type.type, genericsNameMap)}, ${replaceNumericBinding(
          type.length,
          genericsNameMap,
        )}>`;
      case 'tuple':
        throw new Error('Unimplemented');
      case 'struct': {
        const name = type.structType.path.split('::').pop()!;
        if (type.args.length) {
          const args = type.args.map(arg => this.codegenType(arg, genericsNameMap)).join(', ');
          return `${name}<${args}>`;
        } else {
          return name;
        }
      }
    }
  }

  /**
   * Typescript does not allow us to check for equality of non-primitive types
   * easily, so we create a addIfUnique function that will only add an item
   * to the map if it is not already there by using JSON.stringify.
   * @param item - The item to add to the map.
   */
  private addIfUnique(item: PrimitiveTypesUsed) {
    const key = JSON.stringify(item);
    if (!this.primitiveTypesUsed.has(key)) {
      this.primitiveTypesUsed.set(key, item);
    }
  }

  private codegenAllInterfaces(): string {
    let resultCode = '';
    for (const { circuitName, params, returnType } of this.monomorphizedAbis) {
      resultCode += this.codegenStructType({
        path: `${circuitName}InputType`,
        fields: params,
        generics: [],
      });
      if (returnType) {
        resultCode += `export type ${circuitName}ReturnType = ${this.codegenType(returnType, new Map())};\n`;
      }
    }
    return resultCode;
  }

  private codegenAllPrimitives(): string {
    let primitiveTypeAliases =
      'export type FixedLengthArray<T, L extends number> = L extends 0 ? never[]: T[] & { length: L }\n';
    for (const [, value] of noirPrimitiveTypesToTsTypes) {
      primitiveTypeAliases += `export type ${value.aliasName} = ${value.tsType};\n`;
    }
    return primitiveTypeAliases;
  }
}

const circuits = [
  'parity_base',
  'parity_root',
  'private_kernel_init',
  'private_kernel_inner',
  'private_kernel_tail',
  'private_kernel_tail_to_public',
  'public_kernel_setup',
  'public_kernel_app_logic',
  'public_kernel_teardown',
  'public_kernel_tail',
  'rollup_base',
  'rollup_merge',
  'rollup_root',
  'test',
];

const main = async () => {
  try {
    await fs.access('./src/types/');
  } catch (error) {
    await fs.mkdir('./src/types', { recursive: true });
  }

  const allAbis = [];

  for (const circuit of circuits) {
    const rawData = await fs.readFile(`./src/target/${circuit}.json`, 'utf-8');
    const abiObj: NoirCompiledCircuit = JSON.parse(rawData);
    const generatedInterface = generateTsInterface(abiObj.abi);
    allAbis.push({
      abi: abiObj.abi,
      circuitName: pascalCase(circuit),
    });

    const outputFile = `./src/types/${circuit}_types.ts`;
    await fs.writeFile(outputFile, generatedInterface);
  }

  const typing = new TypingsGenerator(allAbis).codegen();
  await fs.writeFile(`./src/types/types.ts`, typing);
};

try {
  await main();
} catch (err: unknown) {
  log(`Error generating types ${err}`);
  process.exit(1);
}
