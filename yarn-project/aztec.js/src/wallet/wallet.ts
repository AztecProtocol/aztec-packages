import type { UserFeeOptions } from '@aztec/entrypoints/interfaces';
import type { ExecutionPayload } from '@aztec/entrypoints/payload';
import type { Fr } from '@aztec/foundation/fields';
import type { ZodFor, ZodNullableOptional } from '@aztec/foundation/schemas';
import {
  AbiTypeSchema,
  type ContractArtifact,
  ContractArtifactSchema,
  FunctionAbiSchema,
  FunctionType,
} from '@aztec/stdlib/abi';
import { AuthWitness } from '@aztec/stdlib/auth-witness';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  type ContractInstanceWithAddress,
  ContractInstanceWithAddressSchema,
  type ContractInstantiationData,
} from '@aztec/stdlib/contract';
import { Gas, GasSettings } from '@aztec/stdlib/gas';
import {
  ContractClassMetadataSchema,
  ContractMetadataSchema,
  EventMetadataDefinitionSchema,
  type PXE,
} from '@aztec/stdlib/interfaces/client';
import { PublicKeys } from '@aztec/stdlib/keys';
import { AbiDecodedSchema, type ApiSchemaFor, optional, schemas } from '@aztec/stdlib/schemas';
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
import { ContractFunctionInteraction } from '../contract/contract_function_interaction.js';
import type {
  ProfileMethodOptions,
  SendMethodOptions,
  SimulateMethodOptions,
} from '../contract/interaction_options.js';
import type { IntentAction, IntentInnerHash } from '../utils/authwit.js';

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
 * The wallet interface.
 */
export type Wallet = Pick<
  PXE,
  'getContractClassMetadata' | 'getContractMetadata' | 'getTxReceipt' | 'getPrivateEvents' | 'getPublicEvents'
> & {
  registerSender(address: AztecAddress, alias?: string): Promise<AztecAddress>;
  getSenders(): Promise<Aliased<AztecAddress>[]>;
  getAccounts(): Promise<Aliased<AztecAddress>[]>;
  registerContract(
    instanceData: AztecAddress | ContractInstanceWithAddress | ContractInstantiationData | ContractInstanceAndArtifact,
    artifact?: ContractArtifact,
  ): Promise<ContractInstanceWithAddress>;
  estimateGas(
    exec: ExecutionPayload,
    opts: Omit<SendMethodOptions, 'estimateGas'>,
  ): Promise<Pick<GasSettings, 'gasLimits' | 'teardownGasLimits'>>;
  simulateTx(exec: ExecutionPayload, opts: SimulateMethodOptions): Promise<TxSimulationResult>;
  simulateUtility(
    functionName: string,
    args: any[],
    to: AztecAddress,
    authwits?: AuthWitness[],
  ): Promise<UtilitySimulationResult>;
  profileTx(exec: ExecutionPayload, opts: ProfileMethodOptions): Promise<TxProfileResult>;
  proveTx(exec: ExecutionPayload, opts: SendMethodOptions): Promise<TxProvingResult>;
  sendTx(tx: Tx): Promise<TxHash>;
  createAuthWit(
    from: AztecAddress,
    messageHashOrIntent: Fr | Buffer<ArrayBuffer> | IntentInnerHash | IntentAction,
  ): Promise<AuthWitness>;
  setPublicAuthWit(
    from: AztecAddress,
    messageHashOrIntent: Fr | Buffer<ArrayBuffer> | IntentInnerHash | IntentAction,
    authorized: boolean,
  ): Promise<ContractFunctionInteraction>;
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
  baseFeePadding: optional(z.number()),
  estimateGas: optional(z.boolean()),
  estimateGasPadding: optional(z.number()),
});

const SendMethodOptionsSchema = z.object({
  from: schemas.AztecAddress,
  authWitnesses: optional(z.array(AuthWitness.schema)),
  capsules: optional(z.array(Capsule.schema)),
  fee: optional(UserFeeOptionsSchema),
});

const EstimateGasOptionSchema = z.object({
  from: schemas.AztecAddress,
  authWitnesses: optional(z.array(AuthWitness.schema)),
  capsules: optional(z.array(Capsule.schema)),
  fee: optional(UserFeeOptionsSchema.omit({ estimateGas: true })),
});

