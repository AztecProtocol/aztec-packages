/* eslint-disable camelcase */
import type { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { type ZodFor, schemas } from '@aztec/foundation/schemas';

import { inflate } from 'pako';
import { z } from 'zod';

import { FunctionSelector } from './function_selector.js';

/** A basic value. */
export interface BasicValue<T extends string, V> {
  /** The kind of the value. */
  kind: T;
  value: V;
}

const logger = createLogger('aztec:foundation:abi');

/** An exported value. */
export type AbiValue =
  | BasicValue<'boolean', boolean>
  | BasicValue<'string', string>
  | BasicValue<'array', AbiValue[]>
  | TupleValue
  | IntegerValue
  | StructValue;

export const AbiValueSchema: z.ZodType<AbiValue> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('boolean'), value: z.boolean() }),
  z.object({ kind: z.literal('string'), value: z.string() }),
  z.object({ kind: z.literal('array'), value: z.array(z.lazy(() => AbiValueSchema)) }),
  z.object({ kind: z.literal('tuple'), fields: z.array(z.lazy(() => AbiValueSchema)) }),
  z.object({ kind: z.literal('integer'), value: z.string(), sign: z.boolean() }),
  z.object({
    kind: z.literal('struct'),
    fields: z.array(z.object({ name: z.string(), value: z.lazy(() => AbiValueSchema) })),
  }),
]);

export type TypedStructFieldValue<T> = { name: string; value: T };

export interface StructValue {
  kind: 'struct';
  fields: TypedStructFieldValue<AbiValue>[];
}

export interface TupleValue {
  kind: 'tuple';
  fields: AbiValue[];
}

export interface IntegerValue extends BasicValue<'integer', string> {
  sign: boolean;
}

/** Indicates whether a parameter is public or secret/private. */
export const ABIParameterVisibility = ['public', 'private', 'databus'] as const;

/** Indicates whether a parameter is public or secret/private. */
export type ABIParameterVisibility = (typeof ABIParameterVisibility)[number];

/** A basic type. */
export interface BasicType<T extends string> {
  /** The kind of the type. */
  kind: T;
}

/** Sign for numeric types. */
const Sign = ['unsigned', 'signed'] as const;
type Sign = (typeof Sign)[number];

/** A variable type. */
export type AbiType =
  | BasicType<'field'>
  | BasicType<'boolean'>
  | IntegerType
  | ArrayType
  | StringType
  | StructType
  | TupleType;

export const AbiTypeSchema: z.ZodType<AbiType> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('field') }),
  z.object({ kind: z.literal('boolean') }),
  z.object({ kind: z.literal('integer'), sign: z.enum(Sign), width: z.number() }),
  z.object({ kind: z.literal('array'), length: z.number(), type: z.lazy(() => AbiTypeSchema) }),
  z.object({ kind: z.literal('string'), length: z.number() }),
  z.object({ kind: z.literal('struct'), fields: z.array(z.lazy(() => ABIVariableSchema)), path: z.string() }),
  z.object({ kind: z.literal('tuple'), fields: z.array(z.lazy(() => AbiTypeSchema)) }),
]);

/** A named type. */
export const ABIVariableSchema = z.object({
  /** The name of the variable. */
  name: z.string(),
  /** The type of the variable. */
  type: AbiTypeSchema,
});

/** A named type. */
export type ABIVariable = z.infer<typeof ABIVariableSchema>;

/** A function parameter. */
export const ABIParameterSchema = ABIVariableSchema.and(
  z.object({
    /** Visibility of the parameter in the function. */
    visibility: z.enum(ABIParameterVisibility),
  }),
);

/** A function parameter. */
export type ABIParameter = z.infer<typeof ABIParameterSchema>;

/** An integer type. */
export interface IntegerType extends BasicType<'integer'> {
  /** The sign of the integer. */
  sign: Sign;
  /** The width of the integer in bits. */
  width: number;
}

/** An array type. */
export interface ArrayType extends BasicType<'array'> {
  /** The length of the array. */
  length: number;
  /** The type of the array elements. */
  type: AbiType;
}

/** A tuple type. */
export interface TupleType extends BasicType<'tuple'> {
  /** The types of the tuple elements. */
  fields: AbiType[];
}

/** A string type. */
export interface StringType extends BasicType<'string'> {
  /** The length of the string. */
  length: number;
}

/** A struct type. */
export interface StructType extends BasicType<'struct'> {
  /** The fields of the struct. */
  fields: ABIVariable[];
  /** Fully qualified name of the struct. */
  path: string;
}

