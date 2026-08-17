import type { ChainInfo } from '@aztec/entrypoints/interfaces';
import { BlockNumber, BlockNumberPositiveSchema } from '@aztec/foundation/branded-types';
import type { Fr } from '@aztec/foundation/curves/bn254';
import {
  type AbiDecoded,
  AbiTypeSchema,
  type ContractArtifact,
  ContractArtifactSchema,
  type EventMetadataDefinition,
  FunctionCall,
} from '@aztec/stdlib/abi';
import { AuthWitness } from '@aztec/stdlib/auth-witness';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  type ContractInstancePreimage,
  ContractInstancePreimageSchema,
  type ContractInstancePreimageWithAddress,
  ContractInstancePreimageWithAddressSchema,
} from '@aztec/stdlib/contract';
import { Gas, ManaUsageEstimate } from '@aztec/stdlib/gas';
import type { MasterSecretKeys } from '@aztec/stdlib/keys';
import { refineTxHashAndRange } from '@aztec/stdlib/logs';
import {
  AbiDecodedSchema,
  type ApiSchemaFor,
  getSchemaParameters,
  getSchemaReturnType,
  optional,
  schemas,
  zodFor,
} from '@aztec/stdlib/schemas';
import type { ExecutionPayload, InTx } from '@aztec/stdlib/tx';
import {
  Capsule,
  HashedValues,
  SimulationOverrides,
  TxHash,
  TxProfileResult,
  TxReceiptSchema,
  UtilityExecutionResult,
  inTxSchema,
} from '@aztec/stdlib/tx';

import { z } from 'zod';

import { EventCursor } from '../api/event_cursor.js';
import {
  type GasSettingsOption,
  type InteractionWaitOptions,
  NO_FROM,
  NO_WAIT,
  type ProfileInteractionOptions,
  type SendInteractionOptionsWithoutWait,
  type SendReturn,
  type SimulateInteractionOptions,
} from '../contract/interaction_options.js';
import type { CallIntent, IntentInnerHash } from '../utils/authwit.js';
import type { AppCapabilities, WalletCapabilities } from './capabilities.js';
import { TxSimulationResultWithAppOffset } from './tx_simulation_result_with_app_offset.js';

/**
 * A wrapper type that allows any item to be associated with an alias.
 */
export type Aliased<T> = {
  /**
   * The alias
   */
  alias: string;
  /**
   * The item being aliased.
   */
  item: T;
};

/**
 * Options for simulating interactions with the wallet. Overrides the fee settings of an interaction with
 * a simplified version that only hints at the wallet whether the interaction contains a
 * fee payment method or not
 */
export type SimulateOptions = Omit<SimulateInteractionOptions, 'fee'> & {
  /** The fee options */
  fee?: GasSettingsOption;
};

/**
 * Options for profiling interactions with the wallet. Overrides the fee settings of an interaction with
 * a simplified version that only hints at the wallet whether the interaction contains a
 * fee payment method or not
 */
export type ProfileOptions = Omit<ProfileInteractionOptions, 'fee'> & {
  /** The fee options */
  fee?: GasSettingsOption;
};

/**
 * Options for sending/proving interactions with the wallet. Overrides the fee settings of an interaction with
 * a simplified version that only hints at the wallet whether the interaction contains a
 * fee payment method or not
 */
export type SendOptions<W extends InteractionWaitOptions = undefined> = Omit<
  SendInteractionOptionsWithoutWait,
  'fee'
> & {
  /** The fee options */
  fee?: GasSettingsOption;
  /** Whether to wait for the transaction to be mined */
  wait?: W;
};

/**
 * Helper type that represents all methods that can be batched (all methods except batch itself).
 */
export type BatchableMethods = Omit<Wallet, 'batch'>;

/**
 * A method call with its name and arguments.
 */
type BatchedMethodInternal<T extends keyof BatchableMethods> = {
  /** The method name */
  name: T;
  /** The method arguments */
  args: Parameters<BatchableMethods[T]>;
};

/**
 * Union of all possible batched method calls.
 * This ensures type safety: the `args` must match the specific `name`.
 */