const SimulateMethodOptionsSchema = z.object({
  from: schemas.AztecAddress,
  authWitnesses: optional(z.array(AuthWitness.schema)),
  capsules: optional(z.array(Capsule.schema)),
  fee: optional(UserFeeOptionsSchema),
  skipTxValidation: optional(z.boolean()),
  skipFeeEnforcement: optional(z.boolean()),
  includeMetadata: optional(z.boolean()),
});

const ProfileMethodOptionsSchema = SimulateMethodOptionsSchema.extend({
  profileMode: z.enum(['gates', 'execution-steps', 'full']),
  skipProofGeneration: optional(z.boolean()),
});

const InstanceDataSchema = z.union([
  schemas.AztecAddress,
  ContractInstanceWithAddressSchema,
  ContractInstantiationDataSchema,
  z.object({ instance: ContractInstanceWithAddressSchema, artifact: ContractArtifactSchema }),
]);

// @ts-expect-error Zod doesn't understand the registerContract method schema, but it is correct.
export const generateWalletSchema: (wallet: Wallet) => ApiSchemaFor<Wallet> = wallet => {
  const ContractFunctionInteractionSchema = z
    .object({
      contractAddress: schemas.AztecAddress,
      functionDao: FunctionAbiSchema,
      args: z.array(z.any()),
      authWitnesses: z.array(AuthWitness.schema),
      capsules: z.array(Capsule.schema),
      extraHashedArgs: z.array(HashedValues.schema),
    })
    .transform(
      obj =>
        new ContractFunctionInteraction(
          wallet,
          obj.contractAddress,
          obj.functionDao,
          obj.args,
          obj.authWitnesses,
          obj.capsules,
          obj.extraHashedArgs,
        ),
    );

  const MessageHashOrIntentSchema = z.union([
    schemas.Fr,
    schemas.Buffer,
    z.object({ consumer: schemas.AztecAddress, innerHash: z.union([schemas.Buffer, schemas.Fr]) }),
    z.object({
      caller: schemas.AztecAddress,
      action: z.union([FunctionCallSchema, ContractFunctionInteractionSchema]),
    }),
  ]);
  return {
    getContractClassMetadata: z.function().args(schemas.Fr, optional(z.boolean())).returns(ContractClassMetadataSchema),
    getContractMetadata: z.function().args(schemas.AztecAddress).returns(ContractMetadataSchema),
    getTxReceipt: z.function().args(TxHash.schema).returns(TxReceipt.schema),
    getPrivateEvents: z
      .function()
      .args(schemas.AztecAddress, EventMetadataDefinitionSchema, z.number(), z.number(), z.array(schemas.AztecAddress))
      .returns(z.array(AbiDecodedSchema)),
    getPublicEvents: z
      .function()
      .args(EventMetadataDefinitionSchema, z.number(), z.number())
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
    registerContract: z
      .function()
      .args(InstanceDataSchema, optional(ContractArtifactSchema))
      .returns(ContractInstanceWithAddressSchema),
    estimateGas: z
      .function()
      .args(ExecutionPayloadSchema, EstimateGasOptionSchema)
      .returns(z.object({ gasLimits: Gas.schema, teardownGasLimits: Gas.schema })),
    simulateTx: z
      .function()
      .args(ExecutionPayloadSchema, SimulateMethodOptionsSchema)
      .returns(TxSimulationResult.schema),
    simulateUtility: z
      .function()
      .args(z.string(), z.array(z.any()), schemas.AztecAddress, optional(z.array(AuthWitness.schema)))
      .returns(UtilitySimulationResult.schema),
    profileTx: z.function().args(ExecutionPayloadSchema, ProfileMethodOptionsSchema).returns(TxProfileResult.schema),
    proveTx: z.function().args(ExecutionPayloadSchema, SendMethodOptionsSchema).returns(TxProvingResult.schema),
    sendTx: z.function().args(Tx.schema).returns(TxHash.schema),
    createAuthWit: z.function().args(schemas.AztecAddress, MessageHashOrIntentSchema).returns(AuthWitness.schema),
    setPublicAuthWit: z
      .function()
      .args(schemas.AztecAddress, MessageHashOrIntentSchema, z.boolean())
      .returns(ContractFunctionInteractionSchema),
  };
};
