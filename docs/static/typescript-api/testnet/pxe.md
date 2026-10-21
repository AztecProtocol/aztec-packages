# @aztec/pxe

Version: 6.0.0-rc.1

## Quick Import Reference

```typescript
import {
  AddressStore,
  AnchorBlockStore,
  AnchoredContractData,
  CapsuleService,
  CapsuleStore,
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
- `getCompleteAddress(account: AztecAddress) => Promise<CompleteAddress | undefined>`
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

### AnchoredContractData

Per-run view of contract data for a single simulation, bound to its anchor block. The ContractStore is pure class-id-keyed storage and has no notion of which class an address runs. This class bridges that gap: it resolves an address to its current class id (via the ContractClassService at the run's anchor block) and then serves artifacts from the store. It is also the single place contract overrides are applied — when an address is overridden, both its instance and its class id come from the override rather than the chain, so a simulation can execute different bytecode at that address. Overrides are only set for `simulateTx` (which skips the kernels), so the override path never reaches proving.

**Constructor**
```typescript
new AnchoredContractData(store: ContractStore, contractClassService: ContractClassService, anchorBlockHeader: BlockHeader, overrides?: ContractOverrides)
```

**Methods**
- `getContractInstance(address: AztecAddress) => Promise<ContractInstancePreimageWithAddress | undefined>` - Returns the address preimage of the instance at `address`, from the override if any, else from storage.
- `getCurrentClassId(address: AztecAddress) => Promise<Fr | undefined>` - Resolves the class id `address` runs in this simulation: the override's class if overridden, else resolved against the chain at the anchor block.
- `getDebugContractName(address: AztecAddress) => Promise<string | undefined>`
- `getDebugFunctionName(address: AztecAddress, selector: FunctionSelector) => Promise<string>`
- `getFunctionArtifact(address: AztecAddress, selector: FunctionSelector) => Promise<FunctionArtifactWithContractName | undefined>`
- `getFunctionArtifactWithDebugMetadata(address: AztecAddress, selector: FunctionSelector) => Promise<FunctionArtifactWithContractName | undefined>`

### CapsuleService

Wraps a CapsuleStore with scope-based access control. Each operation asserts that the requested scope is in the allowed scopes list before delegating to the underlying store.

**Constructor**
```typescript
new CapsuleService(capsuleStore: CapsuleStore, allowedScopes: AztecAddress[])
```

**Methods**
- `appendToCapsuleArray(contractAddress: AztecAddress, baseSlot: Fr, content: Fr[][], changeSetId: string, scope: AztecAddress) => Promise<void>`
- `copyCapsule(contractAddress: AztecAddress, srcSlot: Fr, dstSlot: Fr, numEntries: number, changeSetId: string, scope: AztecAddress) => Promise<void>`
- `deleteCapsule(contractAddress: AztecAddress, slot: Fr, changeSetId: string, scope: AztecAddress) => Promise<void>`
- `getCapsule(contractAddress: AztecAddress, slot: Fr, changeSetId: string, scope: AztecAddress, transientCapsules?: Capsule[]) => Promise<Fr[] | null>`
- `readCapsuleArray(contractAddress: AztecAddress, baseSlot: Fr, changeSetId: string, scope: AztecAddress) => Promise<Fr[][]>`
- `setCapsule(contractAddress: AztecAddress, slot: Fr, capsule: Fr[], changeSetId: string, scope: AztecAddress) => Promise<void>`
- `setCapsuleArray(contractAddress: AztecAddress, baseSlot: Fr, content: Fr[][], changeSetId: string, scope: AztecAddress) => Promise<void>`

### CapsuleStore

Extends: `BaseStagingStore<CapsuleStoreChangeSet, CapsuleStoreDb>`

**Constructor**
```typescript
new CapsuleStore(store: AztecAsyncKVStore)
```

**Properties**
- `logger: Logger`
- `readonly storeName: string` - Unique name identifying this store (used for tracking staged stores from StagedWriteCoordinator)

**Methods**
- `appendToCapsuleArray(contractAddress: AztecAddress, baseSlot: Fr, content: Fr[][], changeSetId: string, scope: AztecAddress) => Promise<void>` - Appends multiple capsules to a capsule array stored at the base slot. The array length is stored at the base slot, and elements are stored in consecutive slots after it.
- `applyRollback() => Promise<void>` - No-op: capsules are not anchored to a block, so a prune cannot orphan any of them.
- `beginChangeSet(changeSetId: string) => void` - Opens the change set, so its operations are accepted until commitChangeSet or discardChangeSet.
- `commitChangeSet(changeSetId: string) => Promise<void>` - Commits the change set's staged data: flushes it via flushChangeSet, then closes the change set. Runs inside the transaction owned by the caller. Not meant to be overridden: subclasses implement flushChangeSet.
- `copyCapsule(contractAddress: AztecAddress, srcSlot: Fr, dstSlot: Fr, numEntries: number, changeSetId: string, scope: AztecAddress) => Promise<void>` - Copies a number of contiguous entries in the per-contract non-volatile database. This allows for efficient data structures by avoiding repeated calls to `loadCapsule` and `storeCapsule`. Supports overlapping source and destination regions (which will result in the overlapped source values being overwritten). All copied slots must exist in the database (i.e. have been stored and not deleted)
- `deleteCapsule(contractAddress: AztecAddress, slot: Fr, changeSetId: string, scope: AztecAddress) => Promise<void>` - Deletes data in the per-contract non-volatile database. Does nothing if no data was present.
- `discardChangeSet(changeSetId: string) => void` - Closes the change set, discarding any staged data without committing. A no-op if it is not open.
- `flushChangeSet(changeSet: CapsuleStoreChangeSet, db: CapsuleStoreDb) => Promise<void>` - Writes the change set's staged data to persistent storage. Runs inside the caller's transaction: it must not open a transaction of its own or call withChangeSetAndDb.
- `getCapsule(contractAddress: AztecAddress, slot: Fr, changeSetId: string, scope: AztecAddress) => Promise<Fr[] | null>` - Returns data previously stored via `storeCapsule` in the per-contract non-volatile database.
- `readCapsuleArray(contractAddress: AztecAddress, baseSlot: Fr, changeSetId: string, scope: AztecAddress) => Promise<Fr[][]>`
- `rollbackToBlock(toBlock: number) => Promise<void>` - Rolls the store back to `toBlock` via applyRollback. Must be called inside a transaction owned by the caller, since it opens none of its own. Not meant to be overridden: subclasses implement applyRollback.
- `setCapsule(contractAddress: AztecAddress, slot: Fr, capsule: Fr[], changeSetId: string, scope: AztecAddress) => Promise<void>` - Stores arbitrary information in a per-contract non-volatile database, which can later be retrieved with `loadCapsule`. * If data was already stored at this slot, it is overwritten.
- `setCapsuleArray(contractAddress: AztecAddress, baseSlot: Fr, content: Fr[][], changeSetId: string, scope: AztecAddress) => Promise<void>`
- `withChangeSet<R>(changeSetId: string, fn: (changeSet: CapsuleStoreChangeSet) => R | Promise<R>) => Promise<R>` - Runs a change set operation over the staged data alone: takes the store's lock and calls `fn` with the change set's staged data, opening no db transaction. Use withChangeSetAndDb instead when `fn` reads the DB.
- `withChangeSetAndDb<R>(changeSetId: string, fn: (changeSet: CapsuleStoreChangeSet, db: ReadonlyDb<TDb>) => Promise<R>) => Promise<R>` - Runs a change set operation that reads the DB. Takes the store's lock, opens a transaction, and calls `fn` with the change set's staged data and a read-only view of the DB (writes are staged in memory until flushChangeSet runs on commit). Prefer withChangeSet unless `fn` actually reads the DB. The lock makes the store thread safe: two operations issued concurrently (e.g. under `Promise.all`) cannot interleave across awaits, so `fn` can read staged data and write it back without handling atomicity itself.

### ContractClassService

Resolves the contract class id that an address runs at a given anchor block, as tracked by the chain. PXE does not store a contract's current class id: it is mutable, chain-derived state that changes when a contract is upgraded and can be undone by a reorg. Instead this service asks the node for the current class at an anchor block, falling back to a local instance if no upgrades were scheduled.

**Constructor**
```typescript
new ContractClassService(node: AztecNode, contractStore: ContractStore)
```

**Methods**
- `getCurrentClassId(address: AztecAddress, anchorBlockHeader: BlockHeader) => Promise<Fr | undefined>` - Returns the class id that corresponds to `address` as of `anchorBlockHeader`, or `undefined` if no instance is registered for `address`. A missing instance is an absence the caller decides how to handle, not an error; genuine failures (e.g. the node being unreachable) still throw.

### ContractStore

ContractStore serves as a data manager and retriever for Aztec.nr contracts. It provides methods to obtain contract addresses, function ABI, bytecode, and membership witnesses from a given contract address and function selector. The class maintains a cache of ContractTree instances to efficiently serve the requested data. It interacts with the ContractDatabase and AztecNode to fetch the required information and facilitate cryptographic proof generation.

**Constructor**
```typescript
new ContractStore(store: AztecAsyncKVStore)
```

**Methods**
- `addContractArtifact(contract: ContractArtifact, contractClassWithIdAndPreimage?: ContractClass & Pick<ContractClassCommitments, "id"> & ContractClassIdPreimage) => Promise<Fr>` - Registers a new contract artifact and its corresponding class data. IMPORTANT: This method does not verify that the provided artifact matches the class data or that the class id matches the artifact. It is the caller's responsibility to ensure the consistency and correctness of the provided data. This is done to avoid redundant, expensive contract class computations.
- `addContractInstance(contract: ContractInstancePreimageWithAddress) => Promise<void>`
- `getContractArtifact(contractClassId: Fr) => Promise<ContractArtifact | undefined>` - Returns the raw contract artifact for a given class id.
- `getContractClassWithPreimage(contractClassId: Fr) => Promise<ContractClass & Pick<ContractClassCommitments, "id"> & ContractClassIdPreimage | undefined>` - Returns a contract class for a given class id.
- `getContractInstance(contractAddress: AztecAddress) => Promise<ContractInstancePreimageWithAddress | undefined>` - Returns the address preimage of a given address.
- `getContractsAddresses() => Promise<AztecAddress[]>`
- `getDebugContractName(contractClassId: Fr) => Promise<string | undefined>`
- `getDebugFunctionName(contractClassId: Fr, selector: FunctionSelector) => Promise<string>`
- `getFunctionArtifact(contractClassId: Fr, selector: FunctionSelector) => Promise<FunctionArtifactWithContractName | undefined>` - Retrieves the artifact of a specified function within a given contract class.
- `getFunctionArtifactWithDebugMetadata(contractClassId: Fr, selector: FunctionSelector) => Promise<FunctionArtifactWithContractName | undefined>` - Same as getFunctionArtifact but with debug metadata attached. Returns `undefined` when the class artifact is not registered.
- `getFunctionCall(functionName: string, args: any[], to: AztecAddress, contractClassId: Fr) => Promise<FunctionCall>`
- `getFunctionDebugMetadata(contractClassId: Fr, selector: FunctionSelector) => Promise<FunctionDebugMetadata | undefined>` - Retrieves the debug metadata of a specified function within a given contract class.
- `getFunctionMembershipWitness(contractClassId: Fr, selector: FunctionSelector) => Promise<MembershipWitness<7> | undefined>` - Retrieve the function membership witness for the given contract class and function selector.
- `getPublicFunctionArtifact(contractClassId: Fr) => Promise<FunctionArtifactWithContractName | undefined>`
- `getPublicFunctionDebugMetadata(contractClassId: Fr) => Promise<FunctionDebugMetadata | undefined>`

### ContractSyncService

Service for syncing the private state of contracts. It uses a cache to avoid redundant sync operations - the cache is wiped when the anchor block changes. Contributes to every synced operation (see OperationContributor): its syncs write into the operation's change set, so it settles them before the change set is decided and releases its per-change-set state on the outcome.
Implements: `OperationContributor`

**Constructor**
```typescript
new ContractSyncService(aztecNode: AztecNode, contractStore: ContractStore, contractClassService: ContractClassService, noteStore: NoteStore, log: Logger, __namedParameters: ContractSyncConfig)
```

**Methods**
- `ensureContractSynced(__namedParameters: ContractSyncRequest) => Promise<void>` - Ensures a contract's private state is synchronized. Uses a cache to avoid redundant sync operations - the cache is wiped when the anchor block changes.
- `invalidateContractForScopes(contractAddress: AztecAddress, scopes: AztecAddress[]) => void` - Clears sync cache entries for the given scopes of a contract.
- `onOperationEnd(changeSetId: string, outcome: "committed" | "discarded") => void` - Called once the operation's change set has been committed or discarded. A throw is logged and swallowed: the outcome is already decided by this point, so it cannot change it.
- `settle(changeSetId: string) => Promise<void>` - Waits until every speculative sync the change set fired has finished, then rejects if any failed, so the change set discards instead of committing. This is needed because a sync that fails midway can leave partial staged writes, and a speculative failure might not be surfaced by any request.
- `wipe() => void` - Clears sync cache. Called by BlockSynchronizer when anchor block changes.

### FactCollectionKey

Uniquely identifies a single fact collection, isolated by scope; all its facts share this key.

**Constructor**
```typescript
new FactCollectionKey(contractAddress: AztecAddress, scope: AztecAddress, factCollectionTypeId: Fr, factCollectionId: Fr)
```

**Properties**
- `readonly contractAddress: AztecAddress`
- `readonly factCollectionId: Fr`
- `readonly factCollectionTypeId: Fr`
- `readonly scope: AztecAddress`

**Methods**
- `factCollectionTypeKey() => FactCollectionTypeKey` - The key grouping this collection with the other collections of its type within the same contract and scope.
- `static from(fields: FieldsOf<FactCollectionKey>) => FactCollectionKey`
- `static fromString(str: string) => FactCollectionKey` - Inverse of toString
- `toString() => string`

### FactCollectionTypeKey

Identifies all fact collections of one type within a contract, for one scope.

**Constructor**
```typescript
new FactCollectionTypeKey(contractAddress: AztecAddress, scope: AztecAddress, factCollectionTypeId: Fr)
```

**Properties**
- `readonly contractAddress: AztecAddress`
- `readonly factCollectionTypeId: Fr`
- `readonly scope: AztecAddress`

**Methods**
- `static from(fields: FieldsOf<FactCollectionTypeKey>) => FactCollectionTypeKey`
- `toString() => string`

### FactService

Wraps a FactStore with scope-based access control. Each method asserts scope validity before delegating to FactStore, gating which accounts a contract may record facts under or read facts from.

**Constructor**
```typescript
new FactService(factStore: FactStore, allowedScopes: AztecAddress[])
```

**Methods**
- `deleteFactCollection(factCollectionKey: FactCollectionKey, changeSetId: string) => Promise<void>`
- `getFactCollection(factCollectionKey: FactCollectionKey, tips: TipBlockNumbers, changeSetId: string) => Promise<FactCollectionWithOriginState | undefined>`
- `getFactCollectionsByType(factCollectionTypeKey: FactCollectionTypeKey, tips: TipBlockNumbers, changeSetId: string) => Promise<FactCollectionWithOriginState[]>`
- `recordFact(factCollectionKey: FactCollectionKey, factTypeId: Fr, payload: Fr[], originBlock: OriginBlock | undefined, changeSetId: string) => Promise<void>`

### FactStore

Stores immutable facts grouped into collections, isolated by contract and scope. A fact collection is a contract-defined bag of facts identified by a FactCollectionKey (contract, scope, collection type, and id). A fact is a contract-defined immutable, typed datum in a collection. Collections are implicit: one comes into being when its first fact is recorded and ceases to exist once it has no facts left. What makes this store different to, for example, the `CapsuleStore`, is that it is designed to support use cases where resilience to reorgs is needed, via what we call _retractability_. Facts can be retractable or non-retractable. They are retractable if they are associated to an origin block. Retractable facts are removed from the store when their origin block is pruned (typically due to a reorg). Non-retractable facts survive reorgs: they must then be explicitly deleted, so as not to keep consuming resources (storage and compute) indefinitely. Fact collections are isolated by scope. This store is designed to enable Aztec.nr to implement complex workflows such as offchain reception or partial note processing by storing structured data that is guaranteed to exist conditionally to specific blocks being included in the chain, while leaving the complexity of ensuring said guarantees to PXE. A key design driver is that PXE knows nothing about the actual fact contents: it just manages enough metadata to provide the guarantees mentioned above. That way, concepts such as offchain delivery or partial notes are completely defined by Aztec.nr, opening the door to further extension without the need for ad-hoc PXE support. As with most other PXE stores, writes are staged per change set ID and flushed atomically on commit.

Extends: `BaseStagingStore<FactStoreChangeSet, FactStoreDb>`

**Constructor**
```typescript
new FactStore(store: AztecAsyncKVStore)
```

**Properties**
- `logger: Logger`
- `readonly storeName: string` - Unique name identifying this store (used for tracking staged stores from StagedWriteCoordinator)

**Methods**
- `applyRollback(toBlock: number, db: FactStoreDb) => Promise<void>` - Removes every retractable fact originating from blocks over height `toBlock`, across all scopes. Non-retractable facts are untouched.
- `beginChangeSet(changeSetId: string) => void` - Opens the change set, so its operations are accepted until commitChangeSet or discardChangeSet.
- `commitChangeSet(changeSetId: string) => Promise<void>` - Commits the change set's staged data: flushes it via flushChangeSet, then closes the change set. Runs inside the transaction owned by the caller. Not meant to be overridden: subclasses implement flushChangeSet.
- `deleteFactCollection(factCollectionKey: FactCollectionKey, changeSetId: string) => Promise<void>` - Deletes a fact collection: removes every fact under the (scope-qualified) collection key. Idempotent: deleting a collection that does not exist is a no-op.
- `discardChangeSet(changeSetId: string) => void` - Closes the change set, discarding any staged data without committing. A no-op if it is not open.
- `flushChangeSet(changeSet: FactStoreChangeSet, db: FactStoreDb) => Promise<void>` - Writes the change set's staged data to persistent storage. Runs inside the caller's transaction: it must not open a transaction of its own or call withChangeSetAndDb.
- `getFactCollection(factCollectionKey: FactCollectionKey, changeSetId: string) => Promise<FactCollection | undefined>` - Returns the fact collection for the (scope-qualified) key, or undefined if it has no facts.
- `getFactCollectionsByType(factCollectionTypeKey: FactCollectionTypeKey, changeSetId: string) => Promise<FactCollection[]>` - Returns every fact collection of the given type for the queried scope, each holding its facts.
- `recordFact(factCollectionKey: FactCollectionKey, factTypeId: Fr, payload: Fr[], originBlock: OriginBlock | undefined, changeSetId: string) => Promise<void>` - Records a fact in a collection. The collection is created implicitly on the first fact recorded for its key: recording into an existing collection just adds to it. If `originBlock === undefined`, the fact is non-retractable: it survives reorgs. A defined origin block makes the fact retractable: on a prune below its block, it will be deleted. Idempotent: re-recording an identical fact (same collection, fact type, payload, and origin block) is a no-op. The same payload tied to a different origin block is a distinct fact.
- `rollbackToBlock(toBlock: number) => Promise<void>` - Rolls the store back to `toBlock` via applyRollback. Must be called inside a transaction owned by the caller, since it opens none of its own. Not meant to be overridden: subclasses implement applyRollback.
- `withChangeSet<R>(changeSetId: string, fn: (changeSet: FactStoreChangeSet) => R | Promise<R>) => Promise<R>` - Runs a change set operation over the staged data alone: takes the store's lock and calls `fn` with the change set's staged data, opening no db transaction. Use withChangeSetAndDb instead when `fn` reads the DB.
- `withChangeSetAndDb<R>(changeSetId: string, fn: (changeSet: FactStoreChangeSet, db: ReadonlyDb<TDb>) => Promise<R>) => Promise<R>` - Runs a change set operation that reads the DB. Takes the store's lock, opens a transaction, and calls `fn` with the change set's staged data and a read-only view of the DB (writes are staged in memory until flushChangeSet runs on commit). Prefer withChangeSet unless `fn` actually reads the DB. The lock makes the store thread safe: two operations issued concurrently (e.g. under `Promise.all`) cannot interleave across awaits, so `fn` can read staged data and write it back without handling atomicity itself.

### NoteDao

A Note Data Access Object, representing a note that was committed to the note hash tree, holding all of the information required to use it during execution and manage its state.

**Constructor**
```typescript
new NoteDao(note: Note, contractAddress: AztecAddress, owner: AztecAddress, storageSlot: Fr, randomness: Fr, noteNonce: Fr, noteHash: Fr, siloedNullifier: Fr, txHash: TxHash, l2BlockNumber: BlockNumber, l2BlockHash: string, txIndexInBlock: number, noteIndexInTx: number)
```

**Properties**
- `contractAddress: AztecAddress` - The address of the contract that created the note (i.e. the address used by the kernel during siloing).
- `l2BlockHash: string` - The L2 block hash in which the tx with this note was included. Used for note management while processing reorgs.
- `l2BlockNumber: BlockNumber` - The L2 block number in which the tx with this note was included. Used for note management while processing reorgs.
- `note: Note` - The packed content of the note, as will be returned in the getNotes oracle.
- `noteHash: Fr` - The inner hash (non-unique, non-siloed) of the note. Each contract determines how the note is hashed. Can be used alongside contractAddress and nonce to compute the uniqueNoteHash and the siloedNoteHash.
- `noteIndexInTx: number` - The index of the note within the tx (based on note hash position), used for ordering notes.
- `noteNonce: Fr` - The nonce that was injected into the note hash preimage in order to guarantee uniqueness.
- `owner: AztecAddress` - The owner of the note - generally the account that can spend the note.
- `randomness: Fr` - The randomness injected to the note hash preimage.
- `siloedNullifier: Fr` - The nullifier of the note, siloed by contract address. Note: Might be set as 0 if the note was added to PXE as nullified.
- `storageSlot: Fr` - The storage location of the note. This value is not used for anything in PXE, but we do index by storage slot since contracts typically make queries based on it.
- `txHash: TxHash` - The hash of the tx in which this note was created. Knowing the tx hash allows for efficient node queries e.g. when searching for txEffects.
- `txIndexInBlock: number` - The index of the tx within the block, used for ordering notes.

**Methods**
- `equals(other: NoteDao) => boolean` - Returns true if this note is equal to the `other` one.
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => NoteDao`
- `static fromString(str: string) => NoteDao`
- `getSize() => number` - Returns the size in bytes of the Note Dao.
- `static random(__namedParameters?: Partial<NoteDao>) => Promise<NoteDao>`
- `toBuffer() => Buffer`
- `toString() => string`

