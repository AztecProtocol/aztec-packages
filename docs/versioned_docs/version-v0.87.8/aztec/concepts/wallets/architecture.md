---
title: Wallet Architecture
tags: [protocol, accounts]
---

This page talks about the architecture of a wallet in Aztec. Wallets expose to dapps an interface that allows them to act on behalf of the user, such as querying private state or sending transactions. Bear in mind that, as in Ethereum, wallets should require user confirmation whenever carrying out a potentially sensitive action requested by a dapp.

## Overview

Architecture-wise, a wallet is an instance of an **Private Execution Environment (PXE)** which manages user keys and private state.
The PXE also communicates with an **Aztec Node** for retrieving public information or broadcasting transactions.
Note that the PXE requires a local database for keeping private state, and is also expected to be continuously syncing new blocks for trial-decryption of user notes.

Additionally, a wallet must be able to handle one or more account contract implementation. When a user creates a new account, the account is represented on-chain by an account contract. The wallet is responsible for deploying and interacting with this contract. A wallet may support multiple flavours of accounts, such as an account that uses ECDSA signatures, or one that relies on WebAuthn, or one that requires multi-factor authentication. For a user, the choice of what account implementation to use is then determined by the wallet they interact with.

In code, this translates to a wallet implementing an **AccountInterface** interface that defines [how to create an _execution request_ out of an array of _function calls_](./index.md#transaction-lifecycle) for the specific implementation of an account contract and [how to generate an _auth witness_](./index.md#authorizing-actions) for authorizing actions on behalf of the user. Think of this interface as the Javascript counterpart of an account contract, or the piece of code that knows how to format a transaction and authenticate an action based on the rules defined by the user's account contract implementation.

## Account interface

The account interface is used for creating an _execution request_ out of one or more _function calls_ requested by a dapp, as well as creating an _auth witness_ for a given message hash. Account contracts are expected to handle multiple function calls per transaction, since dapps may choose to batch multiple actions into a single request to the wallet.

```typescript title="account-interface" showLineNumbers 

/**
 * Handler for interfacing with an account. Knows how to create transaction execution
 * requests and authorize actions for its corresponding account.
 */
export interface AccountInterface extends EntrypointInterface, AuthWitnessProvider {
  /** Returns the complete address for this account. */
  getCompleteAddress(): CompleteAddress;

  /** Returns the address for this account. */
  getAddress(): AztecAddress;

  /** Returns the chain id for this account */
  getChainId(): Fr;

  /** Returns the rollup version for this account */
  getVersion(): Fr;
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v0.87.8/yarn-project/aztec.js/src/account/interface.ts#L6-L25" target="_blank" rel="noopener noreferrer">Source code: yarn-project/aztec.js/src/account/interface.ts#L6-L25</a></sub></sup>


## PXE interface

A wallet exposes the PXE interface to dapps by running a PXE instance. The PXE requires a keystore and a database implementation for storing keys, private state, and recipient encryption public keys.

```typescript title="pxe-interface" showLineNumbers 
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
   * @param scopes - (Optional) The accounts whose notes we can access in this call. Currently optional and will default to all.
   * @returns A simulated transaction result object that includes public and private return values.
   * @throws If the code for the functions executed in this transaction have not been made available via `addContracts`.
   * Also throws if simulatePublic is true and public simulation reverts.
   */
  simulateTx(
    txRequest: TxExecutionRequest,
    simulatePublic: boolean,
    msgSender?: AztecAddress,
    skipTxValidation?: boolean,
    skipFeeEnforcement?: boolean,
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
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v0.87.8/yarn-project/stdlib/src/interfaces/pxe.ts#L49-L388" target="_blank" rel="noopener noreferrer">Source code: yarn-project/stdlib/src/interfaces/pxe.ts#L49-L388</a></sub></sup>

