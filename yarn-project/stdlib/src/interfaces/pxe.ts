import { L1_TO_L2_MSG_TREE_HEIGHT } from '@aztec/constants';
import type { Fr } from '@aztec/foundation/fields';
import type { ApiSchemaFor, ZodFor } from '@aztec/foundation/schemas';
import { SiblingPath } from '@aztec/foundation/trees';

import { z } from 'zod';

import { type AbiType, AbiTypeSchema, type ContractArtifact, ContractArtifactSchema } from '../abi/abi.js';
import type { EventSelector } from '../abi/event_selector.js';
import { AuthWitness } from '../auth_witness/auth_witness.js';
import type { AztecAddress } from '../aztec-address/index.js';
import { L2Block } from '../block/l2_block.js';
import {
  CompleteAddress,
  type ContractClassWithId,
  ContractClassWithIdSchema,
  type ContractInstanceWithAddress,
  ContractInstanceWithAddressSchema,
  type NodeInfo,
  NodeInfoSchema,
  type PartialAddress,
  type ProtocolContractAddresses,
  ProtocolContractAddressesSchema,
} from '../contract/index.js';
import { GasFees } from '../gas/gas_fees.js';
import { type LogFilter, LogFilterSchema } from '../logs/log_filter.js';
import { UniqueNote } from '../note/extended_note.js';
import { type NotesFilter, NotesFilterSchema } from '../note/notes_filter.js';
import { AbiDecodedSchema, optional, schemas } from '../schemas/schemas.js';
import {
  type IndexedTxEffect,
  PrivateExecutionResult,
  SimulationOverrides,
  Tx,
  TxExecutionRequest,
  TxHash,
  TxReceipt,
  TxSimulationResult,
  indexedTxSchema,
} from '../tx/index.js';
import { TxProfileResult, UtilitySimulationResult } from '../tx/profiling.js';
import { TxProvingResult } from '../tx/proven_tx.js';
import {
  type GetContractClassLogsResponse,
  GetContractClassLogsResponseSchema,
  type GetPublicLogsResponse,
  GetPublicLogsResponseSchema,
} from './get_logs_response.js';

// docs:start:pxe-interface
/**
 * Private eXecution Environment (PXE) runs locally for each user, providing functionality for all the operations
 * needed to interact with the Aztec network, including account management, private data management,
 * transaction local simulation, and access to an Aztec node. This interface, as part of a Wallet,
 * is exposed to dapps for interacting with the network on behalf of the user.
 */
export interface PXE {
  /**
   * Returns whether an L1 to L2 message is synced by archiver and if it's ready to be included in a block.
   * @param l1ToL2Message - The L1 to L2 message to check.
   * @returns Whether the message is synced and ready to be included in a block.
   */
  isL1ToL2MessageSynced(l1ToL2Message: Fr): Promise<boolean>;

  /**
   * Registers a user account in PXE given its master encryption private key.
   * Once a new account is registered, the PXE Service will trial-decrypt all published notes on
   * the chain and store those that correspond to the registered account. Will do nothing if the
   * account is already registered.
   *
   * @param secretKey - Secret key of the corresponding user master public key.
   * @param partialAddress - The partial address of the account contract corresponding to the account being registered.
   * @returns The complete address of the account.
   */
  registerAccount(secretKey: Fr, partialAddress: PartialAddress): Promise<CompleteAddress>;

  /**
   * Retrieves the user accounts registered on this PXE Service.
   * @returns An array of the accounts registered on this PXE Service.
   */
  getRegisteredAccounts(): Promise<CompleteAddress[]>;

  /**
   * Registers a user contact in PXE.
   *
   * Once a new contact is registered, the PXE Service will be able to receive notes tagged from this contact.
   * Will do nothing if the account is already registered.
   *
   * @param address - Address of the user to add to the address book
   * @returns The address address of the account.
   */
  registerSender(address: AztecAddress): Promise<AztecAddress>;

  /**
   * Retrieves the addresses stored as senders on this PXE Service.
   * @returns An array of the senders on this PXE Service.
   */
  getSenders(): Promise<AztecAddress[]>;

  /**
   * Removes a sender in the address book.
   */
  removeSender(address: AztecAddress): Promise<void>;

  /**
   * Registers a contract class in the PXE without registering any associated contract instance with it.
   *
   * @param artifact - The build artifact for the contract class.
   */
  registerContractClass(artifact: ContractArtifact): Promise<void>;

