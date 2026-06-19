# @aztec/pxe

Version: v5.0.0-rc.1

## Quick Import Reference

```typescript
import {
  AddressStore,
  AnchorBlockStore,
  CapsuleService,
  CapsuleStore,
  ContractStore,
  // ... and more
} from '@aztec/pxe';
```

## Classes

### AddressStore

**Constructor**
```typescript
new AddressStore(store: AztecAsyncKVStore)
```

**Methods**
- `addCompleteAddress(completeAddress: CompleteAddress) => Promise<boolean>`
- `getCompleteAddress(account: AztecAddress) => Promise<any>`
- `getCompleteAddresses() => Promise<CompleteAddress[]>`

### AnchorBlockStore

Holds the block header that PXE's private execution is anchored to. Updated by the BlockSynchronizer as the chain advances or reorgs.

**Constructor**
```typescript
new AnchorBlockStore(store: AztecAsyncKVStore)
```

**Methods**
- `getBlockHeader() => Promise<BlockHeader>`
- `setHeader(header: BlockHeader) => Promise<void>` - Sets the currently synchronized block header. Important: only called from BlockSynchronizer, and since it must run atomically with other stores in a reorg, it MUST NOT be wrapped in `transactionAsync`: doing so deadlocks when the kv-store backend is IndexedDB (no support for reentrancy).

### CapsuleService

Wraps a CapsuleStore with scope-based access control. Each operation asserts that the requested scope is in the allowed scopes list before delegating to the underlying store.

**Constructor**
```typescript
new CapsuleService(capsuleStore: CapsuleStore, allowedScopes: AztecAddress[])
```

**Methods**
- `appendToCapsuleArray(contractAddress: AztecAddress, baseSlot: Fr, content: Fr[][], jobId: string, scope: AztecAddress) => Promise<void>`
- `copyCapsule(contractAddress: AztecAddress, srcSlot: Fr, dstSlot: Fr, numEntries: number, jobId: string, scope: AztecAddress) => Promise<void>`
- `deleteCapsule(contractAddress: AztecAddress, slot: Fr, jobId: string, scope: AztecAddress) => void`
- `getCapsule(contractAddress: AztecAddress, slot: Fr, jobId: string, scope: AztecAddress, transientCapsules?: Capsule[]) => Promise<Fr[] | null>`
- `readCapsuleArray(contractAddress: AztecAddress, baseSlot: Fr, jobId: string, scope: AztecAddress) => Promise<Fr[][]>`
- `setCapsule(contractAddress: AztecAddress, slot: Fr, capsule: Fr[], jobId: string, scope: AztecAddress) => void`
- `setCapsuleArray(contractAddress: AztecAddress, baseSlot: Fr, content: Fr[][], jobId: string, scope: AztecAddress) => any`

### CapsuleStore
Implements: `StagedStore`

**Constructor**
```typescript
new CapsuleStore(store: AztecAsyncKVStore)
```

**Properties**
- `logger: Logger`
- `readonly storeName: "capsule"` - Unique name identifying this store (used for tracking staged stores from JobCoordinator)

**Methods**
- `appendToCapsuleArray(contractAddress: AztecAddress, baseSlot: Fr, content: Fr[][], jobId: string, scope: AztecAddress) => Promise<void>` - Appends multiple capsules to a capsule array stored at the base slot. The array length is stored at the base slot, and elements are stored in consecutive slots after it. All operations are performed in a single transaction.
- `commit(jobId: string) => Promise<void>` - Commits staged data to main storage. Called by JobCoordinator when a job completes successfully. Note: JobCoordinator wraps all commits in a single transaction, so we don't need our own transactionAsync here (and using one would deadlock on IndexedDB).
- `copyCapsule(contractAddress: AztecAddress, srcSlot: Fr, dstSlot: Fr, numEntries: number, jobId: string, scope: AztecAddress) => Promise<void>` - Copies a number of contiguous entries in the per-contract non-volatile database. This allows for efficient data structures by avoiding repeated calls to `loadCapsule` and `storeCapsule`. Supports overlapping source and destination regions (which will result in the overlapped source values being overwritten). All copied slots must exist in the database (i.e. have been stored and not deleted)
- `deleteCapsule(contractAddress: AztecAddress, slot: Fr, jobId: string, scope: AztecAddress) => void` - Deletes data in the per-contract non-volatile database. Does nothing if no data was present.
- `discardStaged(jobId: string) => Promise<void>` - Discards staged data without committing.
- `getCapsule(contractAddress: AztecAddress, slot: Fr, jobId: string, scope: AztecAddress) => Promise<Fr[] | null>` - Returns data previously stored via `storeCapsule` in the per-contract non-volatile database.
- `readCapsuleArray(contractAddress: AztecAddress, baseSlot: Fr, jobId: string, scope: AztecAddress) => Promise<Fr[][]>`
- `setCapsule(contractAddress: AztecAddress, slot: Fr, capsule: Fr[], jobId: string, scope: AztecAddress) => void` - Stores arbitrary information in a per-contract non-volatile database, which can later be retrieved with `loadCapsule`. * If data was already stored at this slot, it is overwritten.
- `setCapsuleArray(contractAddress: AztecAddress, baseSlot: Fr, content: Fr[][], jobId: string, scope: AztecAddress) => any`