### NoteService

**Constructor**
```typescript
new NoteService(noteStore: NoteStore, aztecNode: AztecNode, anchorBlockHeader: BlockHeader, changeSetId: string)
```

**Methods**
- `getNotes(contractAddress: AztecAddress, owner: AztecAddress | undefined, storageSlot: Fr, status: NoteStatus, scopes: AztecAddress[]) => Promise<{ contractAddress: AztecAddress; isPending: boolean; ... }[]>` - Retrieves a set of notes stored in the database for a given contract address and storage slot. The query result is paginated using 'limit' and 'offset' values. Returns an object containing an array of note data.
- `syncNoteNullifiers(contractAddress: AztecAddress, scopes: AztecAddress[]) => Promise<void>` - Looks for nullifiers of active contract notes and marks them as nullified if a nullifier is found. Fetches notes from the NoteStore and checks which nullifiers are present in the onchain nullifier Merkle tree - up to the latest locally synced block. We use the locally synced block instead of querying the chain's 'latest' block to ensure correctness: notes are only marked nullified once their corresponding nullifier has been included in a block up to which the PXE has synced. This allows recent nullifications to be processed even if the node is not an archive node.
- `validateAndStoreNotes(requests: NoteValidationRequest[], scope: AztecAddress, validationTxData: ReadonlyMap<string, NoteValidationTxData>) => Promise<void>` - Validates and stores a batch of notes against the pre-fetched onchain context of their txs. For each request we must verify that: - the note actually exists in the corresponding tx effect (and thus in the note hash tree), and - the note has not already been nullified. Failing to do either would result in circuits getting either non-existent notes and failing to produce inclusion proofs for them, or getting nullified notes and producing duplicate nullifiers, both of which are catastrophic failure modes. Note that adding a note and removing it is *not* equivalent to never adding it in the first place. A nullifier emitted in a block that comes after note creation might result in the note being de-nullified by a chain reorg, so we must store both the note hash and nullifier block information.

