# Sequencer Client

The sequencer client is the proposer-side counterpart to the [validator client](../validator-client/README.md): it builds checkpoints, broadcasts the block and checkpoint proposals that validators attest to, and publishes the resulting checkpoint to L1. It runs on any node whose configured validator address has been selected as proposer for the target slot.

A single instance owns the proposer flow for one slot: deciding whether to propose, building several L2 blocks one after another, signing them, gossiping them, collecting attestations from the committee, and submitting the final checkpoint to L1 in one Multicall3 transaction together with governance and slashing votes.

The sequencer does **not** decide what is in the next block on its own. It composes the work of several subsystems: the [tx pool](../p2p/README.md) supplies transactions, the [validator client](../validator-client/README.md) owns operator keys and contains the `CheckpointBuilder` that actually executes them, the [archiver](../archiver/README.md) provides the L2 chain state needed to anchor each block, the [epoch cache](../epoch-cache/README.md) answers proposer/committee lookups, and the [slasher](../slasher/README.md) supplies offenses to vote on.

## Key Concepts

### Slots, Blocks, and Checkpoints

The Aztec consensus design splits each Aztec slot into multiple L2 blocks. This is the design originally called [building in chunks](https://github.com/AztecProtocol/engineering-designs/blob/main/docs/building-in-chunks/index.md).

- **Slot** — a fixed time window (e.g. 72 s) during which one proposer is allowed to build.
- **Block** — a single batch of transactions, executed and validated as a unit, with its own header.
- **Checkpoint** — the collection of all blocks built for one target slot. The proposer commits to a checkpoint on L1 by submitting a `propose` transaction containing the aggregated header, the blocks' tx effects (as blobs), and the committee attestations.
- **Sub-slot** — a fixed-duration window during which one block is built. Sub-slots are equal in length and have deadlines fixed relative to the build frame.

Several blocks per slot is intentional: it amortizes the fixed L1 cost of a checkpoint over more transactions, and it lets the rest of the network reach a usable state-root much sooner than the full L1 confirmation latency.

### Proposed vs Checkpointed Chain

There are two tips the sequencer cares about:

- The **proposed chain** is the set of blocks that have been broadcast over p2p but not yet committed to L1. Both the sequencer and validators push these blocks into the archiver so the rest of the node can serve them.
- The **checkpointed chain** is the set of checkpoints that have landed on L1, recovered from `CheckpointProposed` events.

Within a slot, the proposer adds blocks to the proposed chain as it goes. Only the last block is bundled with a `CheckpointProposal` that committee members attest to; intermediate blocks are accepted onto the proposed chain by virtue of the proposer's signature alone, and every node that wants to follow the proposed chain re-executes them. See the [validator client README](../validator-client/README.md) for the consumer side.

### Proposer Pipelining

Pipelining ([proposed in this discussion](https://github.com/AztecProtocol/governance/discussions/8)) is the only mode the production sequencer runs in. The proposer for slot `N` builds blocks and broadcasts the checkpoint proposal during slot `N - 1`; the committee re-executes the final block, sends attestations back, and the proposer targets L1 submission for the start of slot `N`. This removes the long idle window a naive flow would have inside slot `N`, where the proposer would otherwise spend most of the slot collecting attestations and waiting for the L1 transaction to mine.

Each phase lands in this slot:

| Phase                   | Slot         |
| ----------------------- | ------------ |
| Block building          | slot `N - 1` |
| Checkpoint proposal     | slot `N - 1` |
| Committee validation    | slot `N - 1` |
| Attestation collection  | slot `N - 1` \* |
| L1 submission           | slot `N`     |

\* The ideal timing path reserves enough budget for attestations to be in hand before the ideal L1 send time. The hard `attestation_deadline` is also the latest useful L1 publish time; validators must finish validation and sign by then for inactivity/slashing purposes.

`EpochCache` always looks up the pipelined target proposer, so the sequencer asks the cache for the proposer of `slot + 1` (`PROPOSER_PIPELINING_SLOT_OFFSET = 1`) rather than `slot`. Building runs during the wall-clock slot; the checkpoint commits to the target slot.

This flow introduces two failure modes that block building has to handle:

- **Pipeline depth** is bounded to 2 (`checkpointNumber ≤ confirmedCheckpoint + 2`). Building further ahead would require trusting more in-flight parent proposals than the design allows.
- **Pipelined parent invalidation**: if the parent checkpoint we built on top of fails to land cleanly on L1, the next proposer's work is discarded (`pipelined-checkpoint-discarded` event) and an `invalidate` request is enqueued for the parent.

## Architecture

```
       ┌──────────────────────────────────────────────────────────────┐
       │                          Sequencer                           │
       │              (state machine, one slot at a time)             │
       │                                                              │
       │   work() ──► prepareCheckpointProposal() ──► proposal job    │
       └─────┬────────────────┬──────────────────┬──────────────────┬─┘
             │                │                  │                  │
             ▼                ▼                  ▼                  ▼
   ┌──────────────────┐  ┌──────────┐  ┌──────────────────┐ ┌────────────────┐
   │ ValidatorClient  │  │ Epoch    │  │ CheckpointBuilder│ │ Sequencer      │
   │  (owns keys,     │  │ Cache    │  │ (forked world    │ │ Publisher      │
   │   HA signer,     │  │ (proposer│  │  state, per-block│ │ (Multicall3    │
   │   signs the      │  │  +       │  │  execution via   │ │  L1 tx, with   │
   │   proposals)     │  │  comm.)  │  │  PublicProcessor)│ │  pre-checks)   │
   └──────────────────┘  └──────────┘  └──────────────────┘ └────────────────┘
            │                              │                        │
            │  block + checkpoint          │ pull txs               │
            │  proposals over p2p          ▼                        ▼
            │                          ┌──────────┐           ┌────────────┐
            ├────────────────────────► │   Tx     │           │ L1 Rollup  │
            │                          │ Provider │           │ Contract   │
            │  push blocks to          └──────────┘           └────────────┘
            ▼  proposed chain
   ┌──────────────────┐
   │     Archiver     │
   │   (l2 tips,      │
   │    addBlock)     │
   └──────────────────┘
```

`SequencerClient.new(config, deps)` is the entrypoint and is constructed by the full node. It reads L1 constants (`l1GenesisTime`, `slotDuration`, `rollupManaLimit`) from the rollup contract, builds the publisher factory, validator client wiring, and timetable, then instantiates the `Sequencer`. See `src/client/sequencer-client.ts`.

### Sequencer (work loop)

`Sequencer` (`src/sequencer/sequencer.ts`) drives one slot at a time using a `RunningPromise` that ticks every `sequencerPollingIntervalMS` (default 500 ms). On each tick it:

1. Asks the [epoch cache](../epoch-cache/README.md) for the slot at the next L1 block and for the *target* slot (`slot + 1`). Building runs during the wall-clock slot; the checkpoint commits to the target slot.
2. Calls `prepareCheckpointProposal`, which:
   - Dedupes against the last slot we tried to propose for.
   - Runs `checkSync()` — verifies world-state, l2 block source, p2p, and l1-to-l2 message source agree on the parent tip.
   - Checks the escape hatch (governance-controlled freeze) for the target epoch.
   - Calls `checkCanPropose(targetSlot)` to verify one of our configured validator addresses is the elected proposer.
   - Falls back to `considerInvalidatingCheckpoint()` if we are *not* the proposer but a previous checkpoint is stuck with bad attestations and the slot is far enough along to invalidate (`secondsBeforeInvalidatingBlockAsCommitteeMember` / `…AsNonCommitteeMember`).
   - Refuses to build further than two checkpoints ahead of the confirmed tip.
   - Builds L1 `eth_call` simulation overrides (so `Rollup.canProposeAt` sees the expected pending tip when we are building on a pipelined parent or invalidating).
   - Calls `publisher.canProposeAt(...)` — if L1 rejects the simulated propose, abort early.
3. Constructs a `CheckpointProposalJob` and calls `.execute()`, parking the returned `pendingL1Submission` on the sequencer so `stop()` can await it without re-entering the loop.

Each state transition flows through `setState()`, which records the state, emits `state-changed`, and updates metrics — nothing else. Timing is not enforced through states: the work loop and the job query explicit deadlines from the `ProposerTimetable` (the build-entry gate via `getBuildStartDeadline`, sub-slot selection via `selectNextSubslot`, attestation collection and L1 publishing bounded by `getAttestationDeadline`). When a deadline is hit, the slot is abandoned and marked as attempted so it is not retried.

The sequencer is a `TypedEventEmitter<SequencerEvents>`. The most useful events are:

| Event                              | When emitted                                                          |
| ---------------------------------- | --------------------------------------------------------------------- |
| `state-changed`                    | Every `setState()` call.                                              |
| `preparing-checkpoint`             | After the canPropose check decides to build, before L1 simulation.    |
| `block-proposed`                   | After `buildSingleBlock` succeeds, before sign + archiver push.       |
| `checkpoint-published`             | After the L1 submission lands.                                        |
| `checkpoint-publish-failed`        | Multicall3 tx failed or expired.                                      |
| `pipelined-checkpoint-discarded`   | Pipelined parent failed to land; this slot's work is thrown away.     |
| `checkpoint-error`                 | Catch-all: an exception escaped `work()`.                             |

State enum (`src/sequencer/utils.ts`):

```
STOPPED → STOPPING → IDLE → SYNCHRONIZING → PROPOSER_CHECK
       → INITIALIZING_CHECKPOINT
       → (WAITING_FOR_TXS ↔ CREATING_BLOCK ↔ WAITING_UNTIL_NEXT_BLOCK)*
       → ASSEMBLING_CHECKPOINT
       → COLLECTING_ATTESTATIONS
       → PUBLISHING_CHECKPOINT
       → IDLE
```

### CheckpointProposalJob

`CheckpointProposalJob` (`src/sequencer/checkpoint_proposal_job.ts`) is the per-slot unit of work. It owns the lifecycle from "we have decided to propose" through "the L1 transaction has been submitted". The contract is:

- `execute()` returns once the checkpoint has been broadcast over p2p (or has failed before that). The L1 submission runs in the background as `pendingL1Submission`.
- All work scheduled on the publisher (governance vote, slashing actions, propose, invalidate) is enqueued early and then flushed together in a single Multicall3 transaction.

Inside `execute()`:

1. **Vote enqueueing.** `CheckpointVoter.enqueueVotes()` signs and enqueues the governance and slashing vote requests up front. Even if block-building fails, these still go out in the final Multicall3 — they are the proposer's duty for the slot.
2. **`proposeCheckpoint()`** (blocking, returns a `CheckpointProposal`):
   - Transitions to `INITIALIZING_CHECKPOINT`. If there is a pending invalidation, enqueue it.
   - Builds **pipelined-parent simulation overrides**: when building on top of a parent that hasn't landed on L1 yet, the fee-asset price modifier must be computed against the parent fee header we predicted (not the L1 one), so all in-flight checkpoints in the pipeline agree on the same modifier.
   - Asks the global variables builder for the slot's `CheckpointGlobalVariables` (`coinbase`, `feeRecipient`, `timestamp`, `gasFees`, `chainId`, `version`, `slotNumber`). These are shared across every block within the checkpoint — only `blockNumber` increments.
   - Resolves the streaming Inbox consumption cursor (the parent checkpoint's last-consumed bucket, from the fork's L1→L2 leaf count), and collects `previousCheckpointOutHashes` for prior checkpoints in the same epoch. Each block then selects its own message bundle against the cursor (AZIP-22 Fast Inbox).
   - Forks world state at the parent (`closeDelayMs: 12 s`) and asks `FullNodeCheckpointsBuilder` for a `CheckpointBuilder` bound to that fork.
   - Runs `buildBlocksForCheckpoint()` — the per-block loop, described below.
   - Transitions to `ASSEMBLING_CHECKPOINT`, asks the builder to `completeCheckpoint()`, validates it against the configured caps, and asks the validator client to sign the `CheckpointProposal` (which bundles the final block proposal so the two travel together).
   - Broadcasts the `CheckpointProposal` via p2p.
3. **Attestation collection** (`waitForAttestationsAndEnqueueSubmissionAsync`) runs in the background:
   - Transitions to `COLLECTING_ATTESTATIONS`. Reads the committee from `EpochCache`, computes the quorum (`2/3 + 1`), and waits for that many attestations on p2p. The validator client adds the proposer's own signature.
   - `waitForValidParentCheckpointOnL1()` waits for the archiver to confirm the parent we built on top of has landed on L1 with matching hash and valid attestations. If not, the work is dropped (`pipelined-checkpoint-discarded`) and we enqueue an invalidation for the parent so the next proposer doesn't repeat the same mistake.
   - Computes `submitAfter` as `getTimestampForSlot(targetSlot)` so the Multicall3 mines inside the target slot — EIP-712 signatures are bound to a slot and would silently fail if mined outside it.
   - Calls `publisher.sendRequestsAt(submitAfter)`, which targets the ideal L1 send time, re-runs each request's `preCheck` against fresh L1 state, and submits the bundled Multicall3.

### Per-block loop (`buildBlocksForCheckpoint`)

The per-block loop is the heart of the building flow:

```
loop:
  timing = timetable.selectNextSubslot(targetSlot, now)
  if !timing.canStart:                       break
  if blocksBuilt >= maxBlocksPerCheckpoint:  break

  state = WAITING_FOR_TXS
  result = checkpointBuilder.buildBlock(
              pendingTxs, blockNumber, timestamp,
              { maxTransactions, maxBlockGas, deadline,
                minValidTxs, maxBlocksPerCheckpoint, perBlockAllocationMultiplier })

  if result is 'insufficient-txs' or 'insufficient-valid-txs':
    if isLastBlock or no deadline:           break
    else:                                    wait until this sub-slot deadline, then continue (try next sub-slot)
  if result is error:                        halt

  blockProposal = validatorClient.createBlockProposal(block)
  archiver.addBlock(block)                   // push to proposed chain
  if not timing.isLastBlock:
    p2pClient.broadcastProposal(blockProposal)
  else:
    blockPendingBroadcast = blockProposal    // shipped with the CheckpointProposal

  state = WAITING_UNTIL_NEXT_BLOCK
  waitUntilNextSubSlot(timing.deadline)
```

The deadlines passed to `CheckpointBuilder.buildBlock` are absolute timestamps. The builder uses these as hard caps on tx execution, so a slow block cannot eat into the next sub-slot.

`maxBlocksPerCheckpoint` (bounded by the timetable's `getMaxBlocksPerCheckpoint()` and the configured cap) and `perBlockAllocationMultiplier` (default 1.2) are passed in opts so that the builder can redistribute the remaining checkpoint budget (L2 gas, DA gas, blob fields, tx count) across the remaining blocks. See [validator-client/README.md § Block Building Limits](../validator-client/README.md#block-building-limits) for the redistribution math; the sequencer only sets the inputs.

### Timetable

The sequencer builds a `ProposerTimetable` (from `@aztec/stdlib/timetable`) directly from its config and the L1 constants. Key getters:

- **Sub-slot scheduling**: `selectNextSubslot(slot, now)` finds the next sub-slot with at least `minBlockDuration` remaining and returns its absolute deadline and whether it is the last sub-slot. If we are running late, sub-slots are skipped; we never start a block we cannot finish.
- **Build-entry gate**: `getBuildStartDeadline(slot)` is the latest useful time to start building for a target slot; past it, the work loop abandons the slot without building.
- **Consensus bounds**: the inherited `ConsensusTimetable` getters (`getAttestationDeadline`, the proposal/attestation receive windows) bound attestation collection, L1 publishing, and p2p ingress.

See the [Block Building Timetable Spec](../stdlib/src/timetable/README.md) for the full timing model, including the ideal/deadline split for checkpoint proposals, the consensus-only receive deadline, and the failure-mode walkthroughs.

### SequencerPublisher

`SequencerPublisher` (`src/publisher/sequencer-publisher.ts`) translates "I want to propose a checkpoint" into "submit this Multicall3 transaction to L1". It maintains an ordered queue of `RequestWithExpiry` entries — each one has a label (`propose`, `invalidate-by-*`, `governance-signal`, `vote-offenses`, `execute-slash`), a `preCheck` callback, and an ABI-encoded call. The queue is sorted so invalidations go first and proposes precede votes.

Key entry points:

- `canProposeAt(archive, msgSender, simulationOverridesPlan?)` — eth_call simulation of `Rollup.canProposeAt`. The sequencer runs this before deciding to build.
- `enqueueProposeCheckpoint(checkpoint, attestations, attestationsSignature, bucketHint, opts)` — adds the propose call, with a `preCheck` that re-validates the proposal against real L1 state when it is finally sent (catches drift between build time and submit time).
- `enqueueInvalidateCheckpoint`, `enqueueGovernanceCastSignal`, `enqueueSlashingActions` — the rest of the actions a proposer may bundle.
- `sendRequests(targetSlot?)` — immediately flushes the queue as one Multicall3 transaction. Used by the `AutomineSequencer` for synchronous in-slot publishing.
- `sendRequestsAt(targetSlot)` — the production (pipelined) path: sleeps (cancellable) until the ideal L1 send time, runs each request's `preCheck` (dropping those that fail), and then calls `sendRequests(targetSlot)`, which filters expired requests, sorts the remainder, and submits one Multicall3 that mines inside the target slot.

`SequencerPublisherFactory` produces one publisher per attempt, wrapping an L1 publisher (EOA + `L1TxUtils`) leased from `PublisherManager`. Leases free the publisher when the job completes so multiple validator addresses on the same node can take turns without conflicts.

### Other components

| Component | File | Responsibility |
| --- | --- | --- |
| `CheckpointVoter` | `src/sequencer/checkpoint_voter.ts` | Signs and enqueues governance/slashing votes. Used by both the job and the "vote even though we can't propose" fallbacks. |
| `GlobalVariableBuilder` | `src/global_variable_builder/` | Computes `CheckpointGlobalVariables` and predicts the per-slot fee asset price modifier. See its [README](src/global_variable_builder/README.md). |
| `L1TxFailedStore` | `src/publisher/l1_tx_failed_store/` | Persists actions that returned a revert reason so they aren't retried in the same form on the next slot. |
| `ChainStateOverrides` | `src/sequencer/chain_state_overrides.ts` | Builds the L1 `eth_call` overrides used during the pipelined parent + invalidation simulations. |
| `AutomineSequencer` | `src/sequencer/automine/` | Minimal queue-driven sequencer for single-sequencer e2e tests. Bypasses consensus, pipelining, and timetable enforcement. See [`src/sequencer/automine/README.md`](src/sequencer/automine/README.md). |

## Configuration

The configuration object is `SequencerConfig` (`src/sequencer/config.ts` + `src/publisher/config.ts`). The options that most directly affect block building are:

### Block budgets

| Option / env var | Default | Purpose |
| --- | --- | --- |
| `minTxsPerBlock` / `SEQ_MIN_TX_PER_BLOCK` | 1 | Wait for at least this many txs before starting a block. |
| `minValidTxsPerBlock` | falls back to `minTxsPerBlock` | After execution, discard the block if fewer txs validated. |
| `maxTxsPerBlock` / `SEQ_MAX_TX_PER_BLOCK` | unset | Hard per-block tx cap (capped at `maxTxsPerCheckpoint` at startup). |
| `maxTxsPerCheckpoint` / `SEQ_MAX_TX_PER_CHECKPOINT` | unset | Total tx cap across the checkpoint. Enables redistribution when set. |
| `maxBlocksPerCheckpoint` / `MAX_BLOCKS_PER_CHECKPOINT` | 24 | Hard ceiling beyond what the timetable allows. Also caps the `indexWithinCheckpoint` accepted on inbound block proposals. |
| `maxL2BlockGas` / `SEQ_MAX_L2_BLOCK_GAS` | unset | Per-block mana cap, capped at `rollupManaLimit`. |
| `maxDABlockGas` / `SEQ_MAX_DA_BLOCK_GAS` | unset | Per-block DA gas cap, capped at `MAX_PROCESSABLE_DA_GAS_PER_CHECKPOINT`. |
| `perBlockAllocationMultiplier` / `SEQ_PER_BLOCK_ALLOCATION_MULTIPLIER` | 1.2 | Multiplier passed to the checkpoint builder so early blocks can use slightly more than their even share. |
| `redistributeCheckpointBudget` / `SEQ_REDISTRIBUTE_CHECKPOINT_BUDGET` | true | Legacy flag. Redistribution is always on during proposal building. |

### Timing

| Option / env var | Default | Purpose |
| --- | --- | --- |
| `blockDurationMs` / `SEQ_BLOCK_DURATION_MS` | 3000 ms | Length of one sub-slot in ms. Required: the sequencer always runs the enforced timetable. The derived `maxBlocksPerCheckpoint = floor((aztecSlotDuration − checkpointInitializationTime − (checkpointAssembleTime + 2·p2pPropagationTime + blockDuration)) / blockDuration)`; a slot may legitimately fit a single block when that floor is 1. |
| `attestationPropagationTime` / `SEQ_ATTESTATION_PROPAGATION_TIME` | 2 s | One-way p2p estimate fed to the timetable. |
| `sequencerPollingIntervalMS` / `SEQ_POLLING_INTERVAL_MS` | 500 | Work-loop tick rate. |

### Behavior

| Option / env var | Default | Purpose |
| --- | --- | --- |
| `buildCheckpointIfEmpty` / `SEQ_BUILD_CHECKPOINT_IF_EMPTY` | false | Build and submit even when no txs are available. |
| `publishTxsWithProposals` / `SEQ_PUBLISH_TXS_WITH_PROPOSALS` | false | Embed full transactions in p2p block proposals (DA fallback for validators). |
| `fishermanMode` / `FISHERMAN_MODE` | false | Build internally for monitoring; never publish. |
| `coinbase` / `COINBASE` | proposer addr | Recipient of block rewards. |
| `feeRecipient` / `FEE_RECIPIENT` | proposer addr | Recipient of tx fees. |
| `governanceProposerPayload` / `GOVERNANCE_PROPOSER_PAYLOAD_ADDRESS` | unset | Payload signaled in the governance vote each slot. |
| `secondsBeforeInvalidatingBlockAsCommitteeMember` | 144 | When *not* the proposer, committee members may invalidate a stuck checkpoint after this many seconds into the slot. |
| `secondsBeforeInvalidatingBlockAsNonCommitteeMember` | 432 | Same for any node — last resort. |

The full list (including test/fault-injection hooks like `pauseProposingForSlots` and `skipPublishingCheckpointsPercent`) lives in `src/config.ts`.

## Failure modes

- **Not the proposer**: `checkCanPropose` returns false → no work done. If a previous checkpoint is stuck with invalid attestations and we are past the configured invalidation threshold, we fall through to `considerInvalidatingCheckpoint` and may still submit an invalidation tx.
- **Out of sync**: `checkSync` fails → governance/slashing votes still go out via `tryVoteWhenSyncFails`, but no block is built.
- **Insufficient txs in a sub-slot**: `CheckpointBuilder.buildBlock` returns `insufficient-txs`. The sub-slot is skipped without committing state; the next sub-slot retries. On the last sub-slot, if `buildCheckpointIfEmpty` is true, the block is still built with whatever is available (possibly zero txs).
- **Sub-slot deadline exceeded**: `CheckpointBuilder` enforces the deadline and stops executing further txs. The block is finalized with whatever fit.
- **Build start deadline exceeded**: the work loop abandons the slot before building and marks it as attempted so the same checkpoint is not retried. Inside the job, sub-slot and attestation deadlines bound their own phases.
- **Pipelined parent fails on L1**: `waitForValidParentCheckpointOnL1` returns false. The whole proposal is discarded (`pipelined-checkpoint-discarded`), the parent is enqueued for invalidation, and the L1 submission for *this* checkpoint is not sent.
- **L1 submission reverts or expires**: `checkpoint-publish-failed` is emitted with the individual action results so observability can break down which actions in the Multicall3 went through and which didn't.

## Where to look first

| Question | File |
| --- | --- |
| How does the work loop decide whether to propose? | `src/sequencer/sequencer.ts` → `prepareCheckpointProposal`, `checkCanPropose` |
| How does a checkpoint get built block-by-block? | `src/sequencer/checkpoint_proposal_job.ts` → `proposeCheckpoint`, `buildBlocksForCheckpoint` |
| How do sub-slot deadlines work? | `@aztec/stdlib` `ProposerTimetable` + [`stdlib/src/timetable/README.md`](../stdlib/src/timetable/README.md) |
| How does an L1 transaction get scheduled and submitted? | `src/publisher/sequencer-publisher.ts` → `sendRequestsAt` |
| How does pipelining wait for the parent to land? | `src/sequencer/checkpoint_proposal_job.ts` → `waitForValidParentCheckpointOnL1` |
| How do governance and slashing votes get into the L1 tx? | `src/sequencer/checkpoint_voter.ts` |
| How are fees predicted for the slot? | `src/global_variable_builder/README.md` |
| How are full-node services wired together? | `src/client/sequencer-client.ts` |

## Development

Build, format, lint, and test from `yarn-project/`:

```bash
yarn workspace @aztec/sequencer-client build
yarn workspace @aztec/sequencer-client test
```

The integration tests of interest are:

- `src/sequencer/sequencer.test.ts` — work-loop behavior, escape-hatch and invalidation fallbacks.
- `src/sequencer/checkpoint_proposal_job.test.ts` — full per-slot job, including pipelined parent validation and discard paths.
- `src/sequencer/checkpoint_proposal_job.timing.test.ts` — sub-slot timing and skip behavior under simulated clock drift.
- `stdlib/src/timetable/*.test.ts` — pure math against `ConsensusTimetable` / `ProposerTimetable`.
- `src/publisher/sequencer-publisher.test.ts` — request ordering, `sendRequestsAt`, preCheck re-runs.
