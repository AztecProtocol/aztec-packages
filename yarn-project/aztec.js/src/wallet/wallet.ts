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
import { type ContractInstanceWithAddress, ContractInstanceWithAddressSchema } from '@aztec/stdlib/contract';
import { Gas } from '@aztec/stdlib/gas';
import { AbiDecodedSchema, type ApiSchemaFor, optional, schemas, zodFor } from '@aztec/stdlib/schemas';
import type { ExecutionPayload, InTx } from '@aztec/stdlib/tx';
import {
  Capsule,
  HashedValues,
  TxHash,
  TxProfileResult,
  TxReceipt,
  TxSimulationResult,
  UtilitySimulationResult,
  inTxSchema,
} from '@aztec/stdlib/tx';

import { z } from 'zod';

import {
  type FeeEstimationOptions,
  type GasSettingsOption,
  type InteractionWaitOptions,
  NO_WAIT,
  type ProfileInteractionOptions,
  type SendInteractionOptionsWithoutWait,
  type SendReturn,
  type SimulateInteractionOptions,
} from '../contract/interaction_options.js';
import type { CallIntent, IntentInnerHash } from '../utils/authwit.js';
import type { AppCapabilities, WalletCapabilities } from './capabilities.js';

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
  fee?: GasSettingsOption & FeeEstimationOptions;
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
 * Filter options when querying public events.
 */
export type PublicEventFilter = EventFilterBase & {
  /** The address of the contract that emitted the events. */
  contractAddress?: AztecAddress;
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

/**
 * Contract metadata including deployment and registration status.
 */
export type ContractMetadata = {
  /** The contract instance */
  instance?: ContractInstanceWithAddress;
  /** Whether the contract has been initialized (init nullifier exists) */
  isContractInitialized: boolean;
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
 * Options for simulating a utility function call.
 */
export type SimulateUtilityOptions = {
  /** The scope for the utility simulation (determines which notes and keys are visible). */
  scope: AztecAddress;
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
    instance: ContractInstanceWithAddress,
    artifact?: ContractArtifact,
    secretKey?: Fr,
  ): Promise<ContractInstanceWithAddress>;
  simulateTx(exec: ExecutionPayload, opts: SimulateOptions): Promise<TxSimulationResult>;
  simulateUtility(call: FunctionCall, opts: SimulateUtilityOptions): Promise<UtilitySimulationResult>;
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
});

export const WalletSimulationFeeOptionSchema = GasSettingsOptionSchema.extend({
  estimatedGasPadding: optional(z.number()),
  estimateGas: optional(z.boolean()),
});

export const WaitOptsSchema = z.object({
  ignoreDroppedReceiptsFor: optional(z.number()),
  timeout: optional(z.number()),
  interval: optional(z.number()),
  dontThrowOnRevert: optional(z.boolean()),
});

export const SendOptionsSchema = z.object({
  from: schemas.AztecAddress,
  authWitnesses: optional(z.array(AuthWitness.schema)),
  capsules: optional(z.array(Capsule.schema)),
  fee: optional(GasSettingsOptionSchema),
  wait: optional(z.union([z.literal(NO_WAIT), WaitOptsSchema])),
});