export type BatchedMethod = {
  [K in keyof BatchableMethods]: BatchedMethodInternal<K>;
}[keyof BatchableMethods];

/**
 * Helper type to extract the return type of a batched method
 */
export type BatchedMethodResult<T> =
  T extends BatchedMethodInternal<infer K> ? Awaited<ReturnType<BatchableMethods[K]>> : never;

/**
 * Wrapper type for batch results that includes the method name for discriminated union deserialization.
 * Each result is wrapped as \{ name: 'methodName', result: ActualResult \} to allow proper deserialization
 * when AztecAddress and TxHash would otherwise be ambiguous (both are hex strings).
 */
export type BatchedMethodResultWrapper<T extends BatchedMethod> = {
  /** The method name */
  name: T['name'];
  /** The method result */
  result: BatchedMethodResult<T>;
};

/**
 * Maps a tuple of BatchedMethod to a tuple of their wrapped return types
 */
export type BatchResults<T extends readonly BatchedMethod[]> = {
  [K in keyof T]: BatchedMethodResultWrapper<T[K]>;
};

/**
 * Base filter options for event queries.
 */
export type EventFilterBase = {
  /** Transaction in which the events were emitted. */
  txHash?: TxHash;
  /** The block number from which to start fetching events (inclusive).
   * Optional. If provided, it must be greater or equal than 1.
   * Defaults to the initial L2 block number (INITIAL_L2_BLOCK_NUM).
   */
  fromBlock?: BlockNumber;
  /** The block number until which to fetch logs (not inclusive).
   * Optional. If provided, it must be greater than fromBlock.
   */
  toBlock?: BlockNumber;
};

/**
 * Filter options when querying private events.
 */
export type PrivateEventFilter = EventFilterBase & {
  /** The address of the contract that emitted the events. */
  contractAddress: AztecAddress;
  /** Addresses of accounts that are in scope for this filter. */
  scopes: AztecAddress[];
};

/**
 * Filter options when querying public events. The contract address is required because the public log index is
 * keyed on `(contract, tag)`; tag-only queries are not supported.
 */
export type PublicEventFilter = EventFilterBase & {
  /** The address of the contract that emitted the events. Required. */
  contractAddress: AztecAddress;
  /**
   * Cursor to resume strictly after, for pagination. Pass {@link GetPublicEventsResult.nextCursor} from a
   * previous page here to fetch the next one. Omit to start from the beginning of the range.
   */
  afterEvent?: EventCursor;
};

/**
 * An ABI decoded event with associated metadata.
 * @typeParam T - The decoded event type
 * @typeParam M - Additional metadata fields (empty by default)
 */
export type Event<T, M extends object = object> = {
  /** The ABI decoded event */
  event: T;
  /** Metadata describing event context information such as tx and block */
  metadata: InTx & M;
};

/** An ABI decoded private event with associated metadata. */
export type PrivateEvent<T> = Event<T>;

/** An ABI decoded public event with associated metadata (includes contract address). */
export type PublicEvent<T> = Event<
  T,
  {
    /**
     * Address of the contract that emitted this event
     */
    contractAddress: AztecAddress;
  }
>;

/** Whether the contract has been initialized. */
export enum ContractInitializationStatus {
  /** The contract has been initialized (initialization nullifier found). */
  INITIALIZED = 'INITIALIZED',
  /** The contract has not been initialized (instance is known, but no initialization nullifier found). */
  UNINITIALIZED = 'UNINITIALIZED',
  /**
   * Initialization status cannot be determined. The contract instance is not registered in this wallet, so we have
   * limited ability to check for initialization. The contract may or may not have been initialized.
   */
  UNKNOWN = 'UNKNOWN',
}

/**
 * Contract metadata including deployment and registration status.
 */
export type ContractMetadata = {
  /** The contract instance preimage and address. */
  instance?: ContractInstancePreimageWithAddress;
  /** Whether the contract has been initialized. */
  initializationStatus: ContractInitializationStatus;
  /** Whether the contract instance is publicly deployed on-chain */
  isContractPublished: boolean;
  /** Whether the contract has been updated to a different class */
  isContractUpdated: boolean;
  /** The updated contract class ID if the contract has been updated */
  updatedContractClassId?: Fr | undefined;
};