### NoteStore

NoteStore manages the storage and retrieval of notes using an append-only model. Notes are written once (keyed by siloedNullifier) and never mutated. They might be deleted in case of reorg though. Nullifier emissions are recorded as separate append-only entries: a map from nullifier to the number of the block that emitted it. Reorgs are handled by delete-on-prune: the `chain-pruned` event triggers deletion of every note and nullifier originating on a reorg'd block.

Extends: `BaseStagingStore<NoteStoreChangeSet, NoteStoreDb>`

**Constructor**
```typescript
new NoteStore(store: AztecAsyncKVStore)
```

**Properties**
- `readonly storeName: string` - Unique name identifying this store (used for tracking staged stores from StagedWriteCoordinator)

**Methods**
- `addNotes(notes: NoteDao[], scope: AztecAddress, changeSetId: string) => Promise<void[]>` - Adds multiple notes to the notes store under the specified scope. Notes are stored using their siloedNullifier as the key, which provides uniqueness. Each note is indexed by multiple criteria for efficient retrieval.
- `applyNullifiers(siloedNullifiers: DataInBlock<Fr>[], changeSetId: string) => Promise<NoteDao[]>` - Records emission of the given siloed nullifiers, which causes notes to be considered nullified. Each nullifier gets an append-only entry recording the block number at which it was emitted. Every nullifier passed must correspond to a note already present in this store. Callers only apply nullifiers for notes of scopes they track, and a note is always discovered before the nullifier that spends it, so a nullifier with no matching note signals a bug (broken nonce/index discovery, a sync-ordering error, store corruption, etc). `applyNullifiers` is idempotent: a nullifier whose emission is already recorded (committed or currently staged) is skipped, so re-applying it neither re-writes the emission, changes note visibility, nor appears in the result.
- `applyRollback(toBlock: number, db: NoteStoreDb) => Promise<void>` - Deletes every note and nullifier emission originating on a block strictly above `toBlock`, as if nothing past that block height ever happened, retracting notes and nullifiers on a reorg.
- `beginChangeSet(changeSetId: string) => void` - Opens the change set, so its operations are accepted until commitChangeSet or discardChangeSet.
- `commitChangeSet(changeSetId: string) => Promise<void>` - Commits the change set's staged data: flushes it via flushChangeSet, then closes the change set. Runs inside the transaction owned by the caller. Not meant to be overridden: subclasses implement flushChangeSet.
- `discardChangeSet(changeSetId: string) => void` - Closes the change set, discarding any staged data without committing. A no-op if it is not open.
- `flushChangeSet(changeSet: NoteStoreChangeSet, db: NoteStoreDb) => Promise<void>` - Writes the change set's staged data to persistent storage. Runs inside the caller's transaction: it must not open a transaction of its own or call withChangeSetAndDb.
- `getNotes(filter: NotesFilter, changeSetId: string) => Promise<NoteDao[]>` - Retrieves notes based on the provided filter criteria. A note is considered nullified iff its corresponding nullifier emission has been recorded. All DB reads are kicked off before any await so IndexedDB does not auto-commit the transaction mid-read.
- `rollbackToBlock(toBlock: number) => Promise<void>` - Rolls the store back to `toBlock` via applyRollback. Must be called inside a transaction owned by the caller, since it opens none of its own. Not meant to be overridden: subclasses implement applyRollback.
- `withChangeSet<R>(changeSetId: string, fn: (changeSet: NoteStoreChangeSet) => R | Promise<R>) => Promise<R>` - Runs a change set operation over the staged data alone: takes the store's lock and calls `fn` with the change set's staged data, opening no db transaction. Use withChangeSetAndDb instead when `fn` reads the DB.
- `withChangeSetAndDb<R>(changeSetId: string, fn: (changeSet: NoteStoreChangeSet, db: ReadonlyDb<TDb>) => Promise<R>) => Promise<R>` - Runs a change set operation that reads the DB. Takes the store's lock, opens a transaction, and calls `fn` with the change set's staged data and a read-only view of the DB (writes are staged in memory until flushChangeSet runs on commit). Prefer withChangeSet unless `fn` actually reads the DB. The lock makes the store thread safe: two operations issued concurrently (e.g. under `Promise.all`) cannot interleave across awaits, so `fn` can read staged data and write it back without handling atomicity itself.