### ContractStore

ContractStore serves as a data manager and retriever for Aztec.nr contracts. It provides methods to obtain contract addresses, function ABI, bytecode, and membership witnesses from a given contract address and function selector. The class maintains a cache of ContractTree instances to efficiently serve the requested data. It interacts with the ContractDatabase and AztecNode to fetch the required information and facilitate cryptographic proof generation.

**Constructor**
```typescript
new ContractStore(store: AztecAsyncKVStore)
```

**Methods**
- `addContractArtifact(contract: ContractArtifact, contractClassWithIdAndPreimage?: any) => Promise<Fr>` - Registers a new contract artifact and its corresponding class data. IMPORTANT: This method does not verify that the provided artifact matches the class data or that the class id matches the artifact. It is the caller's responsibility to ensure the consistency and correctness of the provided data. This is done to avoid redundant, expensive contract class computations
- `addContractInstance(contract: ContractInstanceWithAddress) => Promise<void>`
- `getContract(address: AztecAddress) => Promise<any>`
- `getContractArtifact(contractClassId: Fr) => Promise<any>` - Returns the raw contract artifact for a given class id.
- `getContractClassWithPreimage(contractClassId: Fr) => Promise<any>` - Returns a contract class for a given class id.
- `getContractInstance(contractAddress: AztecAddress) => Promise<any>` - Returns a contract instance for a given address.
- `getContractsAddresses() => Promise<AztecAddress[]>`
- `getDebugContractName(contractAddress: AztecAddress) => Promise<any>`
- `getDebugFunctionName(contractAddress: AztecAddress, selector: FunctionSelector) => Promise<string>`
- `getFunctionAbi(contractAddress: AztecAddress, selector: FunctionSelector) => Promise<any>`
- `getFunctionArtifact(contractAddress: AztecAddress, selector: FunctionSelector) => Promise<any>` - Retrieves the artifact of a specified function within a given contract.
- `getFunctionArtifactWithDebugMetadata(contractAddress: AztecAddress, selector: FunctionSelector) => Promise<FunctionArtifactWithContractName>`
- `getFunctionCall(functionName: string, args: any[], to: AztecAddress) => Promise<FunctionCall>`
- `getFunctionDebugMetadata(contractAddress: AztecAddress, selector: FunctionSelector) => Promise<any>` - Retrieves the debug metadata of a specified function within a given contract.
- `getFunctionMembershipWitness(contractClassId: Fr, selector: FunctionSelector) => Promise<any>` - Retrieve the function membership witness for the given contract class and function selector.
- `getPublicFunctionArtifact(contractAddress: AztecAddress) => Promise<any>`
- `getPublicFunctionDebugMetadata(contractAddress: AztecAddress) => Promise<any>`

### ContractSyncService

Service for syncing the private state of contracts and verifying that the PXE holds the current class artifact. It uses a cache to avoid redundant sync operations - the cache is wiped when the anchor block changes. The StagedStore naming is broken here. Figure out a better name.
Implements: `StagedStore`

**Constructor**
```typescript
new ContractSyncService(aztecNode: AztecNode, contractStore: ContractStore, noteStore: NoteStore, log: Logger)
```

