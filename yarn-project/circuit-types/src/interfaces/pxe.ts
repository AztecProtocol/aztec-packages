import {
  type AztecAddress,
  CompleteAddress,
  type ContractClassWithId,
  ContractClassWithIdSchema,
  type ContractInstanceWithAddress,
  ContractInstanceWithAddressSchema,
  type Fr,
  GasFees,
  L1_TO_L2_MSG_TREE_HEIGHT,
  type NodeInfo,
  NodeInfoSchema,
  type PartialAddress,
  type Point,
  type ProtocolContractAddresses,
  ProtocolContractAddressesSchema,
} from '@aztec/circuits.js';
import {
  type AbiDecoded,
  type AbiType,
  AbiTypeSchema,
  type ContractArtifact,
  ContractArtifactSchema,
  type EventSelector,
} from '@aztec/foundation/abi';
import { AbiDecodedSchema, type ApiSchemaFor, type ZodFor, optional, schemas } from '@aztec/foundation/schemas';

import { z } from 'zod';

import { AuthWitness } from '../auth_witness.js';
import { type InBlock, inBlockSchemaFor } from '../in_block.js';
import { L2Block } from '../l2_block.js';
import {
  type GetContractClassLogsResponse,
  GetContractClassLogsResponseSchema,
  type GetPublicLogsResponse,
  GetPublicLogsResponseSchema,
  type LogFilter,
  LogFilterSchema,
} from '../logs/index.js';
import { ExtendedNote, UniqueNote } from '../notes/index.js';
import { type NotesFilter, NotesFilterSchema } from '../notes/notes_filter.js';
import { PrivateExecutionResult } from '../private_execution_result.js';
import { SiblingPath } from '../sibling_path/sibling_path.js';
import { Tx, TxHash, TxProvingResult, TxReceipt, TxSimulationResult } from '../tx/index.js';
import { TxEffect } from '../tx_effect.js';
import { TxExecutionRequest } from '../tx_execution_request.js';

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
   * Insert an auth witness for a given message hash. Auth witnesses are used to authorize actions on
   * behalf of a user. For instance, a token transfer initiated by a different address may request
   * authorization from the user to move their tokens. This authorization is granted by the user
   * account contract by verifying an auth witness requested to the execution oracle. Witnesses are
   * usually a signature over a hash of the action to be authorized, but their actual contents depend
   * on the account contract that consumes them.
   *
   * @param authWitness - The auth witness to insert. Composed of an identifier, which is the hash of
   * the action to be authorized, and the actual witness as an array of fields, which are to be
   * deserialized and processed by the account contract.
   */
  addAuthWitness(authWitness: AuthWitness): Promise<void>;

  /**
   * Fetches the serialized auth witness for a given message hash or returns undefined if not found.
   * @param messageHash - The hash of the message for which to get the auth witness.
   * @returns The serialized auth witness for the given message hash.
   */
  getAuthWitness(messageHash: Fr): Promise<Fr[] | undefined>;

  /**
   * Adding a capsule to the capsule dispenser.
   * @param capsule - An array of field elements representing the capsule.
   * @remarks A capsule is a "blob" of data that is passed to the contract through an oracle.
   */
  addCapsule(capsule: Fr[]): Promise<void>;

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
   * Retrieves the addresses of contracts added to this PXE Service.
   * @returns An array of contracts addresses registered on this PXE Service.
   */
  getContracts(): Promise<AztecAddress[]>;

  /**
   * Creates a proving result based on the provided preauthenticated execution request and the results
   * of executing the private part of the transaction. This will assemble the zero-knowledge proof for the private execution.
   * It returns an object that contains the proof and public inputs of the tail circuit, which can be converted into a Tx ready to be sent to the network
   *
   * @param txRequest - An authenticated tx request ready for proving
   * @param privateExecutionResult - The result of the private execution of the transaction
   * @returns A transaction ready to be sent to the network for execution.
   * @throws If the code for the functions executed in this transaction has not been made available via `addContracts`.
   * Also throws if simulatePublic is true and public simulation reverts.
   */
  proveTx(txRequest: TxExecutionRequest, privateExecutionResult: PrivateExecutionResult): Promise<TxProvingResult>;

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
   * @param profile - (Optional) If true, will run the private kernel prover with profiling enabled and include the result (gate count) in TxSimulationResult.
   * @param scopes - (Optional) The accounts whose notes we can access in this call. Currently optional and will default to all.
   * @returns A simulated transaction result object that includes public and private return values.
   * @throws If the code for the functions executed in this transaction has not been made available via `addContracts`.
   * Also throws if simulatePublic is true and public simulation reverts.
   */
  simulateTx(
    txRequest: TxExecutionRequest,
    simulatePublic: boolean,
    msgSender?: AztecAddress,
    skipTxValidation?: boolean,
    enforceFeePayment?: boolean,
    profile?: boolean,
    scopes?: AztecAddress[],
  ): Promise<TxSimulationResult>;

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
   * Get a tx effect.
   * @param txHash - The hash of a transaction which resulted in the returned tx effect.
   * @returns The requested tx effect.
   */
  getTxEffect(txHash: TxHash): Promise<InBlock<TxEffect> | undefined>;

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
   * Adds a note to the database.
   * @throws If the note hash of the note doesn't exist in the tree.
   * @param note - The note to add.
   * @param scope - The scope to add the note under. Currently optional.
   */
  addNote(note: ExtendedNote, scope?: AztecAddress): Promise<void>;

  /**
   * Adds a nullified note to the database.
   * @throws If the note hash of the note doesn't exist in the tree.
   * @param note - The note to add.
   * @dev We are not deriving a nullifier in this function since that would require having the nullifier secret key
   * which is undesirable. Instead, we are just adding the note to the database as nullified and the nullifier is set
   * to 0 in the db.
   */
  addNullifiedNote(note: ExtendedNote): Promise<void>;

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
   * Simulate the execution of an unconstrained function on a deployed contract without actually modifying state.
   * This is useful to inspect contract state, for example fetching a variable value or calling a getter function.
   * The function takes function name and arguments as parameters, along with the contract address
   * and optionally the sender's address.
   *
   * @param functionName - The name of the function to be called in the contract.
   * @param args - The arguments to be provided to the function.
   * @param to - The address of the contract to be called.
   * @param from - (Optional) The msg sender to set for the call.
   * @param scopes - (Optional) The accounts whose notes we can access in this call. Currently optional and will default to all.
   * @returns The result of the view function call, structured based on the function ABI.
   */
  simulateUnconstrained(
    functionName: string,
    args: any[],
    to: AztecAddress,
    from?: AztecAddress,
    scopes?: AztecAddress[],
  ): Promise<AbiDecoded>;

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
   * L1 chain identifier, protocol version, and L1 address of the rollup contract.
   * @returns - The node information.
   */
  getNodeInfo(): Promise<NodeInfo>;

  /**
   * Returns information about this PXE.
   */
  getPXEInfo(): Promise<PXEInfo>;

  /**
   * Returns a Contract Instance given its address, which includes the contract class identifier,
   * initialization hash, deployment salt, and public keys hash.
   * TODO(@spalladino): Should we return the public keys in plain as well here?
   * @param address - Deployment address of the contract.
   */
  getContractInstance(address: AztecAddress): Promise<ContractInstanceWithAddress | undefined>;

  /**
   * Returns a Contract Class given its identifier.
   * TODO(@spalladino): The PXE actually holds artifacts and not classes, what should we return? Also,
   * should the pxe query the node for contract public info, and merge it with its own definitions?
   * @param id - Identifier of the class.
   */
  getContractClass(id: Fr): Promise<ContractClassWithId | undefined>;

  /**
   * Returns the contract artifact associated to a contract class.
   * @param id - Identifier of the class.
   */
  getContractArtifact(id: Fr): Promise<ContractArtifact | undefined>;

  /**
   * Queries the node to check whether the contract class with the given id has been publicly registered.
   * TODO(@spalladino): This method is strictly needed to decide whether to publicly register a class or not
   * during a public deployment. We probably want a nicer and more general API for this, but it'll have to
   * do for the time being.
   * @param id - Identifier of the class.
   */
  isContractClassPubliclyRegistered(id: Fr): Promise<boolean>;

  /**
   * Queries the node to check whether the contract instance with the given address has been publicly deployed,
   * regardless of whether this PXE knows about the contract or not.
   * TODO(@spalladino): Same notes as above.
   */
  isContractPubliclyDeployed(address: AztecAddress): Promise<boolean>;

  /**
   * Queries the node to check whether the contract instance with the given address has been initialized,
   * by checking the standard initialization nullifier.
   * @param address - Address of the contract to check.
   */
  isContractInitialized(address: AztecAddress): Promise<boolean>;

  /**
   * Returns the encrypted events given search parameters.
   * @param eventMetadata - Metadata of the event. This should be the class generated from the contract. e.g. Contract.events.Event
   * @param from - The block number to search from.
   * @param limit - The amount of blocks to search.
   * @param vpks - The incoming viewing public keys that can decrypt the log.
   * @returns - The deserialized events.
   */
  getEncryptedEvents<T>(
    eventMetadata: EventMetadataDefinition,
    from: number,
    limit: number,
    vpks: Point[],
  ): Promise<T[]>;

  /**
   * Returns the unencrypted events given search parameters.
   * @param eventMetadata - Metadata of the event. This should be the class generated from the contract. e.g. Contract.events.Event
   * @param from - The block number to search from.
   * @param limit - The amount of blocks to search.
   * @returns - The deserialized events.
   */
  getUnencryptedEvents<T>(eventMetadata: EventMetadataDefinition, from: number, limit: number): Promise<T[]>;
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