### PXE

Private eXecution Environment (PXE) is a library used by wallets to simulate private phase of transactions and to manage private state of users.

**Properties**
- `debug: PXEDebugUtils`

**Methods**
- `static create(__namedParameters: PXECreateArgs) => Promise<PXE>` - Creates an instance of a PXE by instantiating all the necessary data providers and services. Also triggers the registration of the protocol contracts and makes sure the provided node can be contacted.
- `executeUtility(call: FunctionCall, __namedParameters: ExecuteUtilityOpts) => Promise<UtilityExecutionResult>` - Executes a contract utility function.
- `getAccountSecretKeys(account: AztecAddress) => Promise<AccountPrivacySecretKeys>` - Retrieves the four privacy secret keys PXE holds for a registered account (nullifier-hiding, incoming-viewing, outgoing-viewing, tagging). These do NOT grant control over an account's assets, e.g. they are insufficient to impersonate the account or to spend notes, but they _do_ guard the account's privacy. Parties that have knowledge of these keys can decrypt all messages sent to the account, discover all of their on-chain activity, including notes, events, etc. Security is paramount when handling these keys, which should itself be a very rare occurrence. Other than exporting and then importing an account into a separate PXE/wallet, there is typically no need for a wallet to ever access these keys. Applications should NEVER be given access to them.
- `getContractArtifact(id: Fr) => Promise<ContractArtifact | undefined>` - Returns the contract artifact for a given contract class id, if it's registered in the PXE.
- `getContractInstance(address: AztecAddress) => Promise<ContractInstancePreimageWithAddress | undefined>` - Returns the address preimage of the contract instance at a given address, if it's registered in the PXE.
- `getContracts() => Promise<AztecAddress[]>` - Retrieves the addresses of contracts added to this PXE.
- `getPrivateEvents(eventSelector: EventSelector, filter: PrivateEventFilter) => Promise<PackedPrivateEvent[]>` - Returns the private events given search parameters.
- `getRegisteredAccounts() => Promise<CompleteAddress[]>` - Retrieves the user accounts registered on this PXE.
- `getSyncedBlockHeader() => Promise<BlockHeader>` - Returns the block header up to which the PXE has synced.
- `getTaggingSecretSources<K extends "address-derived" | "arbitrary-secret" | "handshake">(filter: { kind: K }) => Promise<Extract<{ kind: "address-derived"; sender: AztecAddress }, { kind: K }> | Extract<{ kind: "arbitrary-secret"; recipient: AztecAddress; secret: Point }, { kind: K }> | Extract<{ kind: "handshake"; recipient: AztecAddress; secret: Point }, { kind: K }>[]>` - Retrieves the tagging secret sources registered in this PXE, in their registered form. Without a filter it returns every source; pass `{ kind }` to narrow to a single variant. See RegisteredTaggingSecretSource.
- `profileTx(txRequest: TxExecutionRequest, __namedParameters: ProfileTxOpts) => Promise<TxProfileResult>` - Profiles a transaction, reporting gate counts (unless disabled) and returns an execution trace.
- `proveTx(txRequest: TxExecutionRequest, scopes: ProveTxOpts) => Promise<TxProvingResult>` - Proves the private portion of a simulated transaction, ready to send to the network (where validators prove the public portion).
- `registerAccount(keys: AccountPrivacyKeys, partialAddress: Fr) => Promise<CompleteAddress>` - Registers a user account in PXE. PXE holds the account's four privacy secret keys but only the *public* message-signing and fallback keys: their secret keys are withheld, since PXE is not trusted to hold them. Does nothing if the account is already registered. The four privacy secret keys can be retrieved later with getAccountSecretKeys.
- `registerContract(instance: ContractInstancePreimage) => Promise<AztecAddress>` - Registers a deployed contract instance so its private state can be synced and its functions simulated. The artifact for the class the instance runs must be registered separately via registerContractClass, before or after this call; registration performs no validation, so a missing or mismatched artifact only surfaces when the contract is later simulated. This is automatically called by aztec.js when deploying a contract.
- `registerContractClass(artifact: ContractArtifact) => Promise<void>` - Registers a contract class in the PXE without registering any associated contract instance with it.
- `registerTaggingSecretSource(source: TaggingSecretSource) => Promise<void>` - Registers a source from which this PXE derives the tagging secrets it scans for to discover incoming private logs. See TaggingSecretSource for the meaning of each variant. Does nothing if the source is already registered. After a new source is added we clear the cache tracking which contracts have finished syncing, so every contract re-syncs against the new source's logs (whose notes/events could belong to any contract). Already-discovered notes/events are not discarded.
- `removeTaggingSecretSource(source: RegisteredTaggingSecretSource) => Promise<void>` - Removes a previously registered tagging secret source, identified by its registered form (see getTaggingSecretSources). Does nothing if it was not registered.
- `simulateTx(txRequest: TxExecutionRequest, __namedParameters: SimulateTxOpts) => Promise<TxSimulationResult>` - Simulates a transaction based on the provided preauthenticated execution request. This will run a local simulation of private execution (and optionally of public as well), run the kernel circuits to ensure adherence to protocol rules (without generating a proof), and return the simulation results . Note that this is used with `ContractFunctionInteraction::simulateTx` to bypass certain checks. In that case, the transaction returned is only potentially ready to be sent to the network for execution.
- `stop() => Promise<void>` - Stops the PXE's operation queue and closes the backing store.
- `sync() => Promise<void>` - Triggers a sync of PXE state with the node, regardless of the `autoSync` config flag. Use this to batch syncs across composite flows when `autoSync` is disabled (e.g. one sync per simulate+send instead of one per inner PXE call). Serialized through the queue.