/** An error could be a custom error of any regular type or a string error. */
export type AbiErrorType =
  | { error_kind: 'string'; string: string }
  | { error_kind: 'fmtstring'; length: number; item_types: AbiType[] }
  | ({ error_kind: 'custom' } & AbiType);

const AbiErrorTypeSchema = z.union([
  z.object({ error_kind: z.literal('string'), string: z.string() }),
  z.object({ error_kind: z.literal('fmtstring'), length: z.number(), item_types: z.array(AbiTypeSchema) }),
  z.object({ error_kind: z.literal('custom') }).and(AbiTypeSchema),
]) satisfies ZodFor<AbiErrorType>;

/** Aztec.nr function types. */
export enum FunctionType {
  PRIVATE = 'private',
  PUBLIC = 'public',
  UTILITY = 'utility',
}

/** The abi entry of a function. */
export interface FunctionAbi {
  /** The name of the function. */
  name: string;
  /** Whether the function is secret. */
  functionType: FunctionType;
  /** Whether the function is internal. */
  isInternal: boolean;
  /** Whether the function can alter state or not */
  isStatic: boolean;
  /** Function parameters. */
  parameters: ABIParameter[];
  /** The types of the return values. */
  returnTypes: AbiType[];
  /** The types of the errors that the function can throw. */
  errorTypes: Partial<Record<string, AbiErrorType>>;
  /** Whether the function is flagged as an initializer. */
  isInitializer: boolean;
}

export const FunctionAbiSchema = z.object({
  name: z.string(),
  functionType: z.nativeEnum(FunctionType),
  isInternal: z.boolean(),
  isStatic: z.boolean(),
  isInitializer: z.boolean(),
  parameters: z.array(z.object({ name: z.string(), type: AbiTypeSchema, visibility: z.enum(ABIParameterVisibility) })),
  returnTypes: z.array(AbiTypeSchema),
  errorTypes: z.record(AbiErrorTypeSchema),
}) satisfies z.ZodType<FunctionAbi>;

/** Debug metadata for a function. */
export interface FunctionDebugMetadata {
  /** Maps opcodes to source code pointers */
  debugSymbols: DebugInfo;
  /** Maps the file IDs to the file contents to resolve pointers */
  files: DebugFileMap;
}

export const FunctionDebugMetadataSchema = z.object({
  debugSymbols: z.object({
    location_tree: z.object({
      locations: z.array(
        z.object({
          parent: z.number().nullable(),
          value: z.object({
            span: z.object({ start: z.number(), end: z.number() }),
            file: z.number(),
          }),
        }),
      ),
    }),
    acir_locations: z.record(z.number()),
    brillig_locations: z.record(z.record(z.number())),
  }),
  files: z.record(z.object({ source: z.string(), path: z.string() })),
}) satisfies z.ZodType<FunctionDebugMetadata>;

/** The artifact entry of a function. */
export interface FunctionArtifact extends FunctionAbi {
  /** The ACIR bytecode of the function. */
  bytecode: Buffer;
  /** The verification key of the function, base64 encoded, if it's a private fn. */
  verificationKey?: string;
  /** Maps opcodes to source code pointers */
  debugSymbols: string;
  /** Debug metadata for the function. */
  debug?: FunctionDebugMetadata;
}

export interface FunctionArtifactWithContractName extends FunctionArtifact {
  /** The name of the contract. */
  contractName: string;
}

export const FunctionArtifactSchema = FunctionAbiSchema.and(
  z.object({
    bytecode: schemas.Buffer,
    verificationKey: z.string().optional(),
    debugSymbols: z.string(),
    debug: FunctionDebugMetadataSchema.optional(),
  }),
) satisfies ZodFor<FunctionArtifact>;

/** A file ID. It's assigned during compilation. */
type FileId = number;

/** A pointer to a specific section of the source code. */
interface SourceCodeLocation {
  /** The section of the source code. */
  span: {
    /** The byte where the section starts. */
    start: number;
    /** The byte where the section ends. */
    end: number;
  };
  /** The source code file pointed to. */
  file: FileId;
}

/**
 * The location of an opcode in the bytecode.
 * It's a string of the form `{acirIndex}` or `{acirIndex}:{brilligIndex}`.
 */
export type OpcodeLocation = string;

export type BrilligFunctionId = number;

export type OpcodeToLocationsMap = Record<OpcodeLocation, number>;

export type LocationNodeDebugInfo = {
  parent: number | null;
  value: SourceCodeLocation;
};