  /**
   * Adds deployed contracts to the PXE Service. Deployed contract information is used to access the
   * contract code when simulating local transactions. This is automatically called by aztec.js when
   * deploying a contract. Dapps that wish to interact with contracts already deployed should register
   * these contracts in their users' PXE Service through this method.
   *
   * @param contract - A contract instance to register, with an optional artifact which can be omitted if the contract class has already been registered.
   */
  registerContract(contract: { instance: ContractInstanceWithAddress; artifact?: ContractArtifact }): Promise<void>;

  /**
   * Updates a deployed contract in the PXE Service. This is used to update the contract artifact when
   * an update has happened, so the new code can be used in the simulation of local transactions.
   * This is called by aztec.js when instantiating a contract in a given address with a mismatching artifact.
   * @param contractAddress - The address of the contract to update.
   * @param artifact - The updated artifact for the contract.
   */
  updateContract(contractAddress: AztecAddress, artifact: ContractArtifact): Promise<void>;

  /**
   * Retrieves the addresses of contracts added to this PXE Service.
   * @returns An array of contracts addresses registered on this PXE Service.
   */
  getContracts(): Promise<AztecAddress[]>;

  /**
   * Proves the private portion of a simulated transaction, ready to send to the network
   * (where validators prove the public portion).
   *
   * @param txRequest - An authenticated tx request ready for proving
   * @param privateExecutionResult - (optional) The result of the private execution of the transaction. The txRequest
   * will be executed if not provided
   * @returns A result containing the proof and public inputs of the tail circuit.
   * @throws If contract code not found, or public simulation reverts.
   * Also throws if simulatePublic is true and public simulation reverts.
   */
  proveTx(txRequest: TxExecutionRequest, privateExecutionResult?: PrivateExecutionResult): Promise<TxProvingResult>;

  /**
   * Simulates a transaction based on the provided preauthenticated execution request.
   * This will run a local simulation of private execution (and optionally of public as well), run the
   * kernel circuits to ensure adherence to protocol rules (without generating a proof), and return the
   * simulation results .
   *
   *
   * Note that this is used with `ContractFunctionInteraction::simulateTx` to bypass certain checks.
   * In that case, the transaction returned is only potentially ready to be sent to the network for execution.
   *
   *
   * @param txRequest - An authenticated tx request ready for simulation
   * @param simulatePublic - Whether to simulate the public part of the transaction.
   * @param msgSender - (Optional) The message sender to use for the simulation.
   * @param skipTxValidation - (Optional) If false, this function throws if the transaction is unable to be included in a block at the current state.
   * @param skipFeeEnforcement - (Optional) If false, fees are enforced.
   * @param skipClassVerification - (Optional) If false, addresses are verified to belong to the proper contractClassIds
   * @param scopes - (Optional) The accounts whose notes we can access in this call. Currently optional and will default to all.
   * @returns A simulated transaction result object that includes public and private return values.
   * @throws If the code for the functions executed in this transaction have not been made available via `addContracts`.
   * Also throws if simulatePublic is true and public simulation reverts.
   */
  simulateTx(
    txRequest: TxExecutionRequest,
    simulatePublic: boolean,
    skipTxValidation?: boolean,
    skipFeeEnforcement?: boolean,
    overrides?: SimulationOverrides,
    scopes?: AztecAddress[],
  ): Promise<TxSimulationResult>;

  /**
   * Profiles a transaction, reporting gate counts (unless disabled) and returns an execution trace.
   *
   * @param txRequest - An authenticated tx request ready for simulation
   * @param msgSender - (Optional) The message sender to use for the simulation.
   * @param skipTxValidation - (Optional) If false, this function throws if the transaction is unable to be included in a block at the current state.
   * @returns A trace of the program execution with gate counts.
   * @throws If the code for the functions executed in this transaction have not been made available via `addContracts`.
   */
  profileTx(
    txRequest: TxExecutionRequest,
    profileMode: 'gates' | 'execution-steps' | 'full',
    skipProofGeneration?: boolean,
    msgSender?: AztecAddress,
  ): Promise<TxProfileResult>;

  /**
   * Sends a transaction to an Aztec node to be broadcasted to the network and mined.
   * @param tx - The transaction as created via `proveTx`.
   * @returns A hash of the transaction, used to identify it.
   */
  sendTx(tx: Tx): Promise<TxHash>;