### PrivateEventStore

Stores decrypted private event logs. Append-only: events are never deleted during normal operation. Reorgs are handled by delete-on-prune, which removes every event originating on a reorg'd block.

Extends: `BaseStagingStore<PrivateEventStoreChangeSet, PrivateEventStoreDb>`

**Constructor**
```typescript
new PrivateEventStore(store: AztecAsyncKVStore)
```

**Properties**
- `logger: Logger`
- `readonly storeName: string` - Unique name identifying this store (used for tracking staged stores from StagedWriteCoordinator)

**Methods**
- `applyRollback(toBlock: number, db: PrivateEventStoreDb) => Promise<void>` - Deletes every event originating on a block strictly above `toBlock`, as if nothing past that block height ever happened, truncating the orphaned tail on a reorg. Scanning from `toBlock + 1` upward covers everything above the rollback target without needing to know the chain tip.
- `beginChangeSet(changeSetId: string) => void` - Opens the change set, so its operations are accepted until commitChangeSet or discardChangeSet.
- `commitChangeSet(changeSetId: string) => Promise<void>` - Commits the change set's staged data: flushes it via flushChangeSet, then closes the change set. Runs inside the transaction owned by the caller. Not meant to be overridden: subclasses implement flushChangeSet.
- `discardChangeSet(changeSetId: string) => void` - Closes the change set, discarding any staged data without committing. A no-op if it is not open.
- `flushChangeSet(changeSet: PrivateEventStoreChangeSet, db: PrivateEventStoreDb) => Promise<void>` - Writes the change set's staged data to persistent storage. Runs inside the caller's transaction: it must not open a transaction of its own or call withChangeSetAndDb.
- `getPrivateEvents(eventSelector: EventSelector, filter: PrivateEventStoreFilter, changeSetId: string) => Promise<PackedPrivateEvent[]>` - Returns the private events given search parameters.
- `rollbackToBlock(toBlock: number) => Promise<void>` - Rolls the store back to `toBlock` via applyRollback. Must be called inside a transaction owned by the caller, since it opens none of its own. Not meant to be overridden: subclasses implement applyRollback.
- `storePrivateEventLog(eventSelector: EventSelector, randomness: Fr, msgContent: Fr[], siloedEventCommitment: Fr, metadata: PrivateEventMetadata, changeSetId: string) => Promise<void>` - Store a private event log.
- `withChangeSet<R>(changeSetId: string, fn: (changeSet: PrivateEventStoreChangeSet) => R | Promise<R>) => Promise<R>` - Runs a change set operation over the staged data alone: takes the store's lock and calls `fn` with the change set's staged data, opening no db transaction. Use withChangeSetAndDb instead when `fn` reads the DB.
- `withChangeSetAndDb<R>(changeSetId: string, fn: (changeSet: PrivateEventStoreChangeSet, db: ReadonlyDb<TDb>) => Promise<R>) => Promise<R>` - Runs a change set operation that reads the DB. Takes the store's lock, opens a transaction, and calls `fn` with the change set's staged data and a read-only view of the DB (writes are staged in memory until flushChangeSet runs on commit). Prefer withChangeSet unless `fn` actually reads the DB. The lock makes the store thread safe: two operations issued concurrently (e.g. under `Promise.all`) cannot interleave across awaits, so `fn` can read staged data and write it back without handling atomicity itself.

### RecipientTaggingStore

Data provider of tagging data used when syncing the logs as a recipient. The sender counterpart of this class is called SenderTaggingStore. We have the providers separate for the sender and recipient because the algorithms are completely disjoint and there is not data reuse between the two.

Extends: `BaseStagingStore<RecipientTaggingChangeSet, RecipientTaggingDb>`

**Constructor**
```typescript
new RecipientTaggingStore(store: AztecAsyncKVStore)
```

**Properties**
- `readonly storeName: string` - Unique name identifying this store (used for tracking staged stores from StagedWriteCoordinator)

**Methods**
- `applyRollback() => Promise<void>` - No-op: both indexes refer to finalized blocks, which a prune cannot remove.
- `beginChangeSet(changeSetId: string) => void` - Opens the change set, so its operations are accepted until commitChangeSet or discardChangeSet.
- `commitChangeSet(changeSetId: string) => Promise<void>` - Commits the change set's staged data: flushes it via flushChangeSet, then closes the change set. Runs inside the transaction owned by the caller. Not meant to be overridden: subclasses implement flushChangeSet.
- `discardChangeSet(changeSetId: string) => void` - Closes the change set, discarding any staged data without committing. A no-op if it is not open.
- `flushChangeSet(changeSet: RecipientTaggingChangeSet, db: RecipientTaggingDb) => Promise<void>` - Writes the change set's staged data to persistent storage. Runs inside the caller's transaction: it must not open a transaction of its own or call withChangeSetAndDb.
- `getHighestAgedIndex(secret: AppTaggingSecret, changeSetId: string) => Promise<number | undefined>`
- `getHighestFinalizedIndex(secret: AppTaggingSecret, changeSetId: string) => Promise<number | undefined>`
- `rollbackToBlock(toBlock: number) => Promise<void>` - Rolls the store back to `toBlock` via applyRollback. Must be called inside a transaction owned by the caller, since it opens none of its own. Not meant to be overridden: subclasses implement applyRollback.
- `updateHighestAgedIndex(secret: AppTaggingSecret, index: number, changeSetId: string) => Promise<void>`
- `updateHighestFinalizedIndex(secret: AppTaggingSecret, index: number, changeSetId: string) => Promise<void>`
- `withChangeSet<R>(changeSetId: string, fn: (changeSet: RecipientTaggingChangeSet) => R | Promise<R>) => Promise<R>` - Runs a change set operation over the staged data alone: takes the store's lock and calls `fn` with the change set's staged data, opening no db transaction. Use withChangeSetAndDb instead when `fn` reads the DB.
- `withChangeSetAndDb<R>(changeSetId: string, fn: (changeSet: RecipientTaggingChangeSet, db: ReadonlyDb<TDb>) => Promise<R>) => Promise<R>` - Runs a change set operation that reads the DB. Takes the store's lock, opens a transaction, and calls `fn` with the change set's staged data and a read-only view of the DB (writes are staged in memory until flushChangeSet runs on commit). Prefer withChangeSet unless `fn` actually reads the DB. The lock makes the store thread safe: two operations issued concurrently (e.g. under `Promise.all`) cannot interleave across awaits, so `fn` can read staged data and write it back without handling atomicity itself.