**Properties**
- `readonly storeName: "contract_sync"` - Unique name identifying this store (used for tracking staged stores from JobCoordinator)

**Methods**
- `commit(_jobId: string) => Promise<void>` - Commits staged data to main storage. Should be called within a transaction for atomicity.
- `discardStaged(_jobId: string) => Promise<void>` - Discards staged data without committing. Called on abort.
- `ensureContractSynced(contractAddress: AztecAddress, functionToInvokeAfterSync: any, utilityExecutor: (call: FunctionCall, scopes: AztecAddress[]) => Promise<any>, anchorBlockHeader: BlockHeader, jobId: string, scopes: AztecAddress[]) => Promise<void>` - Ensures a contract's private state is synchronized and that the PXE holds the current class artifact. Uses a cache to avoid redundant sync operations - the cache is wiped when the anchor block changes.
- `invalidateContractForScopes(contractAddress: AztecAddress, scopes: AztecAddress[]) => void` - Clears sync cache entries for the given scopes of a contract.
- `wipe() => void` - Clears sync cache. Called by BlockSynchronizer when anchor block changes.

### JobCoordinator

JobCoordinator manages job lifecycle and provides crash resilience for PXE operations. It uses a staged writes pattern: 1. When a job begins, a unique job ID is created 2. During the job, all writes go to staging (keyed by job ID) 3. On commit, staging is promoted to main storage 4. On abort, staged data is discarded Note: PXE should only rely on a single JobCoordinator instance, so it can eventually orchestrate concurrent jobs. Right now it doesn't make a difference because we're using a job queue with concurrency=1.

**Constructor**
```typescript
new JobCoordinator(kvStore: AztecAsyncKVStore, bindings?: any)
```

**Properties**
- `kvStore: AztecAsyncKVStore` - The underlying KV store

**Methods**
- `abortJob(jobId: string) => Promise<void>` - Aborts a job by discarding all staged data.
- `beginJob() => string` - Begins a new job and returns a job ID for staged writes.
- `commitJob(jobId: string) => Promise<void>` - Commits a job by promoting all staged data to main storage.
- `hasJobInProgress() => boolean` - Checks if there's a job currently in progress.
- `registerStore(store: StagedStore) => void` - Registers a staged store. Must be called during initialization for all stores that need staging support.
- `registerStores(stores: StagedStore[]) => void` - Registers multiple staged stores.

### NoteService

**Constructor**
```typescript
new NoteService(noteStore: NoteStore, aztecNode: AztecNode, anchorBlockHeader: BlockHeader, jobId: string)
```

**Methods**
- `getNotes(contractAddress: AztecAddress, owner: any, storageSlot: Fr, status: NoteStatus, scopes: AztecAddress[]) => Promise<{ contractAddress: NoteDao; isPending: boolean; ... }[]>` - Retrieves a set of notes stored in the database for a given contract address and storage slot. The query result is paginated using 'limit' and 'offset' values. Returns an object containing an array of note data.
- `syncNoteNullifiers(contractAddress: AztecAddress, scopes: AztecAddress[]) => Promise<void>` - Looks for nullifiers of active contract notes and marks them as nullified if a nullifier is found. Fetches notes from the NoteStore and checks which nullifiers are present in the onchain nullifier Merkle tree - up to the latest locally synced block. We use the locally synced block instead of querying the chain's 'latest' block to ensure correctness: notes are only marked nullified once their corresponding nullifier has been included in a block up to which the PXE has synced. This allows recent nullifications to be processed even if the node is not an archive node.
- `validateAndStoreNotes(requests: NoteValidationRequest[], scope: AztecAddress, txEffects: Map<string, IndexedTxEffect>) => Promise<void>` - Validates and stores a batch of notes against pre-fetched tx effects. For each request we must verify that: - the note actually exists in the corresponding tx effect (and thus in the note hash tree), and - the note has not already been nullified. Failing to do either would result in circuits getting either non-existent notes and failing to produce inclusion proofs for them, or getting nullified notes and producing duplicate nullifiers, both of which are catastrophic failure modes. Note that adding a note and removing it is *not* equivalent to never adding it in the first place. A nullifier emitted in a block that comes after note creation might result in the note being de-nullified by a chain reorg, so we must store both the note hash and nullifier block information.

