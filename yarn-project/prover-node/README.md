# Prover Node: Split Proving

When `PROVER_NODE_SPLIT_PROVING=true` (default), epoch proving is decomposed into independent jobs coordinated through the proving broker. Proving starts as soon as checkpoints are posted to L1, without waiting for epoch completion.

## Three Job Types

### 1. Checkpoint Sub-Tree (`CheckpointSubTreeJob`)

Proves a single checkpoint's blocks — base rollups, tx merges, block roots, and block merges. Outputs `BlockRollupPublicInputs` (the final block proofs). Needs NO epoch-level context.

- **Trigger**: Checkpoint posted to L1
- **Capacity**: Counts against `proverNodeMaxPendingJobs`
- **Output**: Sub-tree completion marker on broker (serialized block proofs)

### 2. Top-Tree (`TopTreeJob`)

Loads pre-computed block proofs from sub-tree markers, computes blob/out-hash state from archiver data, then proves checkpoint roots through root rollup. No block re-processing.

- **Trigger**: Epoch complete AND all sub-tree markers fulfilled
- **Capacity**: Does NOT count against limit (lightweight orchestration)
- **Output**: Top-tree completion marker on broker (serialized `EpochProofPayload`)

### 3. Root Rollup Publish (`RootRollupPublishJob`)

Loads the final epoch proof from the top-tree marker and submits it to L1. Only nodes with publisher keys can run this.

- **Trigger**: Top-tree marker fulfilled
- **Capacity**: Does NOT count against limit
- **Output**: L1 transaction

## WorkPoller: Discovering and Claiming Work

The `WorkPoller` runs on a configurable interval (default 1s) and:

1. **Computes the active epoch range** from block headers' slot numbers (not block numbers -- blocks per epoch vary)
2. **Checks completion markers** on the broker to see which sub-trees/top-trees are done
3. **Filters out already-active work** items (jobs already running on this node)
4. **Claims work** via a single batched `claimN` call, respecting capacity limits
5. **Fires handler callbacks** on the `ProverNode` for each claimed item
6. **Detects pruned epochs** by tracking which epochs were previously active and checking if their checkpoints still exist on chain

### Race Condition Prevention

The poller checks `isEpochComplete` BEFORE `getCheckpointsForEpoch`. If the epoch was complete, the checkpoint list is authoritative (sealed on L1). If not, sub-tree work is discovered for known checkpoints but top-tree work is NOT triggered (more checkpoints may arrive).

## Claim System

Work items are claimed via the broker to ensure only one node works on each item.

### Lifecycle

1. **Claim**: `claimWork(workItemId, nodeId)` sets the cache synchronously (prevents races), then persists to LMDB
2. **Heartbeat**: Jobs call `heartbeatClaim()` periodically (default 30s) to refresh `lastActivity`
3. **Expiry**: If `lastActivity` exceeds `proverBrokerClaimTimeoutMs` (default 120s), the claim expires and other nodes can reclaim it
4. **Release**: On job completion or error, `releaseClaim()` removes the claim

### Restart Recovery

On restart, a node has the same persisted ID but has lost its claim tokens. The broker's `claimWork` detects the same `nodeId` and returns the existing token instead of rejecting. `claimN` prioritizes own existing claims before new work.

### Race Safety

The broker uses synchronous cache-first locking (same pattern as `enqueueProvingJob`): the cache is set synchronously before any `await`, so two concurrent RPC callers cannot both see a work item as unclaimed.

## IDs

| ID Type | Format | Purpose |
|---------|--------|---------|
| Work Item ID | `checkpoint-sub-tree:{epoch}:{index}`, `top-tree:{epoch}`, `publish:{epoch}` | Claim coordination |
| Completion Marker Job ID | `{epoch}:{type}:{sha256(sub-tree:{epoch}:{index})}` | Deterministic -- any node can compute it |
| Claim Token | `randomUUID()` | Proves claim ownership |
| Node ID | `prover-node-{randomUUID()}` | Identifies the prover node instance |
| Consumer ID | `randomUUID()` per `BrokerCircuitProverFacade` | Per-consumer notification queues |

## Orchestrators

### CheckpointSubTreeOrchestrator

Extends `ProvingOrchestrator` and overrides the checkpoint-root boundary. Instead of proceeding to checkpoint root rollup, it resolves with the final `BlockRollupPublicInputs`. Each sub-tree job creates a local 1-checkpoint epoch to drive the existing orchestrator's block proving flow.

### TopTreeOrchestrator

Standalone orchestrator that starts from pre-computed block proofs. Computes blob accumulator state and out-hash hints from archiver data (no block re-processing), then drives checkpoint root rollups through the root rollup.

## Broker Changes

### Completion Markers

Two new `ProvingRequestType` values: `CHECKPOINT_SUB_TREE_COMPLETE` (100) and `TOP_TREE_COMPLETE` (101). When enqueued, the broker auto-completes them immediately -- the `inputsUri` becomes the result payload. No agent picks them up.

### Per-Consumer Notification Queues

Each `BrokerCircuitProverFacade` has a unique `consumerId`. When a job completes, the broker pushes the notification to ALL consumer queues. Each facade drains only its own queue on `getCompletedJobs()`. Stale consumers are expired after 60s of inactivity.

Without this, concurrent facades steal each other's notifications, causing 30-second delays waiting for snapshot sync.

## Configuration

| Parameter | Env Var | Default | Notes |
|-----------|---------|---------|-------|
| `proverNodeSplitProving` | `PROVER_NODE_SPLIT_PROVING` | `true` | Enable split proving mode |
| `proverNodeMaxPendingJobs` | `PROVER_NODE_MAX_PENDING_JOBS` | 10 | Max concurrent sub-tree jobs |
| `proverNodeWorkPollIntervalMs` | `PROVER_NODE_WORK_POLL_INTERVAL_MS` | 1000 | WorkPoller frequency |
| `proverNodeClaimHeartbeatIntervalMs` | `PROVER_NODE_CLAIM_HEARTBEAT_INTERVAL_MS` | 30000 | Claim keep-alive interval |
| `proverNodeEpochProvingDelayMs` | -- | undefined | Optional delay before top-tree jobs |
| `proverBrokerClaimTimeoutMs` | `PROVER_BROKER_CLAIM_TIMEOUT_MS` | 120000 | Claim expiry timeout |
| `proverBrokerMaxEpochsToKeepResultsFor` | `PROVER_BROKER_MAX_EPOCHS_TO_KEEP_RESULTS_FOR` | 2 | Must be >= 2 for split proving |

## Data Flow

```
L1: checkpoint posted
     |
     v
WorkPoller discovers checkpoint
     |
     v
CheckpointSubTreeJob
  - Processes blocks (tx simulation, public execution)
  - Drives block proving through CheckpointSubTreeOrchestrator
  - Outputs: BlockRollupPublicInputs -> sub-tree completion marker on broker
     |
     v (all sub-trees for epoch complete + epoch complete on L1)
     |
TopTreeJob
  - Loads block proofs from broker markers
  - Computes blob/out-hash state from archiver
  - Drives checkpoint-root -> checkpoint-merge -> root rollup
  - Outputs: EpochProofPayload -> top-tree completion marker on broker
     |
     v
RootRollupPublishJob
  - Loads EpochProofPayload from broker marker
  - Submits proof to L1 rollup contract
```
