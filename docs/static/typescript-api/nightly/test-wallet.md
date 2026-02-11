# @aztec/test-wallet

Version: v4.0.0-nightly.20260211

## Quick Import Reference

```typescript
import {
  AztecNodeProxy,
  ProvenTx,
  TestWallet,
  deployFundedSchnorrAccounts,
  proveInteraction,
  // ... and more
} from '@aztec/test-wallet';
```

## Classes

### AztecNodeProxy

Mutable wrapper around an AztecNode that forwards all calls to the current target. Allows swapping the underlying node at runtime via updateTargetNode, which is useful for tests that need to redirect a wallet from one node to another without recreating it.

Extends: `AztecNode`

**Constructor**
```typescript
new AztecNodeProxy(target: AztecNode)
```

**Methods**
- `findLeavesIndexes(referenceBlock: BlockHash | BlockNumber | "latest", treeId: MerkleTreeId, leafValues: Fr[]) => Promise<DataInBlock<bigint> | undefined[]>` - Find the indexes of the given leaves in the given tree along with a block metadata pointing to the block in which the leaves were inserted.
- `getAllowedPublicSetup() => Promise<AllowedElement[]>` - Returns the list of allowed public setup elements configured for this node.
- `getBlock(blockParameter: BlockHash | BlockNumber | "latest") => Promise<L2Block | undefined>` - Get a block specified by its block number or 'latest'.
- `getBlockByArchive(archive: Fr) => Promise<L2Block | undefined>` - Get a block specified by its archive root.
- `getBlockByHash(blockHash: BlockHash) => Promise<L2Block | undefined>` - Get a block specified by its hash.
- `getBlockHashMembershipWitness(referenceBlock: BlockHash | BlockNumber | "latest", blockHash: BlockHash) => Promise<MembershipWitness<30> | undefined>` - Returns a membership witness for a given block hash in the archive tree. Block hashes are the leaves of the archive tree. Each time a new block is added to the chain, its block hash is appended as a new leaf to the archive tree. This method finds the membership witness (leaf index and sibling path) for a given block hash, which can be used to prove that a specific block exists in the chain's history.
- `getBlockHeader(block?: BlockHash | BlockNumber | "latest") => Promise<BlockHeader | undefined>` - Returns the block header for a given block number, block hash, or 'latest'.
- `getBlockHeaderByArchive(archive: Fr) => Promise<BlockHeader | undefined>` - Get a block header specified by its archive root.
- `getBlockNumber() => Promise<BlockNumber>` - Method to fetch the latest block number synchronized by the node.
- `getBlocks(from: BlockNumber, limit: number) => Promise<L2Block[]>` - Method to request blocks. Will attempt to return all requested blocks but will return only those available.
- `getChainId() => Promise<number>` - Method to fetch the chain id of the base-layer for the rollup.
- `getCheckpointedBlockNumber() => Promise<BlockNumber>` - Fetches the latest checkpointed block number.
- `getCheckpointedBlocks(from: BlockNumber, limit: number) => Promise<CheckpointedL2Block[]>`
- `getCheckpoints(checkpointNumber: CheckpointNumber, limit: number) => Promise<PublishedCheckpoint[]>` - Retrieves a collection of checkpoints.
- `getContract(address: AztecAddress) => Promise<ContractInstanceWithAddress | undefined>` - Returns a publicly deployed contract instance given its address.
- `getContractClass(id: Fr) => Promise<ContractClassPublic | undefined>` - Returns a registered contract class given its id.
- `getContractClassLogs(filter: LogFilter) => Promise<GetContractClassLogsResponse>` - Gets contract class logs based on the provided filter.
- `getCurrentMinFees() => Promise<GasFees>` - Method to fetch the current min fees.
- `getEncodedEnr() => Promise<string | undefined>` - Returns the ENR of this node for peer discovery, if available.
- `getL1ContractAddresses() => Promise<L1ContractAddresses>` - Method to fetch the currently deployed l1 contract addresses.
- `getL1ToL2MessageBlock(l1ToL2Message: Fr) => Promise<BlockNumber | undefined>` - Returns the L2 block number in which this L1 to L2 message becomes available, or undefined if not found.
- `getL1ToL2MessageMembershipWitness(referenceBlock: BlockHash | BlockNumber | "latest", l1ToL2Message: Fr) => Promise<[] | undefined>` - Returns the index and a sibling path for a leaf in the committed l1 to l2 data tree.
- `getL2Tips() => Promise<L2Tips>` - Returns the tips of the L2 chain.
- `getL2ToL1Messages(epoch: EpochNumber) => Promise<Fr[][][][]>` - Returns all the L2 to L1 messages in an epoch.
- `getLowNullifierMembershipWitness(referenceBlock: BlockHash | BlockNumber | "latest", nullifier: Fr) => Promise<NullifierMembershipWitness | undefined>` - Returns a low nullifier membership witness for a given nullifier at a given block.
- `getMaxPriorityFees() => Promise<GasFees>` - Method to fetch the current max priority fee of txs in the mempool.
- `getNodeInfo() => Promise<NodeInfo>` - Returns the information about the server's node. Includes current Node version, compatible Noir version, L1 chain identifier, protocol version, and L1 address of the rollup contract.
- `getNodeVersion() => Promise<string>` - Method to fetch the version of the package.
- `getNoteHashMembershipWitness(referenceBlock: BlockHash | BlockNumber | "latest", noteHash: Fr) => Promise<MembershipWitness<42> | undefined>` - Returns a membership witness for a given note hash at a given block.
- `getNullifierMembershipWitness(referenceBlock: BlockHash | BlockNumber | "latest", nullifier: Fr) => Promise<NullifierMembershipWitness | undefined>` - Returns a nullifier membership witness for a given nullifier at a given block.
- `getPendingTxCount() => Promise<number>` - Retrieves the number of pending txs
- `getPendingTxs(limit?: number, after?: TxHash) => Promise<Tx[]>` - Method to retrieve pending txs.
- `getPrivateLogsByTags(tags: SiloedTag[], page?: number, referenceBlock?: BlockHash) => Promise<TxScopedL2Log[][]>` - Gets private logs that match any of the `tags`. For each tag, an array of matching logs is returned. An empty array implies no logs match that tag.
- `getProtocolContractAddresses() => Promise<ProtocolContractAddresses>` - Method to fetch the protocol contract addresses.
- `getProvenBlockNumber() => Promise<BlockNumber>` - Fetches the latest proven block number.
- `getPublicDataWitness(referenceBlock: BlockHash | BlockNumber | "latest", leafSlot: Fr) => Promise<PublicDataWitness | undefined>` - Returns a public data tree witness for a given leaf slot at a given block.
- `getPublicLogs(filter: LogFilter) => Promise<GetPublicLogsResponse>` - Gets public logs based on the provided filter.
- `getPublicLogsByTagsFromContract(contractAddress: AztecAddress, tags: Tag[], page?: number, referenceBlock?: BlockHash) => Promise<TxScopedL2Log[][]>` - Gets public logs that match any of the `tags` from the specified contract. For each tag, an array of matching logs is returned. An empty array implies no logs match that tag.
- `getPublicStorageAt(referenceBlock: BlockHash | BlockNumber | "latest", contract: AztecAddress, slot: Fr) => Promise<Fr>` - Gets the storage value at the given contract storage slot.
- `getTxByHash(txHash: TxHash) => Promise<Tx | undefined>` - Method to retrieve a single pending tx.
- `getTxEffect(txHash: TxHash) => Promise<IndexedTxEffect | undefined>` - Gets a tx effect.
- `getTxReceipt(txHash: TxHash) => Promise<TxReceipt>` - Fetches a transaction receipt for a given transaction hash. Returns a mined receipt if it was added to the chain, a pending receipt if it's still in the mempool of the connected Aztec node, or a dropped receipt if not found in the connected Aztec node.
- `getTxsByHash(txHashes: TxHash[]) => Promise<Tx[]>` - Method to retrieve multiple pending txs.
- `getValidatorsStats() => Promise<ValidatorsStats>` - Returns stats for validators if enabled.
- `getValidatorStats(validatorAddress: EthAddress, fromSlot?: SlotNumber, toSlot?: SlotNumber) => Promise<SingleValidatorStats | undefined>` - Returns stats for a single validator if enabled.
- `getVersion() => Promise<number>` - Method to fetch the version of the rollup the node is connected to.
- `getWorldStateSyncStatus() => Promise<WorldStateSyncStatus>` - Returns the sync status of the node's world state
- `isL1ToL2MessageSynced(l1ToL2Message: Fr) => Promise<boolean>` - Returns whether an L1 to L2 message is synced by archiver.
- `isReady() => Promise<boolean>` - Method to determine if the node is ready to accept transactions.
- `isValidTx(tx: Tx, options?: { isSimulation?: boolean; skipFeeEnforcement?: boolean }) => Promise<TxValidationResult>` - Returns true if the transaction is valid for inclusion at the current state. Valid transactions can be made invalid by *other* transactions if e.g. they emit the same nullifiers, or come become invalid due to e.g. the include_by_timestamp property.
- `registerContractFunctionSignatures(functionSignatures: string[]) => Promise<void>` - Registers contract function signatures for debugging purposes.
- `sendTx(tx: Tx) => Promise<void>` - Method to submit a transaction to the p2p pool.
- `simulatePublicCalls(tx: Tx, skipFeeEnforcement?: boolean) => Promise<PublicSimulationOutput>` - Simulates the public part of a transaction with the current state. This currently just checks that the transaction execution succeeds.
- `updateTargetNode(node: AztecNode) => void` - Updates the underlying node that this reference points to.

