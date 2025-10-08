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
  Tx,
  TxHash,
  TxProfileResult,
  TxProvingResult,
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
  getSenders(): Promise<Aliased<AztecAddress>[]>;
  getAccounts(): Promise<Aliased<AztecAddress>[]>;
  registerContract(
    instanceData: AztecAddress | ContractInstanceWithAddress | ContractInstantiationData | ContractInstanceAndArtifact,
    artifact?: ContractArtifact,
    secretKey?: Fr,
  ): Promise<ContractInstanceWithAddress>;
  simulateTx(exec: ExecutionPayload, opts: SimulateOptions): Promise<TxSimulationResult>;
  simulateUtility(
    functionName: string,
    args: any[],
    to: AztecAddress,
    authwits?: AuthWitness[],
  ): Promise<UtilitySimulationResult>;
  profileTx(exec: ExecutionPayload, opts: ProfileOptions): Promise<TxProfileResult>;
  proveTx(exec: ExecutionPayload, opts: SendOptions): Promise<TxProvingResult>;
  sendTx(tx: Tx): Promise<TxHash>;
  createAuthWit(
    from: AztecAddress,
    messageHashOrIntent: Fr | Buffer<ArrayBuffer> | IntentInnerHash | CallIntent,
  ): Promise<AuthWitness>;
};

const ContractInstantiationDataSchema = z.object({
  constructorArtifact: optional(z.union([FunctionAbiSchema, z.string()])),
  constructorArgs: optional(z.array(z.any())),
  skipArgsDecoding: optional(z.boolean()),
  salt: schemas.Fr,
  publicKeys: optional(PublicKeys.schema),
  deployer: optional(schemas.AztecAddress),
});

const FunctionCallSchema = z.object({
  name: z.string(),
  to: schemas.AztecAddress,
  selector: schemas.FunctionSelector,
  type: z.nativeEnum(FunctionType),
  isStatic: z.boolean(),
  args: z.array(schemas.Fr),
  returnTypes: z.array(AbiTypeSchema),
});

const ExecutionPayloadSchema = z.object({
  calls: z.array(FunctionCallSchema),
  authWitnesses: z.array(AuthWitness.schema),
  capsules: z.array(Capsule.schema),
  extraHashedArgs: z.array(HashedValues.schema),
});

const UserFeeOptionsSchema = z.object({
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

const WalletSimulationFeeOptionschema = UserFeeOptionsSchema.extend({
  estimatedGasPadding: optional(z.number()),
  estimateGas: optional(z.boolean()),
});

const SendOptionsSchema = z.object({
  from: schemas.AztecAddress,
  authWitnesses: optional(z.array(AuthWitness.schema)),
  capsules: optional(z.array(Capsule.schema)),
  fee: optional(UserFeeOptionsSchema),
});

const SimulateOptionsSchema = z.object({
  from: schemas.AztecAddress,
  authWitnesses: optional(z.array(AuthWitness.schema)),
  capsules: optional(z.array(Capsule.schema)),
  fee: optional(WalletSimulationFeeOptionschema),
  skipTxValidation: optional(z.boolean()),
  skipFeeEnforcement: optional(z.boolean()),
  includeMetadata: optional(z.boolean()),
});

const ProfileOptionsSchema = SimulateOptionsSchema.extend({
  profileMode: z.enum(['gates', 'execution-steps', 'full']),
  skipProofGeneration: optional(z.boolean()),
});

const InstanceDataSchema = z.union([
  schemas.AztecAddress,
  ContractInstanceWithAddressSchema,
  ContractInstantiationDataSchema,
  z.object({ instance: ContractInstanceWithAddressSchema, artifact: ContractArtifactSchema }),
]);

const MessageHashOrIntentSchema = z.union([
  schemas.Fr,
  schemas.Buffer,
  z.object({ consumer: schemas.AztecAddress, innerHash: z.union([schemas.Buffer, schemas.Fr]) }),
  z.object({
    caller: schemas.AztecAddress,
    call: FunctionCallSchema,
  }),
]);

const ContractMetadataSchema = z.object({
  contractInstance: z.union([ContractInstanceWithAddressSchema, z.undefined()]),
  isContractInitialized: z.boolean(),
  isContractPublished: z.boolean(),
}) satisfies ZodFor<ContractMetadata>;

const ContractClassMetadataSchema = z.object({
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
  getSenders: z
    .function()
    .args()
    .returns(z.array(z.object({ alias: z.string(), item: schemas.AztecAddress }))),
  getAccounts: z
    .function()
    .args()
    .returns(z.array(z.object({ alias: z.string(), item: schemas.AztecAddress }))),
  // @ts-expect-error Zod doesn't like optionals
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
  proveTx: z.function().args(ExecutionPayloadSchema, SendOptionsSchema).returns(TxProvingResult.schema),
  sendTx: z.function().args(Tx.schema).returns(TxHash.schema),
  createAuthWit: z.function().args(schemas.AztecAddress, MessageHashOrIntentSchema).returns(AuthWitness.schema),
};