/**
 * Contract class metadata.
 */
export type ContractClassMetadata = {
  /** Whether the artifact is registered in the wallet */
  isArtifactRegistered: boolean;
  /** Whether the contract class is publicly registered on-chain */
  isContractClassPubliclyRegistered: boolean;
};

/**
 * Options for executing a utility function call.
 */
export type ExecuteUtilityOptions = {
  /** The scopes for the utility execution (determines which notes and keys are visible). */
  scopes: AztecAddress[];
  /** Optional auth witnesses to use during execution. */
  authWitnesses?: AuthWitness[];
};

/**
 * The wallet interface.
 */
export type Wallet = {
  getPrivateEvents<T>(
    eventMetadata: EventMetadataDefinition,
    eventFilter: PrivateEventFilter,
  ): Promise<PrivateEvent<T>[]>;
  getChainInfo(): Promise<ChainInfo>;
  getContractMetadata(address: AztecAddress): Promise<ContractMetadata>;
  getContractClassMetadata(id: Fr): Promise<ContractClassMetadata>;
  registerSender(address: AztecAddress, alias?: string): Promise<AztecAddress>;
  getAddressBook(): Promise<Aliased<AztecAddress>[]>;
  getAccounts(): Promise<Aliased<AztecAddress>[]>;
  registerContract(
    instance: ContractInstancePreimage,
    artifact?: ContractArtifact,
    secretKeyOrKeys?: Fr | MasterSecretKeys,
  ): Promise<void>;
  /**
   * Registers a contract class artifact in the local PXE without binding it to any instance.
   * Useful for simulation flows that need the artifact available locally before any on-chain
   * upgrade has taken effect. No chain check.
   */
  registerContractClass(artifact: ContractArtifact): Promise<void>;
  simulateTx(exec: ExecutionPayload, opts: SimulateOptions): Promise<TxSimulationResultWithAppOffset>;
  executeUtility(call: FunctionCall, opts: ExecuteUtilityOptions): Promise<UtilityExecutionResult>;
  profileTx(exec: ExecutionPayload, opts: ProfileOptions): Promise<TxProfileResult>;
  sendTx<W extends InteractionWaitOptions = undefined>(
    exec: ExecutionPayload,
    opts: SendOptions<W>,
  ): Promise<SendReturn<W>>;
  createAuthWit(from: AztecAddress, messageHashOrIntent: IntentInnerHash | CallIntent): Promise<AuthWitness>;
  requestCapabilities(manifest: AppCapabilities): Promise<WalletCapabilities>;
  batch<const T extends readonly BatchedMethod[]>(methods: T): Promise<BatchResults<T>>;
};

export const ExecutionPayloadSchema = z.object({
  calls: z.array(FunctionCall.schema),
  authWitnesses: z.array(AuthWitness.schema),
  capsules: z.array(Capsule.schema),
  extraHashedArgs: z.array(HashedValues.schema),
  feePayer: optional(schemas.AztecAddress),
});

export const GasSettingsOptionSchema = z.object({
  gasSettings: optional(
    z.object({
      gasLimits: optional(Gas.schema),
      teardownGasLimits: optional(Gas.schema),
      maxFeePerGas: optional(z.object({ feePerDaGas: schemas.BigInt, feePerL2Gas: schemas.BigInt })),
      maxPriorityFeePerGas: optional(z.object({ feePerDaGas: schemas.BigInt, feePerL2Gas: schemas.BigInt })),
    }),
  ),
  congestionEstimate: optional(z.nativeEnum(ManaUsageEstimate)),
});

export const WaitOptsSchema = z.object({
  ignoreDroppedReceiptsFor: optional(z.number()),
  timeout: optional(z.number()),
  interval: optional(z.number()),
  dontThrowOnRevert: optional(z.boolean()),
  initialDelay: optional(z.number()),
});

const FromSchema = z.union([schemas.AztecAddress, z.literal(NO_FROM)]);

export const SendOptionsSchema = z.object({
  from: FromSchema,
  authWitnesses: optional(z.array(AuthWitness.schema)),
  capsules: optional(z.array(Capsule.schema)),
  fee: optional(GasSettingsOptionSchema),
  wait: optional(z.union([z.literal(NO_WAIT), WaitOptsSchema])),
  additionalScopes: optional(z.array(schemas.AztecAddress)),
  sendMessagesAs: optional(schemas.AztecAddress),
});