export type LocationTree = {
  locations: LocationNodeDebugInfo[];
};

/** The debug information for a given function. */
export interface DebugInfo {
  /** A map of the opcode location to the source code location. */
  location_tree: LocationTree;
  acir_locations: OpcodeToLocationsMap;
  /** For each Brillig function, we have a map of the opcode location to the source code location. */
  brillig_locations: Record<BrilligFunctionId, OpcodeToLocationsMap>;
}

/** The debug information for a given program (a collection of functions) */
export interface ProgramDebugInfo {
  /** A list of debug information that matches with each function in a program */
  debug_infos: Array<DebugInfo>;
}

/** Maps a file ID to its metadata for debugging purposes. */
export type DebugFileMap = Record<
  FileId,
  {
    /** The source code of the file. */
    source: string;
    /** The path of the file. */
    path: string;
  }
>;

/** Type representing a field layout in the storage of a contract. */
export type FieldLayout = {
  /** Slot in which the field is stored. */
  slot: Fr;
};

/** Defines artifact of a contract. */
export interface ContractArtifact {
  /** The name of the contract. */
  name: string;

  /** The functions of the contract. Includes private and utility functions, plus the public dispatch function. */
  functions: FunctionArtifact[];

  /** The public functions of the contract, excluding dispatch. */
  nonDispatchPublicFunctions: FunctionAbi[];

  /** The outputs of the contract. */
  outputs: {
    structs: Record<string, AbiType[]>;
    globals: Record<string, AbiValue[]>;
  };

  /** Storage layout */
  storageLayout: Record<string, FieldLayout>;

  /** The map of file ID to the source code and path of the file. */
  fileMap: DebugFileMap;
}

export const ContractArtifactSchema: ZodFor<ContractArtifact> = z.object({
  name: z.string(),
  functions: z.array(FunctionArtifactSchema),
  nonDispatchPublicFunctions: z.array(FunctionAbiSchema),
  outputs: z.object({
    structs: z.record(z.array(AbiTypeSchema)).transform(structs => {
      for (const [key, value] of Object.entries(structs)) {
        // We are manually ordering events and functions in the abi by path.
        // The path ordering is arbitrary, and only needed to ensure deterministic order.
        // These are the only arrays in the artifact with arbitrary order, and hence the only ones
        // we need to sort.
        if (key === 'events' || key === 'functions') {
          structs[key] = (value as StructType[]).sort((a, b) => (a.path > b.path ? -1 : 1));
        }
      }
      return structs;
    }),
    globals: z.record(z.array(AbiValueSchema)),
  }),
  storageLayout: z.record(z.object({ slot: schemas.Fr })),
  fileMap: z.record(z.coerce.number(), z.object({ source: z.string(), path: z.string() })),
});

export function getFunctionArtifactByName(artifact: ContractArtifact, functionName: string): FunctionArtifact {
  const functionArtifact = artifact.functions.find(f => f.name === functionName);

  if (!functionArtifact) {
    throw new Error(`Unknown function ${functionName}`);
  }

  const debugMetadata = getFunctionDebugMetadata(artifact, functionArtifact);
  return { ...functionArtifact, debug: debugMetadata };
}

/** Gets a function artifact including debug metadata given its name or selector. */
export async function getFunctionArtifact(
  artifact: ContractArtifact,
  functionNameOrSelector: string | FunctionSelector,
): Promise<FunctionArtifactWithContractName> {
  let functionArtifact;
  if (typeof functionNameOrSelector === 'string') {
    functionArtifact = artifact.functions.find(f => f.name === functionNameOrSelector);
  } else {
    const functionsAndSelectors = await Promise.all(
      artifact.functions.map(async fn => ({
        fn,
        selector: await FunctionSelector.fromNameAndParameters(fn.name, fn.parameters),
      })),
    );
    functionArtifact = functionsAndSelectors.find(fnAndSelector =>
      functionNameOrSelector.equals(fnAndSelector.selector),
    )?.fn;
  }
  if (!functionArtifact) {
    throw new Error(`Unknown function ${functionNameOrSelector}`);
  }

  const debugMetadata = getFunctionDebugMetadata(artifact, functionArtifact);

  return { ...functionArtifact, debug: debugMetadata, contractName: artifact.name };
}

/** Gets all function abis */
export function getAllFunctionAbis(artifact: ContractArtifact): FunctionAbi[] {
  return artifact.functions.map(f => f as FunctionAbi).concat(artifact.nonDispatchPublicFunctions || []);
}