### NoteStore

NoteStore manages the storage and retrieval of notes using an append-only model. Notes are written once (keyed by siloedNullifier) and never mutated. They might be deleted in case of reorg though. Nullifier emissions are recorded as separate append-only entries: a map from nullifier to the number of the block that emitted it. Reorgs are handled by delete-on-prune: the `chain-pruned` event triggers deletion of every note and nullifier originating on a reorg'd block.
Implements: `StagedStore`

**Constructor**
```typescript
new NoteStore(store: AztecAsyncKVStore)
```

**Properties**
- `logger: any`
- `readonly storeName: string` - Unique name identifying this store (used for tracking staged stores from JobCoordinator)

**Methods**
- `addNotes(notes: NoteDao[], scope: AztecAddress, jobId: string) => Promise<void[]>` - Adds multiple notes to the notes store under the specified scope. Notes are stored using their siloedNullifier as the key, which provides uniqueness. Each note is indexed by multiple criteria for efficient retrieval.
- `applyNullifiers(siloedNullifiers: DataInBlock<Fr>[], jobId: string) => Promise<NoteDao[]>` - Records emission of the given siloed nullifiers, which causes notes to be considered nullified. Each nullifier gets an append-only entry recording the block number at which it was emitted. Every nullifier passed must correspond to a note already present in this store. Callers only apply nullifiers for notes of scopes they track, and a note is always discovered before the nullifier that spends it, so a nullifier with no matching note signals a bug (broken nonce/index discovery, a sync-ordering error, store corruption, etc). `applyNullifiers` is idempotent: a nullifier whose emission is already recorded (committed or staged in this job) is skipped, so re-applying it neither re-writes the emission, changes note visibility, nor appears in the result.
- `commit(jobId: string) => Promise<void>` - Commits in-memory job data to persistent storage. Called by JobCoordinator when a job completes successfully. Note: JobCoordinator wraps all commits in a single transaction, so we don't need our own transactionAsync here (and using one would throw on IndexedDB as it does not support nested txs).
- `discardStaged(jobId: string) => Promise<void>` - Discards staged data without committing. Called on abort.
- `getNotes(filter: NotesFilter, jobId: string) => Promise<NoteDao[]>` - Retrieves notes based on the provided filter criteria. A note is considered nullified iff its corresponding nullifier emission has been recorded. All DB reads are kicked off before any await so IndexedDB does not auto-commit the transaction mid-read.
- `nullifiersOfNotesAtBlock(blockNumber: number) => Promise<string[]>` - Returns the nullifiers (note ids) of all notes created at the given block number. Used by delete-on-prune.
- `rollback(toBlock: number) => Promise<void>` - Rolls the store back to `toBlock`: deletes every note and nullifier emission originating on a block strictly above it, as if nothing past that block height ever happened. Used to retract notes and nullifiers on a reorg. Must be called inside a transaction owned by the caller (it issues no `transactionAsync` of its own, because the reorg path wraps it together with other store operations, and IndexedDB has no nested transaction support). Throws if any job has uncommitted staged writes, since rolling back mid-job could later re-introduce notes or nullifier emissions anchored to deleted blocks.

### PXE

Private eXecution Environment (PXE) is a library used by wallets to simulate private phase of transactions and to manage private state of users.

**Properties**
- `debug: PXEDebugUtils`