export const SimulateOptionsSchema = z.object({
  from: FromSchema,
  authWitnesses: optional(z.array(AuthWitness.schema)),
  capsules: optional(z.array(Capsule.schema)),
  fee: optional(GasSettingsOptionSchema),
  skipTxValidation: optional(z.boolean()),
  skipFeeEnforcement: optional(z.boolean()),
  includeMetadata: optional(z.boolean()),
  additionalScopes: optional(z.array(schemas.AztecAddress)),
  sendMessagesAs: optional(schemas.AztecAddress),
  overrides: optional(SimulationOverrides.schema),
});

export const ProfileOptionsSchema = SimulateOptionsSchema.extend({
  profileMode: z.enum(['gates', 'execution-steps', 'full']),
  skipProofGeneration: optional(z.boolean()),
});

export const MessageHashOrIntentSchema = z.union([
  z.object({ consumer: schemas.AztecAddress, innerHash: schemas.Fr }),
  z.object({
    caller: schemas.AztecAddress,
    call: FunctionCall.schema,
  }),
]);

export const EventMetadataDefinitionSchema = z.object({
  eventSelector: schemas.EventSelector,
  abiType: AbiTypeSchema,
  fieldNames: z.array(z.string()),
});

// Event filters share `txHash ⊕ block-range` semantics with `LogsQueryBase` (see stdlib `logs_query.ts`)
// but the field schemas stay local.
const eventFilterBaseShape = {
  txHash: optional(TxHash.schema),
  fromBlock: optional(BlockNumberPositiveSchema),
  toBlock: optional(BlockNumberPositiveSchema),
};

export const PrivateEventFilterSchema = refineTxHashAndRange(
  z.object({
    ...eventFilterBaseShape,
    contractAddress: schemas.AztecAddress,
    scopes: z.array(schemas.AztecAddress),
  }),
);

export const PublicEventFilterSchema = refineTxHashAndRange(
  z.object({
    ...eventFilterBaseShape,
    contractAddress: schemas.AztecAddress,
    afterEvent: optional(EventCursor.schema),
  }),
);

export const PrivateEventSchema: z.ZodType<any> = zodFor<PrivateEvent<AbiDecoded>>()(
  z.object({
    event: AbiDecodedSchema,
    metadata: inTxSchema(),
  }),
);

export const PublicEventSchema: z.ZodType<PublicEvent<AbiDecoded>> = zodFor<PublicEvent<AbiDecoded>>()(
  z.object({
    event: AbiDecodedSchema,
    metadata: z.intersection(inTxSchema(), z.object({ contractAddress: schemas.AztecAddress })),
  }),
);

export const ContractMetadataSchema = z.object({
  instance: optional(ContractInstancePreimageWithAddressSchema),
  initializationStatus: z.nativeEnum(ContractInitializationStatus),
  isContractPublished: z.boolean(),
  isContractUpdated: z.boolean(),
  updatedContractClassId: optional(schemas.Fr),
});

export const ContractClassMetadataSchema = z.object({
  isArtifactRegistered: z.boolean(),
  isContractClassPubliclyRegistered: z.boolean(),
});

export const ContractFunctionPatternSchema = z.object({
  contract: z.union([schemas.AztecAddress, z.literal('*')]),
  function: z.union([z.string(), z.literal('*')]),
  additionalScopes: optional(z.union([z.array(schemas.AztecAddress), z.literal('*')])),
});

export const AccountsCapabilitySchema = z.object({
  type: z.literal('accounts'),
  canGet: optional(z.boolean()),
  canCreateAuthWit: optional(z.boolean()),
});

export const GrantedAccountsCapabilitySchema = AccountsCapabilitySchema.extend({
  accounts: z.array(z.object({ alias: z.string(), item: schemas.AztecAddress })),
});

export const ContractsCapabilitySchema = z.object({
  type: z.literal('contracts'),
  contracts: z.union([z.literal('*'), z.array(schemas.AztecAddress)]),
  canRegister: optional(z.boolean()),
  canGetMetadata: optional(z.boolean()),
});

