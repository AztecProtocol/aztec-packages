import type { ChainInfo } from '@aztec/entrypoints/interfaces';
import type { ExecutionPayload } from '@aztec/entrypoints/payload';
import type { Fr } from '@aztec/foundation/fields';
import {
  AbiTypeSchema,
  type ContractArtifact,
  ContractArtifactSchema,
  type EventMetadataDefinition,
  FunctionAbiSchema,
  FunctionType,
} from '@aztec/stdlib/abi';
import { AuthWitness } from '@aztec/stdlib/auth-witness';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  type ContractClassMetadata,
  ContractClassWithIdSchema,
  type ContractInstanceWithAddress,
  ContractInstanceWithAddressSchema,
  type ContractInstantiationData,
  type ContractMetadata,
} from '@aztec/stdlib/contract';
import { Gas } from '@aztec/stdlib/gas';
import { PublicKeys } from '@aztec/stdlib/keys';
import { AbiDecodedSchema, type ApiSchemaFor, type ZodFor, optional, schemas } from '@aztec/stdlib/schemas';
import {
  Capsule,
  HashedValues,
  TxHash,
  TxProfileResult,
  TxReceipt,
  TxSimulationResult,
  UtilitySimulationResult,
} from '@aztec/stdlib/tx';

import { z } from 'zod';

import type { Contract } from '../contract/contract.js';
import type {
  FeeEstimationOptions,
  GasSettingsOption,
  ProfileInteractionOptions,
  SendInteractionOptions,
  SimulateInteractionOptions,
} from '../contract/interaction_options.js';
import type { CallIntent, IntentInnerHash } from '../utils/authwit.js';

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
 * A reduced representation of a Contract, only including its instance and artifact
 */
export type ContractInstanceAndArtifact = Pick<Contract, 'artifact' | 'instance'>;

/**
 * Options that can be provided to the wallet for configuration of the fee payment.
 */
export type UserFeeOptions = {
  /**
   * Informs the wallet that the crafted tx already contains the necessary calls to pay for its fee
   * and who is paying
   */
  embeddedPaymentMethodFeePayer?: AztecAddress;
} & GasSettingsOption;

/**
 * Options for simulating interactions with the wallet. Overrides the fee settings of an interaction with
 * a simplified version that only hints at the wallet wether the interaction contains a
 * fee payment method or not
 */
export type SimulateOptions = Omit<SimulateInteractionOptions, 'fee'> & {
  /** The fee options */
  fee?: UserFeeOptions & FeeEstimationOptions;
};

/**
 * Options for profiling interactions with the wallet. Overrides the fee settings of an interaction with
 * a simplified version that only hints at the wallet wether the interaction contains a
 * fee payment method or not
 */
export type ProfileOptions = Omit<ProfileInteractionOptions, 'fee'> & {
  /** The fee options */
  fee?: UserFeeOptions;
};

/**
 * Options for sending/proving interactions with the wallet. Overrides the fee settings of an interaction with
 * a simplified version that only hints at the wallet wether the interaction contains a
 * fee payment method or not
 */
export type SendOptions = Omit<SendInteractionOptions, 'fee'> & {
  /** The fee options */
  fee?: UserFeeOptions;
};

/**
 * Helper type that represents all methods that can be batched.
 */
export type BatchableMethods = Pick<Wallet, 'registerContract' | 'sendTx' | 'registerSender' | 'simulateUtility'>;

/**
 * From the batchable methods, we create a type that represents a method call with its name and arguments.
 * This is what the wallet will accept as arguments to the `batch` method.
 */
export type BatchedMethod<T extends keyof BatchableMethods> = {
  /** The method name */
  name: T;
  /** The method arguments */
  args: Parameters<BatchableMethods[T]>;
};

/**
 * Helper type to extract the return type of a batched method
 */
export type BatchedMethodResult<T> =
  T extends BatchedMethod<infer K> ? Awaited<ReturnType<BatchableMethods[K]>> : never;

/**
 * Wrapper type for batch results that includes the method name for discriminated union deserialization.
 * Each result is wrapped as \{ name: 'methodName', result: ActualResult \} to allow proper deserialization
 * when AztecAddress and TxHash would otherwise be ambiguous (both are hex strings).
 */
export type BatchedMethodResultWrapper<T extends BatchedMethod<keyof BatchableMethods>> = {
  /** The method name */
  name: T['name'];
  /** The method result */
  result: BatchedMethodResult<T>;
};

/**
 * Maps a tuple of BatchedMethod to a tuple of their wrapped return types
 */