**Methods**
- `static create(__namedParameters: PXECreateArgs) => Promise<PXE>` - Creates an instance of a PXE by instantiating all the necessary data providers and services. Also triggers the registration of the protocol contracts and makes sure the provided node can be contacted.
- `executeUtility(call: FunctionCall, __namedParameters: ExecuteUtilityOpts) => Promise<UtilityExecutionResult>` - Executes a contract utility function.
- `getContractArtifact(id: Fr) => Promise<any>` - Returns the contract artifact for a given contract class id, if it's registered in the PXE.
- `getContractInstance(address: AztecAddress) => Promise<any>` - Returns the contract instance for a given address, if it's registered in the PXE.
- `getContracts() => Promise<AztecAddress[]>` - Retrieves the addresses of contracts added to this PXE.
- `getPrivateEvents(eventSelector: EventSelector, filter: PrivateEventFilter) => Promise<any[]>` - Returns the private events given search parameters.
- `getRegisteredAccounts() => Promise<CompleteAddress[]>` - Retrieves the user accounts registered on this PXE.
- `getSenders() => Promise<AztecAddress[]>` - Retrieves senders registered in this PXE.
- `getSyncedBlockHeader() => Promise<BlockHeader>` - Returns the block header up to which the PXE has synced.
- `profileTx(txRequest: TxExecutionRequest, __namedParameters: ProfileTxOpts) => Promise<TxProfileResult>` - Profiles a transaction, reporting gate counts (unless disabled) and returns an execution trace.
- `proveTx(txRequest: TxExecutionRequest, scopes: ProveTxOpts) => Promise<TxProvingResult>` - Proves the private portion of a simulated transaction, ready to send to the network (where validators prove the public portion).
- `registerAccount(secretKey: Fr, partialAddress: PartialAddress) => Promise<CompleteAddress>` - Registers a user account in PXE given its master encryption private key. Once a new account is registered, the PXE will trial-decrypt all published notes on the chain and store those that correspond to the registered account. Will do nothing if the account is already registered.
- `registerContract(contract: { artifact?: any; instance: ContractInstanceWithAddress }) => Promise<void>` - Adds deployed contracts to the PXE. Deployed contract information is used to access the contract code when simulating local transactions. This is automatically called by aztec.js when deploying a contract. Dapps that wish to interact with contracts already deployed should register these contracts in their users' PXE through this method.
- `registerContractClass(artifact: ContractArtifact) => Promise<void>` - Registers a contract class in the PXE without registering any associated contract instance with it.
- `registerSender(sender: AztecAddress) => Promise<AztecAddress>` - Registers a sender in this PXE. After registering a new sender, the PXE will sync private logs that are tagged with this sender's address. Will do nothing if the address is already registered.
- `removeSender(sender: AztecAddress) => Promise<void>` - Removes a sender registered in this PXE.
- `simulateTx(txRequest: TxExecutionRequest, __namedParameters: SimulateTxOpts) => Promise<TxSimulationResult>` - Simulates a transaction based on the provided preauthenticated execution request. This will run a local simulation of private execution (and optionally of public as well), run the kernel circuits to ensure adherence to protocol rules (without generating a proof), and return the simulation results . Note that this is used with `ContractFunctionInteraction::simulateTx` to bypass certain checks. In that case, the transaction returned is only potentially ready to be sent to the network for execution.
- `stop() => Promise<void>` - Stops the PXE's job queue and closes the backing store.
- `sync() => Promise<void>` - Triggers a sync of PXE state with the node, regardless of the `autoSync` config flag. Use this to batch syncs across composite flows when `autoSync` is disabled (e.g. one sync per simulate+send instead of one per inner PXE call). Serialized through the job queue.
- `updateContract(contractAddress: AztecAddress, artifact: ContractArtifact) => Promise<void>` - Updates a deployed contract in the PXE. This is used to update the contract artifact when an update has happened, so the new code can be used in the simulation of local transactions. This is called by aztec.js when instantiating a contract in a given address with a mismatching artifact.

### PrivateEventStore

Stores decrypted private event logs. Append-only: events are never deleted during normal operation. Reorgs are handled by delete-on-prune, which removes every event originating on a reorg'd block.
Implements: `StagedStore`

**Constructor**
```typescript
new PrivateEventStore(store: AztecAsyncKVStore)
```

**Properties**
- `logger: any`
- `readonly storeName: string` - Unique name identifying this store (used for tracking staged stores from JobCoordinator)