export const GrantedContractsCapabilitySchema = ContractsCapabilitySchema;

export const ContractClassesCapabilitySchema = z.object({
  type: z.literal('contractClasses'),
  classes: z.union([z.literal('*'), z.array(schemas.Fr)]),
  canRegister: optional(z.boolean()),
  canGetMetadata: z.boolean(),
});

export const GrantedContractClassesCapabilitySchema = ContractClassesCapabilitySchema;

export const SimulationCapabilitySchema = z.object({
  type: z.literal('simulation'),
  transactions: optional(
    z.object({
      scope: z.union([z.literal('*'), z.array(ContractFunctionPatternSchema)]),
    }),
  ),
  utilities: optional(
    z.object({
      scope: z.union([z.literal('*'), z.array(ContractFunctionPatternSchema)]),
    }),
  ),
});

export const GrantedSimulationCapabilitySchema = SimulationCapabilitySchema;

export const TransactionCapabilitySchema = z.object({
  type: z.literal('transaction'),
  scope: z.union([z.literal('*'), z.array(ContractFunctionPatternSchema)]),
});

export const GrantedTransactionCapabilitySchema = TransactionCapabilitySchema;

export const DataCapabilitySchema = z.object({
  type: z.literal('data'),
  addressBook: optional(z.boolean()),
  privateEvents: optional(
    z.object({
      contracts: z.union([z.literal('*'), z.array(schemas.AztecAddress)]),
    }),
  ),
});

export const GrantedDataCapabilitySchema = DataCapabilitySchema;

export const CapabilitySchema = z.discriminatedUnion('type', [
  AccountsCapabilitySchema,
  ContractsCapabilitySchema,
  ContractClassesCapabilitySchema,
  SimulationCapabilitySchema,
  TransactionCapabilitySchema,
  DataCapabilitySchema,
]);

export const GrantedCapabilitySchema = z.discriminatedUnion('type', [
  GrantedAccountsCapabilitySchema,
  GrantedContractsCapabilitySchema,
  GrantedContractClassesCapabilitySchema,
  GrantedSimulationCapabilitySchema,
  GrantedTransactionCapabilitySchema,
  GrantedDataCapabilitySchema,
]);

export const AppCapabilitiesSchema = z.object({
  version: z.literal('1.0'),
  metadata: z.object({
    name: z.string(),
    version: z.string(),
    description: optional(z.string()),
    url: optional(z.string()),
    icon: optional(z.string()),
  }),
  capabilities: z.array(CapabilitySchema),
  behavior: optional(
    z.object({
      mode: optional(z.enum(['strict', 'permissive'])),
      expiration: optional(z.number()),
    }),
  ),
});

export const WalletCapabilitiesSchema = z.object({
  version: z.literal('1.0'),
  granted: z.array(GrantedCapabilitySchema),
  wallet: z.object({
    name: z.string(),
    version: z.string(),
  }),
  expiresAt: optional(z.number()),
});

const OffchainEffectSchema = z.object({
  data: z.array(schemas.Fr),
  contractAddress: schemas.AztecAddress,
});

const OffchainMessageSchema = z.object({
  recipient: schemas.AztecAddress,
  payload: z.array(schemas.Fr),
  contractAddress: schemas.AztecAddress,
});

const OffchainOutputSchema = z.object({
  offchainEffects: z.array(OffchainEffectSchema),
  offchainMessages: z.array(OffchainMessageSchema),
});

/**
 * Record of all wallet method schemas (excluding batch).
 * This is the single source of truth for method schemas - batch schemas are derived from this.
 */