const PXEInfoSchema = z.object({
  pxeVersion: z.string(),
  protocolContractAddresses: ProtocolContractAddressesSchema,
}) satisfies ZodFor<PXEInfo>;

export const PXESchema: ApiSchemaFor<PXE> = {
  isL1ToL2MessageSynced: z.function().args(schemas.Fr).returns(z.boolean()),
  addAuthWitness: z.function().args(AuthWitness.schema).returns(z.void()),
  getAuthWitness: z
    .function()
    .args(schemas.Fr)
    .returns(z.union([z.undefined(), z.array(schemas.Fr)])),
  addCapsule: z.function().args(z.array(schemas.Fr)).returns(z.void()),
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
  getContracts: z.function().returns(z.array(schemas.AztecAddress)),
  proveTx: z.function().args(TxExecutionRequest.schema, PrivateExecutionResult.schema).returns(TxProvingResult.schema),
  simulateTx: z
    .function()
    .args(
      TxExecutionRequest.schema,
      z.boolean(),
      optional(schemas.AztecAddress),
      optional(z.boolean()),
      optional(z.boolean()),
      optional(z.boolean()),
      optional(z.array(schemas.AztecAddress)),
    )
    .returns(TxSimulationResult.schema),
  sendTx: z.function().args(Tx.schema).returns(TxHash.schema),
  getTxReceipt: z.function().args(TxHash.schema).returns(TxReceipt.schema),
  getTxEffect: z
    .function()
    .args(TxHash.schema)
    .returns(z.union([inBlockSchemaFor(TxEffect.schema), z.undefined()])),
  getPublicStorageAt: z.function().args(schemas.AztecAddress, schemas.Fr).returns(schemas.Fr),
  getNotes: z.function().args(NotesFilterSchema).returns(z.array(UniqueNote.schema)),
  getL1ToL2MembershipWitness: z
    .function()
    .args(schemas.AztecAddress, schemas.Fr, schemas.Fr)
    .returns(z.tuple([schemas.BigInt, SiblingPath.schemaFor(L1_TO_L2_MSG_TREE_HEIGHT)])),
  addNote: z.function().args(ExtendedNote.schema, optional(schemas.AztecAddress)).returns(z.void()),
  addNullifiedNote: z.function().args(ExtendedNote.schema).returns(z.void()),
  getBlock: z
    .function()
    .args(z.number())
    .returns(z.union([L2Block.schema, z.undefined()])),
  getCurrentBaseFees: z.function().returns(GasFees.schema),

  simulateUnconstrained: z
    .function()
    .args(
      z.string(),
      z.array(z.any()),
      schemas.AztecAddress,
      optional(schemas.AztecAddress),
      optional(z.array(schemas.AztecAddress)),
    )
    .returns(AbiDecodedSchema),
  getPublicLogs: z.function().args(LogFilterSchema).returns(GetPublicLogsResponseSchema),
  getContractClassLogs: z.function().args(LogFilterSchema).returns(GetContractClassLogsResponseSchema),
  getBlockNumber: z.function().returns(z.number()),
  getProvenBlockNumber: z.function().returns(z.number()),
  getNodeInfo: z.function().returns(NodeInfoSchema),
  getPXEInfo: z.function().returns(PXEInfoSchema),
  getContractInstance: z
    .function()
    .args(schemas.AztecAddress)
    .returns(z.union([ContractInstanceWithAddressSchema, z.undefined()])),
  getContractClass: z
    .function()
    .args(schemas.Fr)
    .returns(z.union([ContractClassWithIdSchema, z.undefined()])),
  getContractArtifact: z
    .function()
    .args(schemas.Fr)
    .returns(z.union([ContractArtifactSchema, z.undefined()])),
  isContractClassPubliclyRegistered: z.function().args(schemas.Fr).returns(z.boolean()),
  isContractPubliclyDeployed: z.function().args(schemas.AztecAddress).returns(z.boolean()),
  isContractInitialized: z.function().args(schemas.AztecAddress).returns(z.boolean()),
  getEncryptedEvents: z
    .function()
    .args(EventMetadataDefinitionSchema, z.number(), z.number(), z.array(schemas.Point))
    .returns(z.array(AbiDecodedSchema)),
  getUnencryptedEvents: z
    .function()
    .args(EventMetadataDefinitionSchema, z.number(), z.number())
    .returns(z.array(AbiDecodedSchema)),
};