export type BatchResults<T extends readonly BatchedMethod<keyof BatchableMethods>[]> = {
  [K in keyof T]: BatchedMethodResultWrapper<T[K]>;
};

/**
 * The wallet interface.
 */
export type Wallet = {
  getContractClassMetadata(id: Fr, includeArtifact?: boolean): Promise<ContractClassMetadata>;
  getContractMetadata(address: AztecAddress): Promise<ContractMetadata>;
  getPrivateEvents<T>(
    contractAddress: AztecAddress,
    eventMetadata: EventMetadataDefinition,
    from: number,
    numBlocks: number,
    recipients: AztecAddress[],
  ): Promise<T[]>;
  getChainInfo(): Promise<ChainInfo>;
  getTxReceipt(txHash: TxHash): Promise<TxReceipt>;
  registerSender(address: AztecAddress, alias?: string): Promise<AztecAddress>;
  getAddressBook(): Promise<Aliased<AztecAddress>[]>;
  getAccounts(): Promise<Aliased<AztecAddress>[]>;
  registerContract(
    instanceData: AztecAddress | ContractInstanceWithAddress | ContractInstantiationData | ContractInstanceAndArtifact,
  ): Promise<ContractInstanceWithAddress>;
  // Overloaded definition to avoid zod issues
  registerContract(
    instanceData: AztecAddress | ContractInstanceWithAddress | ContractInstantiationData | ContractInstanceAndArtifact,
    artifact: ContractArtifact,
  ): Promise<ContractInstanceWithAddress>;
  registerContract(
    instanceData: AztecAddress | ContractInstanceWithAddress | ContractInstantiationData | ContractInstanceAndArtifact,
    artifact: ContractArtifact | undefined,
    secretKey: Fr | undefined,
  ): Promise<ContractInstanceWithAddress>;
  simulateTx(exec: ExecutionPayload, opts: SimulateOptions): Promise<TxSimulationResult>;
  simulateUtility(
    functionName: string,
    args: any[],
    to: AztecAddress,
    authwits?: AuthWitness[],
  ): Promise<UtilitySimulationResult>;
  profileTx(exec: ExecutionPayload, opts: ProfileOptions): Promise<TxProfileResult>;
  sendTx(exec: ExecutionPayload, opts: SendOptions): Promise<TxHash>;
  createAuthWit(
    from: AztecAddress,
    messageHashOrIntent: Fr | Buffer<ArrayBuffer> | IntentInnerHash | CallIntent,
  ): Promise<AuthWitness>;
  batch<const T extends readonly BatchedMethod<keyof BatchableMethods>[]>(methods: T): Promise<BatchResults<T>>;
};

export const ContractInstantiationDataSchema = z.object({
  constructorArtifact: optional(z.union([FunctionAbiSchema, z.string()])),
  constructorArgs: optional(z.array(z.any())),
  skipArgsDecoding: optional(z.boolean()),
  salt: schemas.Fr,
  publicKeys: optional(PublicKeys.schema),
  deployer: optional(schemas.AztecAddress),
});

export const FunctionCallSchema = z.object({
  name: z.string(),
  to: schemas.AztecAddress,
  selector: schemas.FunctionSelector,
  type: z.nativeEnum(FunctionType),
  isStatic: z.boolean(),
  hideMsgSender: z.boolean(),
  args: z.array(schemas.Fr),
  returnTypes: z.array(AbiTypeSchema),
});

export const ExecutionPayloadSchema = z.object({
  calls: z.array(FunctionCallSchema),
  authWitnesses: z.array(AuthWitness.schema),
  capsules: z.array(Capsule.schema),
  extraHashedArgs: z.array(HashedValues.schema),
});

export const UserFeeOptionsSchema = z.object({
  gasSettings: optional(
    z.object({
      gasLimits: optional(Gas.schema),
      teardownGasLimits: optional(Gas.schema),
      maxFeePerGas: optional(z.object({ feePerDaGas: schemas.BigInt, feePerL2Gas: schemas.BigInt })),
      maxPriorityFeePerGas: optional(z.object({ feePerDaGas: schemas.BigInt, feePerL2Gas: schemas.BigInt })),
    }),
  ),
  embeddedPaymentMethodFeePayer: optional(schemas.AztecAddress),
});

export const WalletSimulationFeeOptionSchema = UserFeeOptionsSchema.extend({
  estimatedGasPadding: optional(z.number()),
  estimateGas: optional(z.boolean()),
});