  /**
   * Fetches a transaction receipt for a given transaction hash. Returns a mined receipt if it was added
   * to the chain, a pending receipt if it's still in the mempool of the connected Aztec node, or a dropped
   * receipt if not found in the connected Aztec node.
   *
   * @param txHash - The transaction hash.
   * @returns A receipt of the transaction.
   */
  getTxReceipt(txHash: TxHash): Promise<TxReceipt>;

  /**
   * Gets a tx effect.
   * @param txHash - The hash of the tx corresponding to the tx effect.
   * @returns The requested tx effect with block info (or undefined if not found).
   */
  getTxEffect(txHash: TxHash): Promise<IndexedTxEffect | undefined>;

  /**
   * Gets the storage value at the given contract storage slot.
   *
   * @remarks The storage slot here refers to the slot as it is defined in Noir not the index in the merkle tree.
   * Aztec's version of `eth_getStorageAt`.
   *
   * @param contract - Address of the contract to query.
   * @param slot - Slot to query.
   * @returns Storage value at the given contract slot.
   * @throws If the contract is not deployed.
   */
  getPublicStorageAt(contract: AztecAddress, slot: Fr): Promise<Fr>;

  /**
   * Gets notes registered in this PXE based on the provided filter.
   * @param filter - The filter to apply to the notes.
   * @returns The requested notes.
   */
  getNotes(filter: NotesFilter): Promise<UniqueNote[]>;

  /**
   * Fetches an L1 to L2 message from the node.
   * @param contractAddress - Address of a contract by which the message was emitted.
   * @param messageHash - Hash of the message.
   * @param secret - Secret used to compute a nullifier.
   * @dev Contract address and secret are only used to compute the nullifier to get non-nullified messages
   * @returns The l1 to l2 membership witness (index of message in the tree and sibling path).
   */
  getL1ToL2MembershipWitness(
    contractAddress: AztecAddress,
    messageHash: Fr,
    secret: Fr,
  ): Promise<[bigint, SiblingPath<typeof L1_TO_L2_MSG_TREE_HEIGHT>]>;

  /**
   * Gets the membership witness for a message that was emitted at a particular block
   * @param blockNumber - The block number in which to search for the message
   * @param l2Tol1Message - The message to search for
   * @returns The membership witness for the message
   */
  getL2ToL1MembershipWitness(blockNumber: number, l2Tol1Message: Fr): Promise<[bigint, SiblingPath<number>]>;

  /**
   * Get the given block.
   * @param number - The block number being requested.
   * @returns The blocks requested.
   */
  getBlock(number: number): Promise<L2Block | undefined>;

  /**
   * Method to fetch the current base fees.
   * @returns The current base fees.
   */
  getCurrentBaseFees(): Promise<GasFees>;

  /**
   * Simulate the execution of a contract utility function.
   *
   * @param functionName - The name of the utility contract function to be called.
   * @param args - The arguments to be provided to the function.
   * @param to - The address of the contract to be called.
   * @param authwits - (Optional) The authentication witnesses required for the function call.
   * @param from - (Optional) The msg sender to set for the call.
   * @param scopes - (Optional) The accounts whose notes we can access in this call. Currently optional and will
   * default to all.
   * @returns The result of the utility function call, structured based on the function ABI.
   */
  simulateUtility(
    functionName: string,
    args: any[],
    to: AztecAddress,
    authwits?: AuthWitness[],
    from?: AztecAddress,
    scopes?: AztecAddress[],
  ): Promise<UtilitySimulationResult>;

  /**
   * Gets public logs based on the provided filter.
   * @param filter - The filter to apply to the logs.
   * @returns The requested logs.
   */
  getPublicLogs(filter: LogFilter): Promise<GetPublicLogsResponse>;

  /**
   * Gets contract class logs based on the provided filter.
   * @param filter - The filter to apply to the logs.
   * @returns The requested logs.
   */
  getContractClassLogs(filter: LogFilter): Promise<GetContractClassLogsResponse>;

  /**
   * Fetches the current block number.
   * @returns The block number.
   */
  getBlockNumber(): Promise<number>;

  /**
   * Fetches the current proven block number.
   * @returns The block number.
   */
  getProvenBlockNumber(): Promise<number>;

  /**
   * Returns the information about the server's node. Includes current Node version, compatible Noir version,
   * L1 chain identifier, rollup version, and L1 address of the rollup contract.
   * @returns - The node information.
   */
  getNodeInfo(): Promise<NodeInfo>;

  /**
   * Returns information about this PXE.
   */
  getPXEInfo(): Promise<PXEInfo>;

