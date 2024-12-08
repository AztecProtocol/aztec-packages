/* eslint-disable camelcase */
import { inflate } from 'pako';
import { z } from 'zod';

import { type Fr } from '../fields/fields.js';
import { schemas } from '../schemas/schemas.js';
import { type ZodFor } from '../schemas/types.js';
import { FunctionSelector } from './function_selector.js';
import { type NoteSelector } from './note_selector.js';

/** A basic value. */
export interface BasicValue<T extends string, V> {
  /** The kind of the value. */
  kind: T;
  value: V;
}

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
  UNCONSTRAINED = 'unconstrained',
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
    locations: z.record(
      z.array(z.object({ span: z.object({ start: z.number(), end: z.number() }), file: z.number() })),
    ),
    brillig_locations: z.record(
      z.record(z.array(z.object({ span: z.object({ start: z.number(), end: z.number() }), file: z.number() }))),
    ),
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

export const FunctionArtifactSchema = FunctionAbiSchema.and(
  z.object({
    bytecode: schemas.Buffer,
    verificationKey: z.string().optional(),
    debugSymbols: z.string(),
    debug: FunctionDebugMetadataSchema.optional(),
  }),
) satisfies ZodFor<FunctionArtifact>;

/** A file ID. It's assigned during compilation. */
export type FileId = number;

/** A pointer to a specific section of the source code. */
export interface SourceCodeLocation {
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

export type OpcodeToLocationsMap = Record<OpcodeLocation, SourceCodeLocation[]>;

/** The debug information for a given function. */
export interface DebugInfo {
  /** A map of the opcode location to the source code location. */
  locations: OpcodeToLocationsMap;
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

/** Type representing a field of a note (e.g. `amount` in `TokenNote`). */
export type NoteField = {
  /** Name of the field (e.g. `amount`). */
  name: string;
  /** Index where the note field starts in the serialized note array. */
  index: number;
  /** Whether the field can be unset when creating the note (in the partial notes flow). */
  nullable: boolean;
};

export const NoteFieldSchema = z.object({
  name: z.string(),
  index: z.number(),
  nullable: z.boolean(),
}) satisfies z.ZodType<NoteField>;

/** Type representing a note in use in the contract. */
export type ContractNote = {
  /** Note identifier */
  id: NoteSelector;
  /** Type of the note (e.g., 'TransparentNote') */
  typ: string;
  /** Fields of the note. */
  fields: NoteField[];
};

export const ContractNoteSchema = z.object({
  id: schemas.NoteSelector,
  typ: z.string(),
  fields: z.array(NoteFieldSchema),
}) satisfies ZodFor<ContractNote>;

/** Type representing a field layout in the storage of a contract. */
export type FieldLayout = {
  /** Slot in which the field is stored. */
  slot: Fr;
};

/** Defines artifact of a contract. */
export interface ContractArtifact {
  /** The name of the contract. */
  name: string;

  /** The version of compiler used to create this artifact */
  aztecNrVersion?: string;

  /** The functions of the contract. */
  functions: FunctionArtifact[];

  /** The outputs of the contract. */
  outputs: {
    structs: Record<string, AbiType[]>;
    globals: Record<string, AbiValue[]>;
  };

  /** Storage layout */
  storageLayout: Record<string, FieldLayout>;

  /** The notes used in the contract. */
  notes: Record<string, ContractNote>;

  /** The map of file ID to the source code and path of the file. */
  fileMap: DebugFileMap;
}

export const ContractArtifactSchema: ZodFor<ContractArtifact> = z.object({
  name: z.string(),
  aztecNrVersion: z.string().optional(),
  functions: z.array(FunctionArtifactSchema),
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
  notes: z.record(ContractNoteSchema),
  fileMap: z.record(z.coerce.number(), z.object({ source: z.string(), path: z.string() })),
});

/** Gets a function artifact including debug metadata given its name or selector. */
export async function getFunctionArtifact(
  artifact: ContractArtifact,
  functionNameOrSelector: string | FunctionSelector,
): Promise<FunctionArtifact> {
  const foundArtifacts = await Promise.all(
    artifact.functions.map(async f => {
      const equal: boolean =
        typeof functionNameOrSelector === 'string'
          ? f.name === functionNameOrSelector
          : functionNameOrSelector.equals(await FunctionSelector.fromNameAndParameters(f.name, f.parameters));
      if (!equal) {
        return undefined;
      }
      return f;
    }),
  );
  const functionArtifact = foundArtifacts.find(f => f !== undefined);
  if (!functionArtifact) {
    throw new Error(`Unknown function ${functionNameOrSelector}`);
  }
  const debugMetadata = getFunctionDebugMetadata(artifact, functionArtifact);
  return { ...functionArtifact, debug: debugMetadata };
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
  if (functionArtifact.debugSymbols && contractArtifact.fileMap) {
    const programDebugSymbols = JSON.parse(
      inflate(Buffer.from(functionArtifact.debugSymbols, 'base64'), { to: 'string', raw: true }),
    );
    // TODO(https://github.com/AztecProtocol/aztec-packages/issues/5813)
    // We only support handling debug info for the contract function entry point.
    // So for now we simply index into the first debug info.
    return {
      debugSymbols: programDebugSymbols.debug_infos[0],
      files: contractArtifact.fileMap,
    };
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
export function getDefaultInitializer(contractArtifact: ContractArtifact): FunctionArtifact | undefined {
  const initializers = contractArtifact.functions.filter(f => f.isInitializer);
  return initializers.length > 1
    ? initializers.find(f => f.name === 'constructor') ??
        initializers.find(f => f.name === 'initializer') ??
        initializers.find(f => f.parameters?.length === 0) ??
        initializers.find(f => f.functionType === FunctionType.PRIVATE) ??
        initializers[0]
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
): FunctionArtifact | undefined {
  if (typeof initializerNameOrArtifact === 'string') {
    const found = contract.functions.find(f => f.name === initializerNameOrArtifact);
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