### ProvenTx

A proven transaction that can be sent to the network. Returned by the `prove` method of the test wallet

Extends: `Tx`

**Constructor**
```typescript
new ProvenTx(node: AztecNode, tx: Tx, offchainEffects: OffchainEffect[], stats?: ProvingStats)
```

**Properties**
- `readonly chonkProof: ChonkProof` - Proof from the private kernel circuit.
- `readonly contractClassLogFields: ContractClassLogFields[]` - Contract class log fields emitted from the tx. Their order should match the order of the log hashes returned from `this.data.getNonEmptyContractClassLogsHashes`. This claimed data is reconciled against a hash of this data (that is contained within the tx's public inputs (`this.data`)), in data_validator.ts.
- `readonly data: PrivateKernelTailCircuitPublicInputs` - Output of the private kernel circuit for this tx.
- `offchainEffects: OffchainEffect[]` - The offchain effects emitted during the execution of the transaction.
- `static p2pTopic: TopicType` - The p2p topic identifier, this determines how the message is handled
- `readonly publicFunctionCalldata: HashedValues[]` - An array of calldata for the enqueued public function calls and the teardown function call. This claimed data is reconciled against hashes of this data (that are contained within the tx's public inputs (`this.data`)), in data_validator.ts.
- `static schema: unknown`
- `stats?: ProvingStats`
- `readonly txHash: TxHash` - Identifier of the tx. It's a hash of the public inputs of the tx's proof. This claimed hash is reconciled against the tx's public inputs (`this.data`) in data_validator.ts.

**Methods**
- `static clone(tx: Tx, cloneProof?: boolean) => Tx` - Clones a tx, making a deep copy of all fields.
- `static computeTxHash(fields: Pick<FieldsOf<Tx>, "data">) => Promise<TxHash>`
- `static create(fields: Omit<FieldsOf<Tx>, "txHash">) => Promise<Tx>`
- `static from(fields: FieldsOf<Tx>) => Tx`
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => Tx` - Deserializes the Tx object from a Buffer.
- `generateP2PMessageIdentifier() => Promise<Buffer32>`
- `getCalldataMap() => Map<string, Fr[]>`
- `getContractClassLogs() => ContractClassLog[]`
- `getEstimatedPrivateTxEffectsSize() => number` - Estimates the tx size based on its private effects. Note that the actual size of the tx after processing will probably be larger, as public execution would generate more data.
- `getGasSettings() => GasSettings`
- `getNonRevertiblePublicCallRequestsWithCalldata() => PublicCallRequestWithCalldata[]`
- `getPublicCallRequestsWithCalldata() => PublicCallRequestWithCalldata[]`
- `getPublicLogs(logsSource: L2LogsSource) => Promise<GetPublicLogsResponse>` - Gets public logs emitted by this tx.
- `getRevertiblePublicCallRequestsWithCalldata() => PublicCallRequestWithCalldata[]`
- `getSize() => number` - Get the size of the gossipable object. This is used for metrics recording.
- `getSplitContractClassLogs(revertible: boolean) => ContractClassLog[]` - Gets either revertible or non revertible contract class logs emitted by this tx.
- `getStats() => TxStats` - Returns stats about this tx.
- `getTeardownPublicCallRequestWithCalldata() => PublicCallRequestWithCalldata | undefined`
- `getTotalPublicCalldataCount() => number`
- `getTxHash() => TxHash` - Return transaction hash.
- `hasPublicCalls() => boolean`
- `numberOfPublicCalls() => number`
- `p2pMessageLoggingIdentifier() => Promise<Buffer32>` - A digest of the message information **used for logging only**. The identifier used for deduplication is `getMsgIdFn` as defined in `encoding.ts` which is a hash over topic and data.
- `static random(args?: { randomProof?: boolean; txHash?: string | TxHash }) => Tx` - Creates a random tx.
- `recomputeHash() => Promise<TxHash>` - Recomputes the tx hash. Used for testing purposes only when a property of the tx was mutated.
- `send(options?: Omit<ProvenTxSendOpts, "wait">) => Promise<TxReceipt>` - Sends the transaction to the network.
- `toBuffer() => Buffer<ArrayBufferLike>` - Serializes the Tx object into a Buffer.
- `toMessage() => Buffer`
- `validateTxHash() => Promise<boolean>` - Validates that the tx hash matches the computed hash from the tx data. This should be called when deserializing a tx from an untrusted source.

### TestWallet

A TestWallet implementation to be used in server settings (e.g. e2e tests). Note that the only difference from `lazy` and `bundle` test wallets is that it uses the `createPXE` function from the `pxe/server` package.

Extends: `BaseTestWallet`

**Constructor**
```typescript
new TestWallet(pxe: PXE, nodeRef: AztecNodeProxy)
```

**Properties**
- `accounts: Map<string, Account>`
- `readonly aztecNode: AztecNode`
- `cancellableTransactions: boolean`
- `log: Logger`
- `minFeePadding: number`
- `readonly pxe: PXE`

**Methods**
- `batch<T extends readonly BatchedMethod[]>(methods: T) => Promise<BatchResults<T>>`
- `completeFeeOptions(from: AztecAddress, feePayer?: AztecAddress, gasSettings?: Partial<FieldsOf<GasSettings>>) => Promise<FeeOptions>` - Completes partial user-provided fee options with wallet defaults.
- `completeFeeOptionsForEstimation(from: AztecAddress, feePayer?: AztecAddress, gasSettings?: Partial<FieldsOf<GasSettings>>) => Promise<{ accountFeePaymentMethodOptions: AccountFeePaymentMethodOptions; gasSettings: GasSettings; walletFeePaymentMethod?: FeePaymentMethod }>` - Completes partial user-provided fee options with unreasonably high gas limits for gas estimation. Uses the same logic as completeFeeOptions but sets high limits to avoid running out of gas during estimation.
- `contextualizeError(err: Error, ...context: string[]) => Error`
- `static create(node: AztecNode, overridePXEConfig?: Partial<PXEConfig>, options: PXECreationOptions) => Promise<TestWallet>`
- `createAccount(accountData?: AccountData) => Promise<AccountManager>` - Creates a new account with the provided account data or generates random values and uses SchnorrAccountContract if not provided.
- `createAuthWit(from: AztecAddress, intent: IntentInnerHash | CallIntent | ContractFunctionInteractionCallIntent) => Promise<AuthWitness>` - Creates and returns an authwit according the the rules of the provided account. This authwit can be verified by the account contract
- `createECDSAKAccount(secret: Fr, salt: Fr, signingKey: Buffer) => Promise<AccountManager>`
- `createECDSARAccount(secret: Fr, salt: Fr, signingKey: Buffer) => Promise<AccountManager>`
- `createSchnorrAccount(secret: Fr, salt: Fr, signingKey?: Fq) => Promise<AccountManager>`
- `createTxExecutionRequestFromPayloadAndFee(executionPayload: ExecutionPayload, from: AztecAddress, feeOptions: FeeOptions) => Promise<TxExecutionRequest>`
- `disableSimulatedSimulations() => void` - Disable the "simulated simulation" path for simulateTx.
- `enableSimulatedSimulations() => void` - Enable the "simulated simulation" path for simulateTx.
- `getAccountFromAddress(address: AztecAddress) => Promise<Account>`
- `getAccounts() => Promise<{ alias: string; item: AztecAddress }[]>`
- `getAddressBook() => Promise<Aliased<AztecAddress>[]>` - Returns the list of aliased contacts associated with the wallet. This base implementation directly returns PXE's senders, but note that in general contacts are a superset of senders. - Senders: Addresses we check during synching in case they sent us notes, - Contacts: more general concept akin to a phone's contact list.
- `getChainInfo() => Promise<ChainInfo>`
- `getContractClassMetadata(id: Fr) => Promise<{ isArtifactRegistered: boolean; isContractClassPubliclyRegistered: boolean }>`
- `getContractMetadata(address: AztecAddress) => Promise<{ instance: ContractInstanceWithAddress | undefined; isContractInitialized: boolean; ... }>`
- `getFakeAccountDataFor(address: AztecAddress) => Promise<{ account: BaseAccount; artifact: ContractArtifact; instance: ContractInstanceWithAddress }>` - Creates a stub account that impersonates the given address, allowing kernelless simulations to bypass the account's authorization mechanisms via contract overrides.
- `getNotes(filter: NotesFilter) => Promise<NoteDao[]>` - A debugging utility to get notes based on the provided filter. Note that this should not be used in production code because the structure of notes is considered to be an implementation detail of contracts. This is only meant to be used for debugging purposes. If you need to obtain note-related information in production code, please implement a custom utility function on your contract and call that function instead (e.g. `get_balance(owner: AztecAddress) -> u128` utility function on a Token contract).
- `getPrivateEvents<T>(eventDef: EventMetadataDefinition, eventFilter: PrivateEventFilter) => Promise<PrivateEvent<T>[]>`
- `getSyncedBlockHeader() => Promise<BlockHeader>` - Returns the block header up to which the wallet has synced.
- `getTxReceipt(txHash: TxHash) => Promise<TxReceipt>` - Retrieves the transaction receipt for a given transaction hash. This is a passthrough to the underlying node, provided for convenience in testing.
- `lookupValidity(onBehalfOf: AztecAddress, intent: IntentInnerHash | CallIntent | ContractFunctionInteractionCallIntent, witness: AuthWitness) => Promise<{ isValidInPrivate: boolean; isValidInPublic: boolean }>` - Lookup the validity of an authwit in private and public contexts. Uses the chain id and version of the wallet.
- `profileTx(executionPayload: ExecutionPayload, opts: ProfileOptions) => Promise<TxProfileResult>`
- `proveTx(exec: ExecutionPayload, opts: Omit<SendOptions, "wait">) => Promise<ProvenTx>` - A utility to prove a transaction using this wallet and return it to be sent by a different entity on their own accord Note that this should not be used in production code since a proven transaction could be sent to a malicious node to index and track. It also makes it very difficult for the wallet to keep track of the interaction.
- `registerContract(instance: ContractInstanceWithAddress, artifact?: ContractArtifact, secretKey?: Fr) => Promise<ContractInstanceWithAddress>`
- `registerSender(address: AztecAddress, _alias?: string) => Promise<AztecAddress>`
- `requestCapabilities(_manifest: AppCapabilities) => Promise<WalletCapabilities>` - Request capabilities from the wallet. This method is wallet-implementation-dependent and must be provided by classes extending BaseWallet. Embedded wallets typically don't support capability-based authorization (no user authorization flow), while external wallets (browser extensions, hardware wallets) implement this to reduce authorization friction by allowing apps to request permissions upfront. Consider making it abstract so implementing it is a conscious decision. Leaving it as-is while the feature stabilizes.
- `sendTx<W extends InteractionWaitOptions>(executionPayload: ExecutionPayload, opts: SendOptions<W>) => Promise<SendReturn<W>>`
- `setMinFeePadding(value?: number) => void`
- `setPublicAuthWit(from: AztecAddress, messageHashOrIntent: Fr | IntentInnerHash | CallIntent | ContractFunctionInteractionCallIntent, authorized: boolean) => Promise<SetPublicAuthwitContractInteraction>` - Returns an interaction that can be used to set the authorization status of an intent
- `simulateTx(executionPayload: ExecutionPayload, opts: SimulateOptions) => Promise<TxSimulationResult>` - Simulates a transaction, optimizing leading public static calls by running them directly on the node while sending the remaining calls through the standard PXE path. Return values from both paths are merged back in original call order.
- `simulateUtility(call: FunctionCall, authwits?: AuthWitness[]) => Promise<UtilitySimulationResult>`
- `simulateViaEntrypoint(executionPayload: ExecutionPayload, from: AztecAddress, feeOptions: FeeOptions, skipTxValidation?: boolean, skipFeeEnforcement?: boolean) => Promise<TxSimulationResult>` - Simulates calls through the standard PXE path (account entrypoint).
- `stop() => Promise<void>` - Stops the internal job queue. This function is typically used when tearing down tests.
- `sync() => Promise<void>` - Triggers a sync of the wallet with the node to update the latest block header. Blocks until the sync is complete.
- `updateNode(node: AztecNode) => void` - Updates the underlying node that this wallet and its PXE communicate with.

## Interfaces

### AccountData

Data for generating an account.

**Properties**
- `contract: AccountContract` - Contract that backs the account.
- `salt: Fr` - Contract address salt.
- `secret: Fr` - Secret to derive the keys for the account.

## Functions

### deployFundedSchnorrAccounts
```typescript
function deployFundedSchnorrAccounts(wallet: BaseTestWallet, accountsData: InitialAccountData[], waitOptions?: WaitOpts) => Promise<AccountManager[]>
```
Deploys the SchnorrAccount contracts backed by prefunded addresses at genesis. This can be directly used to pay for transactions in FeeJuice.

### proveInteraction
```typescript
function proveInteraction(wallet: BaseTestWallet, interaction: ContractFunctionInteraction | DeployMethod<ContractBase>, options: SendInteractionOptions | DeployOptions) => Promise<ProvenTx>
```
Helper function to prove an interaction via a TestWallet

### registerInitialLocalNetworkAccountsInWallet
```typescript
function registerInitialLocalNetworkAccountsInWallet(wallet: BaseTestWallet) => Promise<AztecAddress[]>
```
Registers the initial local network accounts in the wallet.

## Cross-Package References

This package references types from other Aztec packages:

**@aztec/accounts**
- `InitialAccountData`

**@aztec/aztec.js**
- `Account`, `AccountContract`, `AccountManager`, `Aliased`, `AppCapabilities`, `BaseAccount`, `BatchResults`, `BatchedMethod`, `CallIntent`, `ContractBase`, `ContractFunctionInteraction`, `ContractFunctionInteractionCallIntent`, `DeployMethod`, `DeployOptions`, `FeePaymentMethod`, `IntentInnerHash`, `InteractionWaitOptions`, `PrivateEvent`, `PrivateEventFilter`, `ProfileOptions`, `SendInteractionOptions`, `SendOptions`, `SendReturn`, `SetPublicAuthwitContractInteraction`, `SimulateOptions`, `WaitOpts`, `WalletCapabilities`

**@aztec/entrypoints**
- `AccountFeePaymentMethodOptions`, `ChainInfo`

**@aztec/ethereum**
- `L1ContractAddresses`

**@aztec/foundation**
- `BlockNumber`, `Buffer32`, `BufferReader`, `CheckpointNumber`, `EpochNumber`, `EthAddress`, `FieldsOf`, `Fq`, `Fr`, `Logger`, `MembershipWitness`, `SlotNumber`

**@aztec/pxe**
- `PXE`, `PXEConfig`, `PXECreationOptions`

**@aztec/stdlib**
- `AllowedElement`, `AuthWitness`, `AztecAddress`, `AztecNode`, `BlockHash`, `BlockHeader`, `CheckpointedL2Block`, `ChonkProof`, `ContractArtifact`, `ContractClassLog`, `ContractClassLogFields`, `ContractClassPublic`, `ContractInstanceWithAddress`, `DataInBlock`, `EventMetadataDefinition`, `ExecutionPayload`, `FunctionCall`, `GasFees`, `GasSettings`, `GetContractClassLogsResponse`, `GetPublicLogsResponse`, `HashedValues`, `IndexedTxEffect`, `L2Block`, `L2LogsSource`, `L2Tips`, `LogFilter`, `MerkleTreeId`, `NodeInfo`, `NoteDao`, `NotesFilter`, `NullifierMembershipWitness`, `OffchainEffect`, `PrivateKernelTailCircuitPublicInputs`, `ProtocolContractAddresses`, `ProvingStats`, `PublicCallRequestWithCalldata`, `PublicDataWitness`, `PublicSimulationOutput`, `PublishedCheckpoint`, `SiloedTag`, `SingleValidatorStats`, `Tag`, `TopicType`, `Tx`, `TxExecutionRequest`, `TxHash`, `TxProfileResult`, `TxReceipt`, `TxScopedL2Log`, `TxSimulationResult`, `TxStats`, `TxValidationResult`, `UtilitySimulationResult`, `ValidatorsStats`, `WorldStateSyncStatus`

**@aztec/wallet-sdk**
- `FeeOptions`, `T`, `W`