const WalletMethodSchemas = {
  getChainInfo: z.function({ input: z.tuple([]), output: z.object({ chainId: schemas.Fr, version: schemas.Fr }) }),
  getContractMetadata: z.function({ input: z.tuple([schemas.AztecAddress]), output: ContractMetadataSchema }),
  getContractClassMetadata: z.function({ input: z.tuple([schemas.Fr]), output: ContractClassMetadataSchema }),
  getPrivateEvents: z.function({
    input: z.tuple([EventMetadataDefinitionSchema, PrivateEventFilterSchema]),
    output: z.array(PrivateEventSchema),
  }),
  registerSender: z.function({
    input: z.tuple([schemas.AztecAddress, optional(z.string())]),
    output: schemas.AztecAddress,
  }),
  getAddressBook: z.function({
    input: z.tuple([]),
    output: z.array(z.object({ alias: z.string(), item: schemas.AztecAddress })),
  }),
  getAccounts: z.function({
    input: z.tuple([]),
    output: z.array(z.object({ alias: z.string(), item: schemas.AztecAddress })),
  }),
  registerContract: z.function({
    input: z.tuple([ContractInstancePreimageSchema, optional(ContractArtifactSchema), optional(schemas.Fr)]),
    output: z.void(),
  }),
  registerContractClass: z.function({ input: z.tuple([ContractArtifactSchema]), output: z.void() }),
  simulateTx: z.function({
    input: z.tuple([ExecutionPayloadSchema, SimulateOptionsSchema]),
    output: TxSimulationResultWithAppOffset.schema,
  }),
  executeUtility: z.function({
    input: z.tuple([
      FunctionCall.schema,
      z.object({
        scopes: z.array(schemas.AztecAddress),
        authWitnesses: optional(z.array(AuthWitness.schema)),
      }),
    ]),
    output: UtilityExecutionResult.schema,
  }),
  profileTx: z.function({
    input: z.tuple([ExecutionPayloadSchema, ProfileOptionsSchema]),
    output: TxProfileResult.schema,
  }),
  sendTx: z.function({
    input: z.tuple([ExecutionPayloadSchema, SendOptionsSchema]),
    output: z.union([
      z.object({ txHash: TxHash.schema }).merge(OffchainOutputSchema),
      z.object({ receipt: TxReceiptSchema }).merge(OffchainOutputSchema),
    ]),
  }),
  createAuthWit: z.function({
    input: z.tuple([schemas.AztecAddress, MessageHashOrIntentSchema]),
    output: AuthWitness.schema,
  }),
  requestCapabilities: z.function({ input: z.tuple([AppCapabilitiesSchema]), output: WalletCapabilitiesSchema }),
};

/**
 * Creates batch schemas from the individual wallet methods.
 * This allows us to define them once and derive batch schemas automatically,
 * reducing duplication and ensuring consistency.
 */
function createBatchSchemas<T extends Record<string, z.ZodFunction<z.ZodTuple<any, any>, z.ZodTypeAny>>>(
  methodSchemas: T,
) {
  const names = Object.keys(methodSchemas) as Extract<keyof T, string>[];

  const namesAndArgs = names.map(name =>
    z.object({
      name: z.literal(name),
      args: getSchemaParameters(methodSchemas[name]),
    }),
  );

  const namesAndReturns = names.map(name => {
    const returnType = getSchemaReturnType(methodSchemas[name]);
    return z.object({
      name: z.literal(name),
      // void-returning methods serialize to a missing `result` key over JSON-RPC, so their field must be optional:
      // value-returning methods keep it required so a dropped result is still caught.
      result: returnType instanceof z.ZodVoid ? returnType.optional() : returnType,
    });
  });

  // Type assertion needed because discriminatedUnion expects a tuple type [T, T, ...T[]]
  // but we're building the array dynamically. The runtime behavior is correct.
  return {
    input: z.discriminatedUnion('name', namesAndArgs as [(typeof namesAndArgs)[0], ...typeof namesAndArgs]),
    output: z.discriminatedUnion('name', namesAndReturns as [(typeof namesAndReturns)[0], ...typeof namesAndReturns]),
  };
}

const { input: BatchedMethodSchema, output: BatchedResultSchema } = createBatchSchemas(WalletMethodSchemas);

export { BatchedMethodSchema, BatchedResultSchema };

export const WalletSchema: ApiSchemaFor<Wallet> = {
  ...WalletMethodSchemas,
  // @ts-expect-error - ApiSchemaFor cannot properly type generic methods with readonly arrays
  batch: z.function({ input: z.tuple([z.array(BatchedMethodSchema)]), output: z.array(BatchedResultSchema) }),
};