**Methods**
- `commit(jobId: string) => Promise<void>` - Commits in memory job data to persistent storage. Called by JobCoordinator when a job completes successfully. Note: JobCoordinator wraps all commits in a single transaction, so we don't need our own transactionAsync here (and using one would throw on IndexedDB as it does not support nested txs).
- `discardStaged(jobId: string) => Promise<void>` - Discards in memory job data without persisting it.
- `eventIdsAtBlock(blockNumber: number) => Promise<string[]>` - Returns the ids (siloed event commitments) of all events emitted at the given block number. Used by delete-on-prune.
- `getPrivateEvents(eventSelector: EventSelector, filter: PrivateEventStoreFilter) => Promise<any[]>` - Returns the private events given search parameters.
- `rollback(toBlock: number) => Promise<void>` - Rolls the store back to `toBlock`: deletes every event anchored to a block strictly above it, as if nothing past that block height ever happened. Used by the reorg (`chain-pruned`) path to truncate the orphaned tail. Scanning from `toBlock + 1` upward covers everything above the rollback target without needing to know the chain tip. Must be called inside a transaction owned by the caller (it issues no `transactionAsync` of its own, the reorg path wraps it together with the anchor update, and IndexedDB has no nested transactions). Throws if any job has uncommitted staged writes, since rolling back mid-job could later re-introduce events anchored to deleted blocks.
- `storePrivateEventLog(eventSelector: EventSelector, randomness: Fr, msgContent: Fr[], siloedEventCommitment: Fr, metadata: any, jobId: string) => Promise<unknown>` - Store a private event log.

### RecipientTaggingStore

Data provider of tagging data used when syncing the logs as a recipient. The sender counterpart of this class is called SenderTaggingStore. We have the providers separate for the sender and recipient because the algorithms are completely disjoint and there is not data reuse between the two.
Implements: `StagedStore`

**Constructor**
```typescript
new RecipientTaggingStore(store: AztecAsyncKVStore)
```

**Properties**
- `storeName: string` - Unique name identifying this store (used for tracking staged stores from JobCoordinator)

**Methods**
- `commit(jobId: string) => Promise<void>` - Writes all job-specific in-memory data to persistent storage.
- `discardStaged(jobId: string) => Promise<void>` - Discards staged data without committing. Called on abort.
- `getHighestAgedIndex(secret: AppTaggingSecret, jobId: string) => Promise<number | undefined>`
- `getHighestFinalizedIndex(secret: AppTaggingSecret, jobId: string) => Promise<number | undefined>`
- `updateHighestAgedIndex(secret: AppTaggingSecret, index: number, jobId: string) => Promise<void>`
- `updateHighestFinalizedIndex(secret: AppTaggingSecret, index: number, jobId: string) => Promise<void>`

### SenderAddressBookStore

Stores sender addresses. During recipient log synchronization, these senders are used, along with a given recipient, to derive directional app tagging secrets that are then used to sync the logs.

**Constructor**
```typescript
new SenderAddressBookStore(store: AztecAsyncKVStore)
```

**Methods**
- `addSender(address: AztecAddress) => Promise<boolean>`
- `getSenders() => Promise<AztecAddress[]>`
- `removeSender(address: AztecAddress) => Promise<boolean>`

### SenderTaggingStore

Data provider of tagging data used when syncing the sender tagging indexes. The recipient counterpart of this class is called RecipientTaggingStore. We have the data stores separate for sender and recipient because the algorithms are completely disjoint and there is not data reuse between the two.
Implements: `StagedStore`

**Constructor**
```typescript
new SenderTaggingStore(store: AztecAsyncKVStore)
```

**Properties**
- `readonly storeName: "sender_tagging"` - Unique name identifying this store (used for tracking staged stores from JobCoordinator)