export function parseDebugSymbols(debugSymbols: string): DebugInfo[] {
  return JSON.parse(inflate(Buffer.from(debugSymbols, 'base64'), { to: 'string', raw: true })).debug_infos;
}

/**
 * Gets the debug metadata of a given function from the contract artifact
 * @param artifact - The contract build artifact
 * @param functionName - The name of the function
 * @returns The debug metadata of the function
 */
export function getFunctionDebugMetadata(
  contractArtifact: ContractArtifact,
  functionArtifact: FunctionArtifact,
): FunctionDebugMetadata | undefined {
  try {
    if (functionArtifact.debugSymbols && contractArtifact.fileMap) {
      // TODO(https://github.com/AztecProtocol/aztec-packages/issues/10546) investigate why debugMetadata is so big for some tests.
      const programDebugSymbols = parseDebugSymbols(functionArtifact.debugSymbols);
      // TODO(https://github.com/AztecProtocol/aztec-packages/issues/5813)
      // We only support handling debug info for the contract function entry point.
      // So for now we simply index into the first debug info.
      return {
        debugSymbols: programDebugSymbols[0],
        files: contractArtifact.fileMap,
      };
    }
  } catch (err: any) {
    if (err instanceof RangeError && err.message.includes('Invalid string length')) {
      logger.warn(
        `Caught RangeError: Invalid string length. This suggests the debug_symbols field of the contract ${contractArtifact.name} and function ${functionArtifact.name} is huge; too big to parse. We'll skip returning this info until this issue is resolved. Here's the error:\n${err.message}`,
      );
      // We'll return undefined.
    } else {
      // Rethrow unexpected errors
      throw err;
    }
  }

  return undefined;
}

/**
 * Returns an initializer from the contract, assuming there is at least one. If there are multiple initializers,
 * it returns the one named "constructor" or "initializer"; if there is none with that name, it returns the first
 * initializer it finds, prioritizing initializers with no arguments and then private ones.
 * @param contractArtifact - The contract artifact.
 * @returns An initializer function, or none if there are no functions flagged as initializers in the contract.
 */
export function getDefaultInitializer(contractArtifact: ContractArtifact): FunctionAbi | undefined {
  const functionAbis = getAllFunctionAbis(contractArtifact);
  const initializers = functionAbis.filter(f => f.isInitializer);
  return initializers.length > 1
    ? (initializers.find(f => f.name === 'constructor') ??
        initializers.find(f => f.name === 'initializer') ??
        initializers.find(f => f.parameters?.length === 0) ??
        initializers.find(f => f.functionType === FunctionType.PRIVATE) ??
        initializers[0])
    : initializers[0];
}

/**
 * Returns an initializer from the contract.
 * @param initializerNameOrArtifact - The name of the constructor, or the artifact of the constructor, or undefined
 * to pick the default initializer.
 */
export function getInitializer(
  contract: ContractArtifact,
  initializerNameOrArtifact: string | undefined | FunctionArtifact,
): FunctionAbi | undefined {
  if (typeof initializerNameOrArtifact === 'string') {
    const functionAbis = getAllFunctionAbis(contract);
    const found = functionAbis.find(f => f.name === initializerNameOrArtifact);
    if (!found) {
      throw new Error(`Constructor method ${initializerNameOrArtifact} not found in contract artifact`);
    } else if (!found.isInitializer) {
      throw new Error(`Method ${initializerNameOrArtifact} is not an initializer`);
    }
    return found;
  } else if (initializerNameOrArtifact === undefined) {
    return getDefaultInitializer(contract);
  } else {
    if (!initializerNameOrArtifact.isInitializer) {
      throw new Error(`Method ${initializerNameOrArtifact.name} is not an initializer`);
    }
    return initializerNameOrArtifact;
  }
}

export function emptyFunctionAbi(): FunctionAbi {
  return {
    name: '',
    functionType: FunctionType.PRIVATE,
    isInternal: false,
    isStatic: false,
    parameters: [],
    returnTypes: [],
    errorTypes: {},
    isInitializer: false,
  };
}

export function emptyFunctionArtifact(): FunctionArtifact {
  const abi = emptyFunctionAbi();
  return {
    ...abi,
    bytecode: Buffer.from([]),
    debugSymbols: '',
  };
}

export function emptyContractArtifact(): ContractArtifact {
  return {
    name: '',
    functions: [emptyFunctionArtifact()],
    nonDispatchPublicFunctions: [emptyFunctionAbi()],
    outputs: {
      structs: {},
      globals: {},
    },
    storageLayout: {},
    fileMap: {},
  };
}