export const SendOptionsSchema = z.object({
  from: schemas.AztecAddress,
  authWitnesses: optional(z.array(AuthWitness.schema)),
  capsules: optional(z.array(Capsule.schema)),
  fee: optional(UserFeeOptionsSchema),
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

export const InstanceDataSchema = z.union([
  schemas.AztecAddress,
  ContractInstanceWithAddressSchema,
  ContractInstantiationDataSchema,
  z.object({ instance: ContractInstanceWithAddressSchema, artifact: ContractArtifactSchema }),
]);

export const MessageHashOrIntentSchema = z.union([
  schemas.Fr,
  schemas.Buffer,
  z.object({ consumer: schemas.AztecAddress, innerHash: z.union([schemas.Buffer, schemas.Fr]) }),
  z.object({
    caller: schemas.AztecAddress,
    call: FunctionCallSchema,
  }),
]);

export const BatchedMethodSchema = z.union([
  z.object({
    name: z.literal('registerSender'),
    args: z.tuple([schemas.AztecAddress, optional(z.string())]),
  }),
  z.object({
    name: z.literal('registerContract'),
    args: z.tuple([InstanceDataSchema, optional(ContractArtifactSchema), optional(schemas.Fr)]),
  }),
  z.object({
    name: z.literal('sendTx'),
    args: z.tuple([ExecutionPayloadSchema, SendOptionsSchema]),
  }),
  z.object({
    name: z.literal('simulateUtility'),
    args: z.tuple([z.string(), z.array(z.any()), schemas.AztecAddress, optional(z.array(AuthWitness.schema))]),
  }),
]);

export const ContractMetadataSchema = z.object({
  contractInstance: z.union([ContractInstanceWithAddressSchema, z.undefined()]),
  isContractInitialized: z.boolean(),
  isContractPublished: z.boolean(),
}) satisfies ZodFor<ContractMetadata>;

export const ContractClassMetadataSchema = z.object({
  contractClass: z.union([ContractClassWithIdSchema, z.undefined()]),
  isContractClassPubliclyRegistered: z.boolean(),
  artifact: z.union([ContractArtifactSchema, z.undefined()]),
}) satisfies ZodFor<ContractClassMetadata>;

export const EventMetadataDefinitionSchema = z.object({
  eventSelector: schemas.EventSelector,
  abiType: AbiTypeSchema,
  fieldNames: z.array(z.string()),
});

export const WalletSchema: ApiSchemaFor<Wallet> = {
  getChainInfo: z
    .function()
    .args()
    .returns(z.object({ chainId: schemas.Fr, version: schemas.Fr })),
  getContractClassMetadata: z.function().args(schemas.Fr, optional(z.boolean())).returns(ContractClassMetadataSchema),
  getContractMetadata: z.function().args(schemas.AztecAddress).returns(ContractMetadataSchema),
  getTxReceipt: z.function().args(TxHash.schema).returns(TxReceipt.schema),
  getPrivateEvents: z
    .function()
    .args(schemas.AztecAddress, EventMetadataDefinitionSchema, z.number(), z.number(), z.array(schemas.AztecAddress))
    .returns(z.array(AbiDecodedSchema)),
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
    .args(InstanceDataSchema, optional(ContractArtifactSchema), optional(schemas.Fr))
    .returns(ContractInstanceWithAddressSchema),
  simulateTx: z.function().args(ExecutionPayloadSchema, SimulateOptionsSchema).returns(TxSimulationResult.schema),
  simulateUtility: z
    .function()
    .args(z.string(), z.array(z.any()), schemas.AztecAddress, optional(z.array(AuthWitness.schema)))
    .returns(UtilitySimulationResult.schema),
  profileTx: z.function().args(ExecutionPayloadSchema, ProfileOptionsSchema).returns(TxProfileResult.schema),
  sendTx: z.function().args(ExecutionPayloadSchema, SendOptionsSchema).returns(TxHash.schema),
  createAuthWit: z.function().args(schemas.AztecAddress, MessageHashOrIntentSchema).returns(AuthWitness.schema),
  // @ts-expect-error - ApiSchemaFor cannot properly type generic methods with readonly arrays
  batch: z
    .function()
    .args(z.array(BatchedMethodSchema))
    .returns(
      z.array(
        z.discriminatedUnion('name', [
          z.object({ name: z.literal('registerSender'), result: schemas.AztecAddress }),
          z.object({ name: z.literal('registerContract'), result: ContractInstanceWithAddressSchema }),
          z.object({ name: z.literal('sendTx'), result: TxHash.schema }),
          z.object({ name: z.literal('simulateUtility'), result: UtilitySimulationResult.schema }),
        ]),
      ),
    ),
};
