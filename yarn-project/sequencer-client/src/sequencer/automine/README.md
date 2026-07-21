# AutomineSequencer

A minimal, deterministic, queue-driven sequencer for e2e tests that do not exercise block-building or consensus mechanics (e.g. `e2e_token`, `e2e_amm`, `e2e_authwit`).

## When to use it

Use `AutomineSequencer` (via `AUTOMINE_E2E_OPTS`) for single-sequencer tests that care about contract logic, not about proposer selection, attestations, pipelining, or multi-validator coordination. It bypasses all of that machinery.

Use the production `Sequencer` (via `PIPELINING_SETUP_OPTS` or the default) for tests that explicitly exercise consensus, validator rotation, P2P gossip, slashing, or multi-node behavior.

**Requirement**: the deployed rollup must have `aztecTargetCommitteeSize == 0`. This causes `Rollup.verifyProposer` / `verifyAttestations` on L1 to short-circuit and accept an empty `CommitteeAttestationsAndSigners`, which is what `AutomineSequencer` always sends.

## What it omits

Compared to the production `Sequencer`:

- No proposer-turn check (single sequencer, always proposes).
- No sync check, no pipelining, no timetable enforcement.
- No validator orchestration, attestation collection, or P2P proposal gossip.
- No slashing, no governance votes, no `SequencerEvents`.

Consumers (archiver, world-state) observe L1 and the archiver tip directly rather than listening for sequencer events.

## Serial-queue invariant

Every operation — mempool-driven block builds, explicit empty-block builds, time warps, reorgs, and synthetic epoch proving — is serialized through a single `SerialQueue`. They never interleave.

Public entry points:

| Method | Description |
| --- | --- |
| `buildIfPending()` | Enqueues a mempool-driven build. Coalesces bursts into one job. |
| `buildEmptyBlock()` | Enqueues a forced empty-block build. |
| `warpTo(ts)` / `warpBy(delta)` | Advances L1 time to a slot boundary. |
| `prove(upToCheckpoint?)` | Synthetically proves epochs up to a checkpoint (default: the latest checkpointed): writes the epoch out hashes into the L1 Outbox so L2-to-L1 messages become consumable, then advances the proven tip. No real proof. Clamps to the checkpointed tip and no-ops when already proven. |
| `revertToCheckpoint(n)` | Rolls L1 back to the block that published checkpoint `n`, then resets archiver, world-state, and P2P pool. |
| `syncPoint()` | Awaits the queue reaching idle. |

## Time control

The AutomineSequencer owns L1 time in the local network (replacing the deleted `AnvilTestWatcher`). It builds and publishes each checkpoint at the next aztec-slot boundary, and `warpTo` / `warpBy` advance the clock by publishing an empty checkpoint at the target slot. Before every build, warp, and prove it reconciles the injected `TestDateProvider` to the latest *mined* L1 timestamp, so node-side consumers of `dateProvider.now()` stay aligned with L1 even when an unrelated L1 tx mines a block between our builds. It never advances the clock to the pending, un-mined timestamp.

## Publish-failure recovery

A failed propose mines no checkpoint on L1 (it reverts inside the multicall or is never sent), so recovery is purely local — there is **no L1 reorg**. The optimistic archiver insert (the proposed block plus its proposed checkpoint) is rolled back via `archiver.removeUncheckpointedBlocksAfter`, which removes the uncheckpointed block and evicts the proposed checkpoint that referenced it. `p2pClient.sync()` then observes the lowered proposed tip and returns the block's txs to the pending pool, `worldState.syncImmediate()` drops any applied effects, and the L1 nonce is reset. The build is not retried inline; the mempool poller re-enqueues one once the txs are back in the pool.

## Entry points

**Factory** — `createAutomineSequencer` in `automine_factory.ts` wires up all dependencies (publisher manager, keystore, cheat codes, etc.), starts the `PublisherManager`, and returns an unstarted `AutomineSequencer`. The caller (`AztecNodeService.createAndSync` in `aztec-node/src/aztec-node/server.ts`) invokes `AutomineSequencer.start()` separately. It is called by the full node when `aztecTargetCommitteeSize == 0`.

**Test fixture** — `AUTOMINE_E2E_OPTS` in `end-to-end/src/fixtures/fixtures.ts` is the test-side entry point. Pass it to `setup()` to get a node + `AutomineSequencer` instead of the production sequencer stack.

## Epoch proving

There is no real prover in the automine setup, so epochs are settled synthetically: the epoch out hash is written into the L1 Outbox via cheat codes and the rollup's proven tip is advanced — the local-network equivalent of an epoch proof landing on L1. The grouping/out-hash logic lives in the shared `settleEpochOutbox` helper in `@aztec/prover-client/test`, used by both proving drivers below.

Who drives proving depends on the `automineEnableProveEpoch` config flag:

- **Local network / sandbox** (`automineEnableProveEpoch: true`): the AutomineSequencer runs an auto-prove loop that calls `prove()` as checkpoints land, through the same serial queue as its builds. This replaces the standalone `EpochTestSettler`, which used to race the build loop. The loop also reconciles the clock on each tick.
- **e2e tests** (`AUTOMINE_E2E_OPTS`, flag off): proving is manual so tests stay deterministic. Cross-epoch tests advance the proven anchor explicitly via `node.prove(...)`, `cheatCodes.rollup.markAsProven(...)`, or a hand-driven `EpochTestSettler`. See `e2e_pruned_blocks.test.ts` and `e2e_epochs/epochs_partial_proof_multi_root.test.ts` for real examples.
