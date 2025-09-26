import type { Fr } from '@aztec/foundation/fields';

import { z } from 'zod';

import { type AbiType, AbiTypeSchema, type ContractArtifact } from '../abi/abi.js';
import type { EventSelector } from '../abi/event_selector.js';
import { AuthWitness } from '../auth_witness/auth_witness.js';
import type { AztecAddress } from '../aztec-address/index.js';
import {
  CompleteAddress,
  type ContractClassWithId,
  type ContractInstanceWithAddress,
  type PartialAddress,
} from '../contract/index.js';
import { UniqueNote } from '../note/extended_note.js';
import type { NotesFilter } from '../note/notes_filter.js';
import { schemas } from '../schemas/schemas.js';
import { SimulationOverrides, TxExecutionRequest, TxSimulationResult } from '../tx/index.js';
import { TxProfileResult, UtilitySimulationResult } from '../tx/profiling.js';
import { TxProvingResult } from '../tx/proven_tx.js';

// docs:start:pxe-interface
/**
 * Private eXecution Environment (PXE) runs locally for each user, providing functionality for all the operations
 * needed to interact with the Aztec network, including account management, private data management,
 * transaction local simulation, and access to an Aztec node. This interface, as part of a Wallet,
 * is exposed to dapps for interacting with the network on behalf of the user.
 */
export interface PXE {
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
   * @throws If the artifact's contract class is not found in the PXE or if the contract class is different from
   * the current one (current one from the point of view of the node to which the PXE is connected).
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
   * @returns A result containing the proof and public inputs of the tail circuit.
   * @throws If contract code not found, or public simulation reverts.
   * Also throws if simulatePublic is true and public simulation reverts.
   */
  proveTx(txRequest: TxExecutionRequest): Promise<TxProvingResult>;

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
   * @param skipTxValidation - (Optional) If false, this function throws if the transaction is unable to be included in a block at the current state.
   * @param skipFeeEnforcement - (Optional) If false, fees are enforced.
   * @param overrides - (Optional) State overrides for the simulation, such as msgSender, contract instances and artifacts.
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
   * Gets notes registered in this PXE based on the provided filter.
   * @param filter - The filter to apply to the notes.
   * @returns The requested notes.
   */
  getNotes(filter: NotesFilter): Promise<UniqueNote[]>;

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
   * Stops the PXE's job queue.
   */
  stop(): Promise<void>;
}
// docs:end:pxe-interface

export type EventMetadataDefinition = {
  eventSelector: EventSelector;
  abiType: AbiType;
  fieldNames: string[];
};

export const EventMetadataDefinitionSchema = z.object({
  eventSelector: schemas.EventSelector,
  abiType: AbiTypeSchema,
  fieldNames: z.array(z.string()),
});

/** This is used in getting events via the filter */
export enum EventType {
  Encrypted = 'Encrypted',
  Unencrypted = 'Unencrypted',
}

export interface ContractMetadata {
  contractInstance?: ContractInstanceWithAddress | undefined;
  isContractInitialized: boolean;
  isContractPublished: boolean;
}

export interface ContractClassMetadata {
  contractClass?: ContractClassWithId | undefined;
  isContractClassPubliclyRegistered: boolean;
  artifact?: ContractArtifact | undefined;
}