### SenderTaggingStore

Data provider of tagging data used when syncing the sender tagging indexes. The recipient counterpart of this class is called RecipientTaggingStore. We have the data stores separate for sender and recipient because the algorithms are completely disjoint and there is not data reuse between the two.

Extends: `BaseStagingStore<SenderTaggingChangeSet, SenderTaggingDb>`

**Constructor**
```typescript
new SenderTaggingStore(store: AztecAsyncKVStore)
```

**Properties**
- `readonly storeName: string` - Unique name identifying this store (used for tracking staged stores from StagedWriteCoordinator)

**Methods**
- `applyRollback() => Promise<void>` - No-op: the last finalized index only ever advances from finalized blocks, and pending entries are keyed by tx hash rather than anchored to a block, so a prune removes neither.
- `beginChangeSet(changeSetId: string) => void` - Opens the change set, so its operations are accepted until commitChangeSet or discardChangeSet.
- `commitChangeSet(changeSetId: string) => Promise<void>` - Commits the change set's staged data: flushes it via flushChangeSet, then closes the change set. Runs inside the transaction owned by the caller. Not meant to be overridden: subclasses implement flushChangeSet.
- `discardChangeSet(changeSetId: string) => void` - Closes the change set, discarding any staged data without committing. A no-op if it is not open.
- `dropPendingIndexes(txHashes: TxHash[], changeSetId: string) => Promise<void>` - Drops all pending indexes corresponding to the given transaction hashes.
- `finalizePendingIndexes(txHashes: TxHash[], changeSetId: string) => Promise<void>` - Updates pending indexes corresponding to the given transaction hashes to be finalized and prunes any lower pending indexes. Applies to every secret the txs used, so the caller must hold tx-level evidence that the whole tx finalized. Callers holding evidence about a single secret must use finalizePendingIndexesOfSecret instead.
- `finalizePendingIndexesOfAPartiallyRevertedTx(txEffect: TxEffect, changeSetId: string) => Promise<void>` - Handles finalization of pending indexes for a transaction whose execution was partially reverted. Recomputes the siloed tags for each pending index of the given tx and checks which ones appear in the TxEffect's private logs (i.e., which ones made it onchain). Those that survived are finalized; those that didn't are dropped.
- `finalizePendingIndexesOfSecret(secret: AppTaggingSecret, txHashes: TxHash[], changeSetId: string) => Promise<void>` - Same as finalizePendingIndexes, but restricted to the pending indexes of a single secret. Finalizing every secret off single-secret evidence would be unsound: a tx whose execution partially reverted can have all of one secret's tags onchain and none of another's, and the second secret's indexes must not be recorded as finalized when they never reached the chain.
- `flushChangeSet(changeSet: SenderTaggingChangeSet, db: SenderTaggingDb) => Promise<void>` - Writes the change set's staged data to persistent storage. Runs inside the caller's transaction: it must not open a transaction of its own or call withChangeSetAndDb.
- `getLastFinalizedIndex(secret: AppTaggingSecret, changeSetId: string) => Promise<number | undefined>` - Returns the last (highest) finalized index for a given secret.
- `getLastUsedIndex(secret: AppTaggingSecret, changeSetId: string) => Promise<number | undefined>` - Returns the last used index for a given directional app tagging secret, considering both finalized and pending indexes.
- `getPendingTxs(secret: AppTaggingSecret, startIndex: number, endIndex: number, changeSetId: string) => Promise<PendingTx[]>` - Returns the pending txs whose highest index falls within [startIndex, endIndex) for a given directional app tagging secret. The highest index is what decides whether a tx belongs to the window, so it alone is matched against the bounds, and it is also the only index a caller needs: a tx whose highest index is onchain has every lower one onchain too. A secret holds at most one entry per tx hash, so no tx hash appears twice in the result.
- `mergePendingIndexes(ranges: TaggingIndexRange[], txHash: TxHash, changeSetId: string) => Promise<void>` - Stores pending index ranges, widening an existing entry for the same (secret, txHash) pair to the union of the stored and incoming ranges instead of throwing on a mismatch. Discovery from onchain logs needs this: it may see only the surviving (non-revertible phase) sub-range of a partially reverted tx recorded at prove time (the finalized receipt step of the sync resolves that difference), or indexes beyond a partially discovered entry when a tx from another PXE straddles a sync window boundary. Callers that record indexes at prove time must use `storePendingIndexes` instead, so that a range disagreement surfaces as a bug rather than being absorbed.
- `rollbackToBlock(toBlock: number) => Promise<void>` - Rolls the store back to `toBlock` via applyRollback. Must be called inside a transaction owned by the caller, since it opens none of its own. Not meant to be overridden: subclasses implement applyRollback.
- `storePendingIndexes(ranges: TaggingIndexRange[], txHash: TxHash, changeSetId: string) => Promise<void>` - Stores pending index ranges, rejecting any range that disagrees with an already-stored one.
- `withChangeSet<R>(changeSetId: string, fn: (changeSet: SenderTaggingChangeSet) => R | Promise<R>) => Promise<R>` - Runs a change set operation over the staged data alone: takes the store's lock and calls `fn` with the change set's staged data, opening no db transaction. Use withChangeSetAndDb instead when `fn` reads the DB.
- `withChangeSetAndDb<R>(changeSetId: string, fn: (changeSet: SenderTaggingChangeSet, db: ReadonlyDb<TDb>) => Promise<R>) => Promise<R>` - Runs a change set operation that reads the DB. Takes the store's lock, opens a transaction, and calls `fn` with the change set's staged data and a read-only view of the DB (writes are staged in memory until flushChangeSet runs on commit). Prefer withChangeSet unless `fn` actually reads the DB. The lock makes the store thread safe: two operations issued concurrently (e.g. under `Promise.all`) cannot interleave across awaits, so `fn` can read staged data and write it back without handling atomicity itself.

### StagedWriteCoordinator

StagedWriteCoordinator simulates a database transaction across the PXE stores, which some underlying KV stores (e.g. IndexedDB) cannot provide on their own for long-running async operations. It uses a staged writes pattern: 1. When a change set is opened, a unique ID is created 2. While a change set is open, all writes are staged under its ID, and reads observe the staged data 3. On commit, the staged data is promoted to persistent storage 4. On abort, staged data is discarded Only one change set can be open at a time: begin throws if one already is. Supporting overlapping change sets would mean merging them when one of them commits — a problem in its own right, and one no caller needs solved. Avoiding that throw is up to the caller, which must serialize whatever opens change sets, e.g. with a queue. Change sets nonetheless carry an ID, because aborting one does not cancel the async work it started. An oracle that was mid-write when the operation failed still attempts that write afterwards, naming the aborted ID. The stores reject it, since the change set it names is no longer open. Without the ID there would be nothing to reject it by, and the late write would be promoted by whichever change set commits next.

**Constructor**
```typescript
new StagedWriteCoordinator(args: StagedWriteCoordinatorArgs)
```

**Methods**
- `abort(changeSetId: string) => void` - Aborts by discarding all staged data. Every store gets to drop its staged data even if an earlier one failed, and the change set always ends, so a failed abort never blocks later change sets.
- `begin() => string` - Opens a change set and returns its ID for staged writes. All or nothing: if a store fails to open the change set, the stores that already opened it discard it again and nothing is left active, so a later change set can still be opened on this PXE instance.
- `commit(changeSetId: string) => Promise<void>` - Commits by promoting all staged data to persistent storage. Unlike begin and abort, a failed commit leaves the change set open, so the caller must still abort it before another can be opened.

### TaggingSecretSourcesStore