**Methods**
- `commit(jobId: string) => Promise<void>` - Writes all job-specific in-memory data to persistent storage.
- `discardStaged(jobId: string) => Promise<void>` - Discards staged data without committing. Called on abort.
- `dropPendingIndexes(txHashes: TxHash[], jobId: string) => Promise<void>` - Drops all pending indexes corresponding to the given transaction hashes.
- `finalizePendingIndexes(txHashes: TxHash[], jobId: string) => Promise<void>` - Updates pending indexes corresponding to the given transaction hashes to be finalized and prunes any lower pending indexes.
- `finalizePendingIndexesOfAPartiallyRevertedTx(txEffect: TxEffect, jobId: string) => Promise<void>` - Handles finalization of pending indexes for a transaction whose execution was partially reverted. Recomputes the siloed tags for each pending index of the given tx and checks which ones appear in the TxEffect's private logs (i.e., which ones made it onchain). Those that survived are finalized; those that didn't are dropped.
- `getLastFinalizedIndex(secret: AppTaggingSecret, jobId: string) => Promise<number | undefined>` - Returns the last (highest) finalized index for a given secret.
- `getLastUsedIndex(secret: AppTaggingSecret, jobId: string) => Promise<number | undefined>` - Returns the last used index for a given directional app tagging secret, considering both finalized and pending indexes.
- `getTxHashesOfPendingIndexes(secret: AppTaggingSecret, startIndex: number, endIndex: number, jobId: string) => Promise<TxHash[]>` - Returns the transaction hashes of all pending transactions that contain highest indexes within a specified range for a given directional app tagging secret. We check based on the highest indexes only as that is the relevant information for the caller of this function.
- `storePendingIndexes(ranges: TaggingIndexRange[], txHash: TxHash, jobId: string) => Promise<void>` - Stores pending index ranges.

## Interfaces

### BlockSynchronizerConfig

Configuration settings for the block synchronizer.

**Properties**
- `autoSync: boolean` - Whether PXE should automatically sync with the node before each operation (simulate, prove, profile, execute utility, get private events, update contract). When disabled, callers (e.g. wallets) are responsible for calling `pxe.sync()` explicitly
- `l2BlockBatchSize: number` - Maximum amount of blocks to pull from the stream in one request when synchronizing
- `syncChainTip?: "proposed" | "checkpointed" | "proven" | "finalized"` - Which chain tip to sync to (proposed, checkpointed, proven, finalized)

### ExecutionHooks

Hooks that PXE invokes during client-side simulation to gate operations that the protocol does not restrict on its own. They give the wallet a chance to apply custom policies (e.g. prompting the user, consulting a dynamic allowlist, or inspecting call arguments) before the execution proceeds. For example, authorizeUtilityCall is called whenever a utility function makes a cross-contract call. A call made by a malicious contract could leak private information, so the hook lets the wallet decide, per-call, whether to allow it. A static allowlist would not work here because neither the app nor the wallet can predict ahead of time which contracts will be invoked during execution. Calls to standard contracts (such as the HandshakeRegistry) bypass this hook and are always authorized. Note: hooks are unrelated to authentication witnesses (authwits). Authwits are an on-chain mechanism where a contract verifies that a caller was authorized by a specific account; hooks are a client-side PXE concern that gates execution before it proceeds.

**Properties**
- `authorizeUtilityCall: AuthorizeUtilityCall` - Called when a contract attempts a cross-contract utility call.

### KernelProverConfig

Configuration settings for the prover factory

**Properties**
- `proverEnabled?: boolean` - Whether we are running with real proofs

## Functions

### composeHooks
```typescript
function composeHooks(partial: Partial<ExecutionHooks>) => ExecutionHooks | undefined
```
Builds an ExecutionHooks from individually-constructed hook callbacks. Returns `undefined` when every field is absent, so callers can unconditionally pass the result as `hooks`.

### createContractLogger
```typescript
function createContractLogger(contractAddress: AztecAddress, getContractName: ContractNameResolver, kind: CONTRACT_LOG_KIND, options?: { instanceId?: string }) => Promise<Logger>
```
Creates a logger whose output is prefixed with `contract:<name>(<addrAbbrev>)`.

### createPXE
```typescript
function createPXE(aztecNode: AztecNode, config: PXEConfigWithoutDefaults, options: PXECreationOptions) => Promise<PXE>
```

### displayDebugLogs
```typescript
function displayDebugLogs(debugLogs: DebugLog[], getContractName: ContractNameResolver) => Promise<void>
```
Displays debug logs collected during public function simulation, using the `contract:` prefixed logger format.

### enrichPublicSimulationError
```typescript
function enrichPublicSimulationError(err: SimulationError, contractStore: ContractStore, logger: Logger) => Promise<void>
```

### enrichSimulationError
```typescript
function enrichSimulationError(err: SimulationError, contractStore: ContractStore, logger: Logger) => Promise<void>
```
Adds contract and function names to a simulation error, if they can be found in the PXE database

### getCliPXEOptions
```typescript
function getCliPXEOptions() => any
```
Creates an instance of CliPxeOptions out of environment variables