export const SimulateOptionsSchema = z.object({
  from: schemas.AztecAddress,
  authWitnesses: optional(z.array(AuthWitness.schema)),
  capsules: optional(z.array(Capsule.schema)),
  fee: optional(WalletSimulationFeeOptionSchema),
  skipTxValidation: optional(z.boolean()),
  skipFeeEnforcement: optional(z.boolean()),
  includeMetadata: optional(z.boolean()),
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

const EventFilterBaseSchema = z.object({
  txHash: optional(TxHash.schema),
  fromBlock: optional(BlockNumberPositiveSchema),
  toBlock: optional(BlockNumberPositiveSchema),
});

export const PrivateEventFilterSchema = EventFilterBaseSchema.extend({
  contractAddress: schemas.AztecAddress,
  scopes: z.array(schemas.AztecAddress),
});

export const PublicEventFilterSchema = EventFilterBaseSchema.extend({
  contractAddress: optional(schemas.AztecAddress),
});

export const PrivateEventSchema: z.ZodType<any> = zodFor<PrivateEvent<AbiDecoded>>()(
  z.object({
    event: AbiDecodedSchema,
    metadata: inTxSchema(),
  }),
);

export const PublicEventSchema = zodFor<PublicEvent<AbiDecoded>>()(
  z.object({
    event: AbiDecodedSchema,
    metadata: z.intersection(inTxSchema(), z.object({ contractAddress: schemas.AztecAddress })),
  }),
);

export const ContractMetadataSchema = z.object({
  instance: optional(ContractInstanceWithAddressSchema),
  isContractInitialized: z.boolean(),
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

/**
 * Record of all wallet method schemas (excluding batch).
 * This is the single source of truth for method schemas - batch schemas are derived from this.
 */
const WalletMethodSchemas = {
  getChainInfo: z
    .function()
    .args()
    .returns(z.object({ chainId: schemas.Fr, version: schemas.Fr })),
  getContractMetadata: z.function().args(schemas.AztecAddress).returns(ContractMetadataSchema),
  getContractClassMetadata: z.function().args(schemas.Fr).returns(ContractClassMetadataSchema),
  getPrivateEvents: z
    .function()
    .args(EventMetadataDefinitionSchema, PrivateEventFilterSchema)
    .returns(z.array(PrivateEventSchema)),
  registerSender: z.function().args(schemas.AztecAddress, optional(z.string())).returns(schemas.AztecAddress),
  getAddressBook: z
    .function()
    .args()
    .returns(z.array(z.object({ alias: z.string(), item: schemas.AztecAddress }))),
  getAccounts: z
    .function()
    .args()
    .returns(z.array(z.object({ alias: z.string(), item: schemas.AztecAddress }))),
  registerContract: z
    .function()
    .args(ContractInstanceWithAddressSchema, optional(ContractArtifactSchema), optional(schemas.Fr))
    .returns(ContractInstanceWithAddressSchema),
  simulateTx: z.function().args(ExecutionPayloadSchema, SimulateOptionsSchema).returns(TxSimulationResult.schema),
  simulateUtility: z
    .function()
    .args(
      FunctionCall.schema,
      z.object({
        scope: schemas.AztecAddress,
        authWitnesses: optional(z.array(AuthWitness.schema)),
      }),
    )
    .returns(UtilitySimulationResult.schema),
  profileTx: z.function().args(ExecutionPayloadSchema, ProfileOptionsSchema).returns(TxProfileResult.schema),
  sendTx: z
    .function()
    .args(ExecutionPayloadSchema, SendOptionsSchema)
    .returns(z.union([TxHash.schema, TxReceipt.schema])),
  createAuthWit: z.function().args(schemas.AztecAddress, MessageHashOrIntentSchema).returns(AuthWitness.schema),
  requestCapabilities: z.function().args(AppCapabilitiesSchema).returns(WalletCapabilitiesSchema),
};

/**
 * Creates batch schemas from the individual wallet methods.
 * This allows us to define them once and derive batch schemas automatically,
 * reducing duplication and ensuring consistency.
 */
function createBatchSchemas<T extends Record<string, z.ZodFunction<z.ZodTuple<any, any>, z.ZodTypeAny>>>(
  methodSchemas: T,
) {
  const names = Object.keys(methodSchemas) as (keyof T)[];

  const namesAndArgs = names.map(name =>
    z.object({
      name: z.literal(name),
      args: methodSchemas[name].parameters(),
    }),
  );

  const namesAndReturns = names.map(name =>
    z.object({
      name: z.literal(name),
      result: methodSchemas[name].returnType(),
    }),
  );

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
  batch: z.function().args(z.array(BatchedMethodSchema)).returns(z.array(BatchedResultSchema)),
};