Stores the sources from which directional app tagging secrets are derived during recipient log synchronization. Two kinds of source are held: - Sender addresses: combined with a recipient to derive a shared tagging secret via ECDH. These are global (not scoped to a recipient) because the per-recipient binding comes from re-mixing the recipient's keys during derivation, so each account only ever derives secrets meant for it. - Pre-shared tagging secrets: shared secret points registered directly, bypassing ECDH. These are scoped to a specific recipient, since the derivation of the directional app tagging secret does not require any secret recipient data: given the original secret anyone can derive a recipient's app-siloed directional tagging secret, and so these must not be reused across recipients to preserve privacy. Each carries the SharedSecretKind it was registered through, which determines the tag streams it is scanned under.

**Constructor**
```typescript
new TaggingSecretSourcesStore(store: AztecAsyncKVStore)
```

**Methods**
- `addSender(address: AztecAddress) => Promise<boolean>`
- `addSharedSecret(recipient: AztecAddress, kind: SharedSecretKind, secret: Point) => Promise<boolean>` - Registers a pre-shared tagging secret scoped to a recipient.
- `getAllSharedSecrets() => Promise<{ kind: SharedSecretKind; recipient: AztecAddress; secret: Point }[]>` - Returns every registered pre-shared tagging secret, each paired with the recipient it is scoped to.
- `getSenders() => Promise<AztecAddress[]>`
- `getSharedSecretsForRecipient(recipient: AztecAddress) => Promise<SharedSecret[]>` - Returns the pre-shared tagging secrets registered for a given recipient.
- `removeSender(address: AztecAddress) => Promise<boolean>`
- `removeSharedSecret(recipient: AztecAddress, kind: SharedSecretKind, secret: Point) => Promise<boolean>` - Removes a pre-shared tagging secret scoped to a recipient. Both the secret and its kind must match.

## Interfaces

### BlockSynchronizerConfig

Configuration settings for the block synchronizer.

**Properties**
- `autoSync: boolean` - Whether PXE should automatically sync with the node before each operation (simulate, prove, profile, execute utility, get private events, update contract). When disabled, callers (e.g. wallets) are responsible for calling `pxe.sync()` explicitly
- `l2BlockBatchSize: number` - Maximum amount of blocks to pull from the stream in one request when synchronizing
- `syncChainTip?: "proposed" | "checkpointed" | "proven" | "finalized"` - Which chain tip to sync to (proposed, checkpointed, proven, finalized)

### ContractSyncConfig

Configuration settings for the contract sync service.

**Properties**
- `concurrentContractSyncEnabled: boolean` - Whether PXE speculatively syncs contracts it predicts will follow the one requested, running them concurrently with it instead of waiting for execution to reach them. When enabled, repeated flows sync faster, but a wrong prediction spends unnecessary node requests syncing contracts the operation never uses. Experimental, off by default.

### ExecutionHooks

Hooks that PXE invokes during client-side simulation to gate or steer operations that the protocol does not restrict on its own. They give the wallet a chance to apply custom policies (e.g. prompting the user, consulting a dynamic allowlist, or inspecting call arguments) before the execution proceeds. All hooks are optional, and when a hook is absent PXE applies a safe default. For example, authorizeUtilityCall is called whenever a utility function makes a cross-contract call. A call made by a malicious contract could leak private information, so the hook lets the wallet decide, per-call, whether to allow it. A static allowlist would not work here because neither the app nor the wallet can predict ahead of time which contracts will be invoked during execution. Calls to standard contracts (such as the HandshakeRegistry) bypass this hook and are always authorized. When the hook is absent, cross-contract utility calls are denied. Note: hooks are unrelated to authentication witnesses (authwits). Authwits are an on-chain mechanism where a contract verifies that a caller was authorized by a specific account; hooks are a client-side PXE concern that gates execution before it proceeds.

**Properties**
- `authorizeUtilityCall?: AuthorizeUtilityCall` - Called when a contract attempts a cross-contract utility call. Calls are denied when absent.
- `resolveCustomRequest?: ResolveCustomRequest` - Resolves a custom, caller-defined request a circuit cannot serve from local state. Any contract can issue one, so an implementor should verify both the request `kind` and the issuing contract (its address and class ID) before fulfilling it. Rejected when absent; see ResolveCustomRequest.
- `resolveTaggingSecretStrategy?: ResolveTaggingSecretStrategy` - Resolves a message's tagging secret when none is already established for the sender/recipient pair, letting the wallet apply per-recipient policy. PXE applies a default when absent. See ResolveTaggingSecretStrategy for the request shape and defaults.

### KernelProverConfig

Configuration settings for the prover factory

**Properties**
- `proverEnabled?: boolean` - Whether we are running with real proofs

### OperationContributor

Contributes work to every synced operation (e.g. writes into its change set). The operation waits for a contributor's work to settle before deciding its change set, and informs it of the outcome.

**Methods**
- `onOperationEnd(changeSetId: string, outcome: "committed" | "discarded") => void` - Called once the operation's change set has been committed or discarded. A throw is logged and swallowed: the outcome is already decided by this point, so it cannot change it.
- `settle(changeSetId: string) => Promise<void>` - Waits for any work the contributor still has in flight. Awaited before the operation's change set is decided, so that no contributor is still writing when it is committed or discarded. A rejection causes the operation to discard instead of commit.

## Functions

### anchoredTipBlockNumbers
```typescript
function anchoredTipBlockNumbers(tips: L2Tips, anchorBlockNumber: number) => TipBlockNumbers
```
Projects the live chain tips to the block numbers used for classification, capped at the anchor block. A utility execution reads against a fixed anchor block, and every other node query in the oracle is bounded by it. Capping the proven/finalized tips at the anchor keeps origin-state consistent with that view and deterministic across runs: an origin block at or before the anchor classifies exactly as it would against the live tips, while an origin block above the anchor is reported `Pending` rather than trusting tips that look past the anchor.

### classifyOriginBlockState
```typescript
function classifyOriginBlockState(blockNumber: number, tips: TipBlockNumbers) => OriginBlockState
```
Classifies an origin block by number against the chain tips. A surviving retractable fact's origin block is guaranteed canonical (a reorg would have pruned the fact), so a number comparison is sufficient.

### composeHooks
```typescript
function composeHooks(hooks: ExecutionHooks) => ExecutionHooks | undefined
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
function enrichPublicSimulationError(err: SimulationError, contractStore: ContractStore, contractClassService: ContractClassService, anchorHeader: BlockHeader, logger: Logger) => Promise<void>
```

### enrichSimulationError
```typescript
function enrichSimulationError(err: SimulationError, contractStore: ContractStore, contractClassService: ContractClassService, anchorHeader: BlockHeader, logger: Logger) => Promise<void>
```
Adds contract and function names to a simulation error, if they can be found in the PXE database

### getCliPXEOptions
```typescript
function getCliPXEOptions() => CliPXEOptions & KernelProverConfig & { dataDirectory?: string; dataStoreMapSizeKb: number } & Partial<Pick<L1ContractAddresses, "rollupAddress">> & { l1ChainId: number; rollupVersion: number } & Pick<L1ContractAddresses, "rollupAddress"> & BlockSynchronizerConfig & ContractSyncConfig
```
Creates an instance of CliPxeOptions out of environment variables

### getPXEConfig
```typescript
function getPXEConfig() => PXEConfig
```
Creates an instance of PXEConfig out of environment variables using sensible defaults for integration testing if not set.

### getPackageInfo
```typescript
function getPackageInfo() => { name: string; version: string }
```

### logContractMessage
```typescript
function logContractMessage(logger: Logger, level: "silent" | "fatal" | "error" | "warn" | "info" | "verbose" | "debug" | "trace", message: string, fields: Fr[]) => void
```
Formats and emits a single contract log message through the given logger.

### openBrowserStore
```typescript
function openBrowserStore(name: string, schemaVersion: number, config: { dataStoreMapSizeKb?: number; l1ChainId: number; rollupAddress: EthAddress }, log: Logger) => Promise<AztecSQLiteOPFSStore>
```
Opens the persistent browser (sqlite-opfs) store selected by `name` and identity `(config.l1ChainId, config.rollupAddress, schemaVersion)` triple. A store exists per identity: reopening with the same identity returns the same data, a different identity selects a different (possibly fresh) store.