### getPXEConfig
```typescript
function getPXEConfig() => any
```
Creates an instance of PXEConfig out of environment variables using sensible defaults for integration testing if not set.

### logContractMessage
```typescript
function logContractMessage(logger: Logger, level: LogLevel, message: string, fields: Fr[]) => void
```
Formats and emits a single contract log message through the given logger.

### stripAztecnrLogPrefix
```typescript
function stripAztecnrLogPrefix(message: string) => { kind: CONTRACT_LOG_KIND; message: string }
```

## Types

### AuthorizeUtilityCall
```typescript
type AuthorizeUtilityCall = (request: UtilityCallAuthorizationRequest) => Promise<UtilityCallAuthorizationResponse>
```
Hook called when a utility function attempts a cross-contract call. Returns a response indicating whether the call is authorized and an optional denial reason.

### CONTRACT_LOG_KIND
```typescript
type CONTRACT_LOG_KIND = "aztecnr" | "user"
```

### CliPXEOptions
```typescript
type CliPXEOptions = unknown
```

### ContractNameResolver
```typescript
type ContractNameResolver = (address: AztecAddress) => Promise<string | undefined>
```
Resolves a contract address to a human-readable name, if available.

### ExecuteUtilityOpts
```typescript
type ExecuteUtilityOpts = unknown
```
Options for PXE.executeUtility.

### NotesFilter
```typescript
type NotesFilter = unknown
```
A filter used to fetch notes.

### ORACLE_VERSION_MAJOR
```typescript
type ORACLE_VERSION_MAJOR = 29
```

### ORACLE_VERSION_MINOR
```typescript
type ORACLE_VERSION_MINOR = 1
```

### PXEConfig
```typescript
type PXEConfig = KernelProverConfig & DataStoreConfig & ChainConfig & BlockSynchronizerConfig
```

### PXECreateArgs
```typescript
type PXECreateArgs = unknown
```
Args for PXE.create.

### PXECreationOptions
```typescript
type PXECreationOptions = unknown
```

### PXE_DATA_SCHEMA_VERSION
```typescript
type PXE_DATA_SCHEMA_VERSION = 8
```

### PackedPrivateEvent
```typescript
type PackedPrivateEvent = InTx & { eventSelector: EventSelector; packedEvent: Fr[] }
```

### PreloadedContractsProvider
```typescript
type PreloadedContractsProvider = unknown
```
Supplies the set of "nice to have" contracts that every PXE preloads regardless of which wallet drives it. Today this is just the standard multi-call entrypoint: the SDK's self-paid account deploy flow (DeployAccountMethod with `from = NO_FROM`) routes its payload through it, so a PXE that did not register it would fail contract sync with an opaque "no contract instance" error. Returning a list keeps this extensible: a wallet may supply its own provider that preloads additional contracts. Injected the same way as ProtocolContractsProvider so the PXE never statically imports the bundled artifacts, keeping the bundle/lazy split intact.

### PrivateEventStoreFilter
```typescript
type PrivateEventStoreFilter = unknown
```

### ProfileTxOpts
```typescript
type ProfileTxOpts = unknown
```
Options for PXE.profileTx.

### ProveTxOpts
```typescript
type ProveTxOpts = unknown
```
Options for PXE.proveTx.

### SimulateTxOpts
```typescript
type SimulateTxOpts = unknown
```
Options for PXE.simulateTx.

### UtilityCallAuthorizationRequest
```typescript
type UtilityCallAuthorizationRequest = unknown
```
Information about a cross-contract utility call that requires authorization.

### UtilityCallAuthorizationResponse
```typescript
type UtilityCallAuthorizationResponse = Authorized | Denied
```
Result of an authorization hook evaluation.

### allPxeConfigMappings
```typescript
type allPxeConfigMappings = ConfigMappingsType<CliPXEOptions & PXEConfig>
```

### getPackageInfo
```typescript
type getPackageInfo = any
```

### pxeCliConfigMappings
```typescript
type pxeCliConfigMappings = ConfigMappingsType<CliPXEOptions>
```

### pxeConfigMappings
```typescript
type pxeConfigMappings = ConfigMappingsType<PXEConfig>
```