  /**
   * Returns the contract metadata given an address.
   * The metadata consists of its contract instance, which includes the contract class identifier,
   * initialization hash, deployment salt, and public keys hash; whether the contract instance has been initialized;
   * and whether the contract instance with the given address has been publicly deployed.
   * @remark - it queries the node to check whether the contract instance has been initialized / publicly deployed through a node.
   * This query is not dependent on the PXE.
   * @param address - The address that the contract instance resides at.
   * @returns - It returns the contract metadata
   * TODO(@spalladino): Should we return the public keys in plain as well here?
   */
  getContractMetadata(address: AztecAddress): Promise<ContractMetadata>;

  /**
   * Returns the contract class metadata given a contract class id.
   * The metadata consists of its contract class, whether it has been publicly registered, and its artifact.
   * @remark - it queries the node to check whether the contract class with the given id has been publicly registered.
   * @param id - Identifier of the class.
   * @param includeArtifact - Identifier of the class.
   * @returns - It returns the contract class metadata, with the artifact field being optional, and will only be returned if true is passed in
   * for `includeArtifact`
   * TODO(@spalladino): The PXE actually holds artifacts and not classes, what should we return? Also,
   * should the pxe query the node for contract public info, and merge it with its own definitions?
   * TODO(@spalladino): This method is strictly needed to decide whether to publicly register a class or not
   * during a public deployment. We probably want a nicer and more general API for this, but it'll have to
   * do for the time being.
   */
  getContractClassMetadata(id: Fr, includeArtifact?: boolean): Promise<ContractClassMetadata>;

  /**
   * Returns the private events given search parameters.
   * @param contractAddress - The address of the contract to get events from.
   * @param eventMetadata - Metadata of the event. This should be the class generated from the contract. e.g. Contract.events.Event
   * @param from - The block number to search from.
   * @param numBlocks - The amount of blocks to search.
   * @param recipients - The addresses that decrypted the logs.
   * @returns - The deserialized events.
   */
  getPrivateEvents<T>(
    contractAddress: AztecAddress,
    eventMetadata: EventMetadataDefinition,
    from: number,
    numBlocks: number,
    recipients: AztecAddress[],
  ): Promise<T[]>;

  /**
   * Returns the public events given search parameters.
   * @param eventMetadata - Metadata of the event. This should be the class generated from the contract. e.g. Contract.events.Event
   * @param from - The block number to search from.
   * @param limit - The amount of blocks to search.
   * @returns - The deserialized events.
   */
  getPublicEvents<T>(eventMetadata: EventMetadataDefinition, from: number, limit: number): Promise<T[]>;
}
// docs:end:pxe-interface

export type EventMetadataDefinition = {
  eventSelector: EventSelector;
  abiType: AbiType;
  fieldNames: string[];
};

const EventMetadataDefinitionSchema = z.object({
  eventSelector: schemas.EventSelector,
  abiType: AbiTypeSchema,
  fieldNames: z.array(z.string()),
});

/** This is used in getting events via the filter */
export enum EventType {
  Encrypted = 'Encrypted',
  Unencrypted = 'Unencrypted',
}

/** Provides basic information about the running PXE. */
export interface PXEInfo {
  /** Version as tracked in the aztec-packages repository. */
  pxeVersion: string;
  /** Protocol contract addresses */
  protocolContractAddresses: ProtocolContractAddresses;
}

export interface ContractMetadata {
  contractInstance?: ContractInstanceWithAddress | undefined;
  isContractInitialized: boolean;
  isContractPubliclyDeployed: boolean;
}

export interface ContractClassMetadata {
  contractClass?: ContractClassWithId | undefined;
  isContractClassPubliclyRegistered: boolean;
  artifact?: ContractArtifact | undefined;
}

const ContractMetadataSchema = z.object({
  contractInstance: z.union([ContractInstanceWithAddressSchema, z.undefined()]),
  isContractInitialized: z.boolean(),
  isContractPubliclyDeployed: z.boolean(),
}) satisfies ZodFor<ContractMetadata>;

const ContractClassMetadataSchema = z.object({
  contractClass: z.union([ContractClassWithIdSchema, z.undefined()]),
  isContractClassPubliclyRegistered: z.boolean(),
  artifact: z.union([ContractArtifactSchema, z.undefined()]),
}) satisfies ZodFor<ContractClassMetadata>;

const PXEInfoSchema = z.object({
  pxeVersion: z.string(),
  protocolContractAddresses: ProtocolContractAddressesSchema,
}) satisfies ZodFor<PXEInfo>;