### openStore
```typescript
function openStore(name: string, schemaVersion: number, config: IdentityStoreConfig, bindings?: LoggerBindings) => Promise<AztecLMDBStoreV2>
```
Opens the persistent LMDB store selected by `name` and identity triple `(l1ChainId, rollupAddress, schemaVersion)`. A store exists per identity: reopening with the same identity returns the same data, a different identity selects a different (possibly fresh) store. Callers wanting an ephemeral store use `openTmpStore` explicitly instead.

### originBlockStateFromNumber
```typescript
function originBlockStateFromNumber(value: number) => OriginBlockState
```
Parses a numeric origin-block-state discriminant, rejecting unknown values.

### runOperation
```typescript
function runOperation<T>(args: RunOperationArgs, fn: () => Promise<T>) => Promise<T>
```
Runs `fn` as the operation's work and decides its change set. On success: 1. Waits for every contributor to settle. A rejection vetoes the commit and the failure path below runs instead. 2. Commits the change set. 3. Notifies contributors of the outcome. On failure: 1. Drains contributors, logging failures instead of propagating them so the discard runs to completion and the error that aborted the operation is not masked. 2. Aborts the change set. 3. Notifies contributors of the outcome. 4. Rethrows.

### stripAztecnrLogPrefix
```typescript
function stripAztecnrLogPrefix(message: string) => { kind: CONTRACT_LOG_KIND; message: string }
```

### toFactWithOriginState
```typescript
function toFactWithOriginState(fact: Fact, tips: TipBlockNumbers) => FactWithOriginState
```
Enriches a stored fact with the chain state of its origin block (when retractable).

## Types

### AccountPrivacyKeys
```typescript
type AccountPrivacyKeys = AccountPrivacySecretKeys & { masterFallbackPublicKey: PublicKey; masterMessageSigningPublicKey: PublicKey }
```
The keys needed to register an account: the four privacy secret keys the key store holds, plus the *public* message-signing and fallback keys. The message-signing and fallback secret keys are withheld from the key store (and hence from PXE, which embeds it), since it is not trusted to hold them: only their public keys are needed (to reconstruct the account's address).

### AccountPrivacySecretKeys
```typescript
type AccountPrivacySecretKeys = unknown
```
The four master privacy secret keys the key store holds for an account: the nullifier-hiding, incoming-viewing, outgoing-viewing, and tagging keys.

### AuthorizeUtilityCall
```typescript
type AuthorizeUtilityCall = (request: UtilityCallAuthorizationRequest) => Promise<UtilityCallAuthorizationResponse>
```
Hook called when a utility function attempts a cross-contract call. Returns a response indicating whether the call is authorized and an optional denial reason.

### CONTRACT_LOG_KIND
```typescript
type CONTRACT_LOG_KIND = "aztecnr" | "user"
```

### ChangeSetId
```typescript
type ChangeSetId = string
```
Identifies a change set: the writes staged between a StagedWriteCoordinator.begin and its matching commit or abort, which are promoted to the database or dropped as a unit.

### CliPXEOptions
```typescript
type CliPXEOptions = unknown
```

### ContractNameResolver
```typescript
type ContractNameResolver = (address: AztecAddress) => Promise<string | undefined>
```
Resolves a contract address to a human-readable name, if available.

### CustomRequest
```typescript
type CustomRequest = unknown
```
A custom, caller-defined request resolved via the ResolveCustomRequest hook. It carries no fixed meaning: `kind` selects the request type so one hook can serve many such types, and `payload` holds the opaque, request-specific arguments. The resolver answers by whatever means it needs (local state, a third party, offchain data).

### DEFAULT_TAGGING_SECRET_STRATEGY
```typescript
type DEFAULT_TAGGING_SECRET_STRATEGY = TaggingSecretStrategy
```
The strategy PXE applies to both delivery modes when no `resolveTaggingSecretStrategy` hook is configured.

### ExecuteUtilityOpts
```typescript
type ExecuteUtilityOpts = unknown
```
Options for PXE.executeUtility.

### Fact
```typescript
type Fact = unknown
```
A fact as returned by the fact store.

### FactCollection
```typescript
type FactCollection = unknown
```
A fact collection as returned by the store.

### FactCollectionWithOriginState
```typescript
type FactCollectionWithOriginState = unknown
```
A fact collection whose facts carry origin-block state.

### FactWithOriginState
```typescript
type FactWithOriginState = unknown
```
A fact enriched with origin-block state. `originBlock` is undefined for a non-retractable fact.

### IdentityStoreConfig
```typescript
type IdentityStoreConfig = unknown
```
Location and identity inputs for opening an identity-partitioned PXE-side store.

### NotesFilter
```typescript
type NotesFilter = unknown
```
A filter used to fetch notes.

### ORACLE_VERSION_MAJOR
```typescript
type ORACLE_VERSION_MAJOR = 31
```

### ORACLE_VERSION_MINOR
```typescript
type ORACLE_VERSION_MINOR = 0
```

### OriginBlock
```typescript
type OriginBlock = unknown
```
The block a retractable fact originates from.

### PXEConfig
```typescript
type PXEConfig = KernelProverConfig & DataStoreConfig & ChainConfig & BlockSynchronizerConfig & ContractSyncConfig
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
type PXE_DATA_SCHEMA_VERSION = 16
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

### RegisteredTaggingSecretSource
```typescript
type RegisteredTaggingSecretSource = Exclude<TaggingSecretSource, { kind: "handshake" }> | { kind: "handshake"; recipient: AztecAddress; secret: Point }
```
The registered form of a TaggingSecretSource.

### ResolveCustomRequest
```typescript
type ResolveCustomRequest = (request: CustomRequest) => Promise<Fr[]>
```
Hook resolving a CustomRequest. The resolver produces the response however it needs to.

### ResolveTaggingSecretStrategy
```typescript
type ResolveTaggingSecretStrategy = (request: TaggingSecretStrategyRequest) => Promise<TaggingSecretStrategy>
```
Hook returning the TaggingSecretStrategy for an outgoing message.

### RetractableFactOrigin
```typescript
type RetractableFactOrigin = OriginBlock & { blockState: OriginBlockState }
```
A retractable fact's origin block annotated with that block's current chain state.

### SimulateTxOpts
```typescript
type SimulateTxOpts = unknown
```
Options for PXE.simulateTx.

### TaggingSecretSource
```typescript
type TaggingSecretSource = { kind: "address-derived"; sender: AztecAddress } | { kind: "arbitrary-secret"; recipient: AztecAddress; secret: Point } | { ephPk: Fr; kind: "handshake"; recipient: AztecAddress }
```
A source from which PXE derives the tagging secrets it scans for to discover incoming private logs.

### TaggingSecretStrategy
```typescript
type TaggingSecretStrategy = { type: "non-interactive-handshake" } | { type: "interactive-handshake" } | { type: "address-derived" } | { secret: Point; type: "arbitrary-secret" }
```
How a message's tagging secret is chosen: the wallet's strategy, returned by the `resolveTaggingSecretStrategy` hook when no onchain handshake has been registered for the sender/recipient pair. This is intent (plus, for an arbitrary secret, the raw material); PXE resolves it into the secret it hands the contract.

### TaggingSecretStrategyRequest
```typescript
type TaggingSecretStrategyRequest = unknown
```
Information about the message delivery requesting a tagging secret strategy.

### TipBlockNumbers
```typescript
type TipBlockNumbers = unknown
```
The two chain-tip block numbers needed to classify an origin block (`finalized <= proven` always holds).

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

### pxeCliConfigMappings
```typescript
type pxeCliConfigMappings = ConfigMappingsType<CliPXEOptions>
```

### pxeConfigMappings
```typescript
type pxeConfigMappings = ConfigMappingsType<PXEConfig>
```

## Enums

### OriginBlockState
Chain state of a retractable fact's origin block, mirroring the L2 chain tips. - `Pending`: above the proven tip. - `Proven`: proof on L1 but not yet finalized. - `Finalized`: L1-finalized. The numeric discriminants must stay in sync with the Noir `OriginBlockState` in `noir-projects/aztec-nr/aztec/src/facts/origin_state.nr`: PXE serializes this value into the `Fact` oracle response and Noir deserializes it via `from_u8`, which rejects any value outside this set.

Values: `3`, `1`, `2`
