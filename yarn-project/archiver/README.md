# Archiver

The archiver fetches onchain data from L1 and stores it locally in a queryable form. It pulls:
- **Checkpoints** (containing L2 blocks) from `CheckpointProposed` events on the Rollup contract
- **L1-to-L2 messages** from `MessageSent` events on the Inbox contract

The interfaces `L2BlockSource`, `L2LogsSource`, and `ContractDataSource` define how consumers access this data. Interface `L2BlockSink` allows other subsystems, such as the validator client, to push not-yet-checkpointed blocks into the archiver.

## Events

The archiver emits events for other subsystems to react to state changes:

- **`L2PruneUnproven`**: Emitted before unwinding checkpoints due to epoch prune. Contains the epoch number and affected blocks. Subscribers (e.g., world-state) use this to prepare for the unwind.
- **`L2PruneUncheckpointed`**: Emitted when provisional blocks are pruned due to checkpoint mismatch or slot expiration. Contains the slot number and affected blocks.
- **`L2BlockProven`**: Emitted when the proven checkpoint advances. Contains the block number, slot, and epoch.
- **`InvalidAttestationsCheckpointDetected`**: Emitted when a checkpoint with invalid attestations is encountered during sync.

Note that most subsystems handle these events not by subscribing but by polling the archiver using an `L2BlockStream`. This means that, if the node stops while a subsystem has not yet processed an event, the block stream will detect it and have the subsystem reprocess it.

## Sync Process

The archiver runs a periodic sync loop with two phases:

1. **Process queued blocks**: External subsystems (e.g., sequencer) can push blocks directly via `addBlock()`
2. **Sync from L1**: Pull checkpoints and messages from L1 contracts

```
sync()
├── processQueuedBlocks()         # Handle blocks pushed via addBlock()
├── pruneOrphanProposedBlocks()   # Wall-clock prune of orphan block-only tips
└── syncFromL1()
    ├── handleL1ToL2Messages()    # Sync messages from Inbox contract
    ├── handleCheckpoints()       # Sync checkpoints from Rollup contract
    ├── pruneUncheckpointedBlocks()  # Prune provisional blocks from expired slots
    ├── handleEpochPrune()        # Proactive unwind before proof window expires
    └── checkForNewCheckpointsBeforeL1SyncPoint()  # Handle L1 reorg edge case
```

Each sync iteration pins the current L1 block number at the start and uses it as an upper bound for all queries. This ensures consistent data retrieval even if L1 advances during the iteration.

Two independent syncpoints track progress on L1:
- `blocksSynchedTo`: L1 block number for checkpoint events
- `messagesSynchedTo`: L1 block ID (number + hash) for messages

### L1-to-L2 Messages

Messages are synced from the Inbox contract. The sync compares local state (message count and rolling hash) against the Inbox contract state on L1, downloads any missing messages, and verifies consistency afterwards. On success, the syncpoint advances to the current L1 block. On failure (L1 reorg or inconsistency), the syncpoint rolls back to the last known-good message and the operation retries (up to 3 times within the same sync iteration).

1. Query Inbox state at the current L1 block (message count + rolling hash)
2. Compare local state against remote
3. If they match, advance syncpoint and return
4. If mismatch, fetch `MessageSent` events in batches and store them
   - If storing fails due to a rolling hash mismatch (indicating an L1 reorg changed or removed messages), find the last common message with L1, delete everything after, reset the syncpoint, and retry
5. After storing, verify local state matches the remote state queried in step 1
   - If still mismatched (e.g., messages missed due to a concurrent L1 reorg), rollback and retry
6. On success, advance the syncpoint