export const PXESchema: ApiSchemaFor<PXE> = {
  isL1ToL2MessageSynced: z.function().args(schemas.Fr).returns(z.boolean()),
  registerAccount: z.function().args(schemas.Fr, schemas.Fr).returns(CompleteAddress.schema),
  getRegisteredAccounts: z.function().returns(z.array(CompleteAddress.schema)),
  registerSender: z.function().args(schemas.AztecAddress).returns(schemas.AztecAddress),
  getSenders: z.function().returns(z.array(schemas.AztecAddress)),
  removeSender: z.function().args(schemas.AztecAddress).returns(z.void()),
  registerContractClass: z.function().args(ContractArtifactSchema).returns(z.void()),
  registerContract: z
    .function()
    .args(z.object({ instance: ContractInstanceWithAddressSchema, artifact: z.optional(ContractArtifactSchema) }))
    .returns(z.void()),
  updateContract: z.function().args(schemas.AztecAddress, ContractArtifactSchema).returns(z.void()),
  getContracts: z.function().returns(z.array(schemas.AztecAddress)),
  proveTx: z
    .function()
    .args(TxExecutionRequest.schema, optional(PrivateExecutionResult.schema))
    .returns(TxProvingResult.schema),
  profileTx: z
    .function()
    .args(
      TxExecutionRequest.schema,
      z.union([z.literal('gates'), z.literal('full'), z.literal('execution-steps')]),
      optional(z.boolean()),
      optional(schemas.AztecAddress),
    )
    .returns(TxProfileResult.schema),
  simulateTx: z
    .function()
    .args(
      TxExecutionRequest.schema,
      z.boolean(),
      optional(z.boolean()),
      optional(z.boolean()),
      optional(SimulationOverrides.schema),
      optional(z.array(schemas.AztecAddress)),
    )
    .returns(TxSimulationResult.schema),
  sendTx: z.function().args(Tx.schema).returns(TxHash.schema),
  getTxReceipt: z.function().args(TxHash.schema).returns(TxReceipt.schema),
  getTxEffect: z.function().args(TxHash.schema).returns(indexedTxSchema().optional()),
  getPublicStorageAt: z.function().args(schemas.AztecAddress, schemas.Fr).returns(schemas.Fr),
  getNotes: z.function().args(NotesFilterSchema).returns(z.array(UniqueNote.schema)),
  getL1ToL2MembershipWitness: z
    .function()
    .args(schemas.AztecAddress, schemas.Fr, schemas.Fr)
    .returns(z.tuple([schemas.BigInt, SiblingPath.schemaFor(L1_TO_L2_MSG_TREE_HEIGHT)])),
  getL2ToL1MembershipWitness: z
    .function()
    .args(z.number(), schemas.Fr)
    .returns(z.tuple([schemas.BigInt, SiblingPath.schema])),
  getBlock: z
    .function()
    .args(z.number())
    .returns(z.union([L2Block.schema, z.undefined()])),
  getCurrentBaseFees: z.function().returns(GasFees.schema),

  simulateUtility: z
    .function()
    .args(
      z.string(),
      z.array(z.any()),
      schemas.AztecAddress,
      optional(z.array(AuthWitness.schema)),
      optional(schemas.AztecAddress),
      optional(z.array(schemas.AztecAddress)),
    )
    .returns(UtilitySimulationResult.schema),
  getPublicLogs: z.function().args(LogFilterSchema).returns(GetPublicLogsResponseSchema),
  getContractClassLogs: z.function().args(LogFilterSchema).returns(GetContractClassLogsResponseSchema),
  getBlockNumber: z.function().returns(z.number()),
  getProvenBlockNumber: z.function().returns(z.number()),
  getNodeInfo: z.function().returns(NodeInfoSchema),
  getPXEInfo: z.function().returns(PXEInfoSchema),
  getContractMetadata: z.function().args(schemas.AztecAddress).returns(ContractMetadataSchema),
  getContractClassMetadata: z.function().args(schemas.Fr, optional(z.boolean())).returns(ContractClassMetadataSchema),
  getPrivateEvents: z
    .function()
    .args(schemas.AztecAddress, EventMetadataDefinitionSchema, z.number(), z.number(), z.array(schemas.AztecAddress))
    .returns(z.array(AbiDecodedSchema)),
  getPublicEvents: z
    .function()
    .args(EventMetadataDefinitionSchema, z.number(), z.number())
    .returns(z.array(AbiDecodedSchema)),
};