The syncpoint and the `inboxTreeInProgress` marker (which tracks which checkpoint's messages are currently being filled on L1) are updated atomically. The marker is only advanced after messages are stored, so concurrent reads don't see an unsealed checkpoint as readable before its messages are available.

### Checkpoints

Checkpoints are synced from the Rollup contract via `handleCheckpoints()`:

1. Query rollup status (proven/pending checkpoint numbers, archive roots)
2. Update local proven checkpoint if it matches L1 (called early to update as soon as possible)
3. **Reorg detection**: Compare the local pending checkpoint's archive root against L1
   - If not in L1 chain, unwind checkpoints until a common ancestor is found
4. Retrieve `CheckpointProposed` events in batches
5. For each checkpoint:
   - Verify archive matches (checkpoint still in chain)
   - Validate attestations (2/3 + 1 committee signatures required)
   - Skip invalid checkpoints (see "Invalid Checkpoints" in Edge Cases)
   - Verify `inHash` matches expected value (see below)
   - Store valid checkpoints with their blocks
6. Update proven checkpoint again (may have advanced after storing new checkpoints)
7. Handle epoch prune if applicable
8. Check for checkpoints behind syncpoint (L1 reorg case)

The `inHash` is a hash of all L1-to-L2 messages consumed by a checkpoint. The archiver computes the expected `inHash` from locally stored messages and compares it against the checkpoint header. A mismatch indicates a bug (messages out of sync with checkpoints) and causes a fatal error.

The `blocksSynchedTo` syncpoint is updated:
- When checkpoints are stored: set to the L1 block of the last stored checkpoint
- When an invalid checkpoint is processed: advanced past it to avoid re-downloading on every iteration
- When the L2 chain is empty and there are still no checkpoints on L1: set to current L1 block
- When rolling back due to L1 reorg or missing checkpoints: set to the target L1 block to re-fetch from

Note that the `blocksSynchedTo` pointer is NOT updated during normal sync when there are no new checkpoints. This protects against small L1 reorgs that could add a checkpoint on an L1 block we have flagged as already synced.

The `messagesSynchedTo` pointer is always advanced to the current L1 block on success. If a rolling hash mismatch or post-download inconsistency is detected, the pointer rolls back to the last common message and the operation retries. The rolling hash chain and pre/post-sync consistency checks provide the primary reorg protection.

### Block Queue

The archiver implements `L2BlockSink`, allowing other subsystems to push blocks before they appear on L1:

```typescript
archiver.addBlock(block);  // Queues block for processing
```

Queued blocks are processed at the start of each sync iteration. This allows the sequencer to make blocks available locally before checkpoint publication. This is used to make the `proposed` chain (ie blocks that have been broadcasted via p2p but not checkpointed on L1) available to consumers.

Blocks added via `addBlock()` are considered "provisional" until they appear in an L1 checkpoint. These provisional blocks may need to be reconciled when:
- **Checkpoint mismatch**: A checkpoint lands on L1 with different blocks than stored locally (e.g., a different proposer won the slot)
- **Slot expiration**: An L2 slot ends without any checkpoint being mined on L1
- **Orphan proposed block**: Under proposer pipelining, a proposer can broadcast a block-only proposal but never the matching `CheckpointProposal` (e.g. it crashes before assembling the checkpoint). The provisional block then has no proposed checkpoint backing it.

When `handleCheckpoints()` processes incoming checkpoints, it compares archive roots of local blocks against the checkpoint's blocks. If they differ, local blocks are pruned and replaced with the checkpoint's blocks. After checkpoint sync, `pruneUncheckpointedBlocks()` removes any remaining provisional blocks from slots that have ended. Independently, `pruneOrphanProposedBlocks()` runs on wall-clock time (so it fires during quiet L1 periods) and removes a block-only tip once the checkpoint proposal receive deadline plus the `orphanProposedBlockPruneGraceSeconds` window has elapsed. All three cases emit `L2PruneUncheckpointed`.

### Querying Block Data

When querying the archiver, be aware of the distinction between proposed and checkpointed blocks:

- `getBlockHeader('latest')` / `getBlockNumber()`: Returns the latest block **including** proposed blocks
- `getCheckpointedL2BlockNumber()`: Returns only the count of **checkpointed** blocks (synced from L1)

Use checkpointed queries when the result must reflect L1 state (e.g., determining if an epoch is complete for proving). Use `'latest'` when you need the most recent block regardless of L1 confirmation (e.g., serving RPC queries to users).

### Edge Cases

#### L1 Reorgs

Both message and checkpoint sync detect L1 reorgs by comparing local state against L1. When detected, they find the last common ancestor and rollback.

**Messages**: Each stored message includes its rolling hash. During sync, if the local last message's rolling hash doesn't match L1, the archiver walks backwards through local messages, querying L1 for each one, until it finds a message with a matching rolling hash. Everything after that message is deleted, and the syncpoint is rolled back.

**Checkpoints**: When the archiver queries the Rollup contract for the archive root at the local pending checkpoint number, and it doesn't match the local archive root, the local checkpoint is no longer in L1's chain. The archiver walks backwards through local checkpoints, querying `archiveAt()` for each, until it finds one that matches. All checkpoints after that are unwound.

**Example**: The archiver has synced up to checkpoint 15. An L1 reorg replaces checkpoint 14 and 15 with different content. On the next sync:
1. Archiver queries `archiveAt(15)` and gets a different archive root than stored locally
2. Archiver queries `archiveAt(14)` — still different
3. Archiver queries `archiveAt(13)` — matches
4. Archiver unwinds checkpoints 14 and 15
5. Next sync iteration re-fetches the new checkpoints 14 and 15

#### Epoch Prune

If a prune would occur on the next checkpoint submission (checked via `canPruneAtTime`), the archiver preemptively unwinds to the proven checkpoint.

This handles the case where an epoch's proof submission window has passed without a valid proof being submitted. The Rollup contract will prune all unproven checkpoints on the next submission. Rather than wait for that to happen and then react, the archiver detects this condition and unwinds proactively. This keeps the local state consistent with what L1 will look like after the next checkpoint. It also means that the sequencer or validator client will build the next block with the unwind having already taken place.

**Example**: The proven checkpoint is 10, and pending checkpoints 11-15 exist locally. The proof submission window for the epoch containing checkpoint 11 will expire. On sync:
1. Archiver calls `canPruneAtTime()` with the next L1 block's timestamp — returns true
2. Archiver unwinds checkpoints 11-15
3. Emits `L2PruneUnproven` event so subscribed subsystems can react
4. Local state now shows checkpoint 10 as latest

#### Checkpoints Behind Syncpoint

If after processing all logs the local checkpoint count is less than L1's pending checkpoint count, an L1 reorg may have added checkpoints _behind_ the syncpoint. The archiver rolls back the syncpoint to re-fetch.

This handles a subtle L1 reorg scenario: an L1 reorg doesn't replace existing checkpoints but adds new ones in blocks the archiver already processed. Since the archiver only queries events starting from `blocksSynchedTo`, it would miss these new checkpoints.

> [!NOTE]
> This scenario only occurs when `blocksSynchedTo` was advanced _without_ storing a checkpoint — specifically when the chain is empty or when an invalid checkpoint was processed (and skipped). In normal operation, `blocksSynchedTo` is set to the L1 block of the last stored checkpoint, so any L1 reorg that adds checkpoints would also change the archive root and be caught by the L1 Reorgs check (step 3 in checkpoint sync).

**Example**: The archiver has synced to L1 block 1000 with checkpoint 10. An L1 reorg at block 950 adds a new checkpoint 11 in block 960 (which was previously empty). On sync:
1. Archiver queries events from block 1001 onwards — finds nothing
2. Archiver queries Rollup contract — pending checkpoint is 11
3. Local checkpoint count (10) < L1 pending (11)
4. Archiver rolls back `blocksSynchedTo` to the L1 block of checkpoint 10
5. Next sync iteration re-queries from that point and finds checkpoint 11

#### Invalid Checkpoints

When the archiver encounters a checkpoint with invalid attestations, it skips it and continues processing subsequent checkpoints. It also advances `blocksSynchedTo` past the invalid checkpoint to avoid re-downloading it on every iteration.

This handles [delayed attestation verification](https://github.com/AztecProtocol/engineering-designs/pull/69): the Rollup contract no longer validates committee attestations on L1. Instead, attestations are posted in calldata and L2 nodes verify them during sync. Checkpoints with invalid attestations (insufficient signatures, wrong signers, or invalid signatures) are skipped. An honest proposer will eventually call `invalidate` on the Rollup contract to remove these checkpoints.

The archiver exposes `pendingChainValidationStatus` for the sequencer to know if there's an invalid checkpoint that needs purging before posting a new one. If invalid, this status contains the data needed for the `invalidate` call. When multiple consecutive invalid checkpoints exist, the status references the earliest one (invalidating it automatically purges descendants).

> [!WARNING]
> If a malicious committee attests to a descendant of an invalid checkpoint, nodes should ignore these descendants unless proven. This is not yet implemented — nodes assume honest committee majority.

**Example**: Chain has progressed to checkpoint 10. Then:
1. Checkpoint 11 posted with invalid attestations → archiver reports 10 as latest, `pendingChainValidationStatus` points to 11
2. Checkpoint 11 purged, new invalid checkpoint 11 posted → status updates to new checkpoint 11
3. Checkpoint 12 with invalid attestations posted → no change (status still points to 11)
4. Checkpoint 11 purged and reposted with valid attestations → archiver syncs checkpoint 11, status becomes valid

