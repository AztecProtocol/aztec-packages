# Pipelining Migration Status

## What is pipelining?

With `enableProposerPipelining: true`, the block proposer for slot N+1 builds blocks during slot N
and submits the checkpoint in slot N+1. This gives the proposer a full slot of lead time.
See https://github.com/AztecProtocol/governance/discussions/8 for details.

## Key findings

### `inboxLag: 2` required for validator-based tests
With pipelining, the sequencer builds for slot N+1 during slot N. The L1-to-L2 message inbox
needs an extra slot of lag to have messages sealed in time. The existing pipelining test
(`epochs_mbps.pipeline.parallel.test.ts`) already uses `inboxLag: 2`. All validator-based tests
that enable pipelining must also set this.

### Solo-sequencer setup needs increased timeouts
On a single-node setup without P2P/validators, the sequencer can't pipeline L1 simulations because
`hasProposedCheckpoint` in the archiver doesn't become true without P2P propagation of proposed
checkpoints. This means each checkpoint takes ~2 L2 slots instead of 1 (the sequencer must wait for
the L1 tx of the previous checkpoint to land before the simulation overrides work for the next one).
Tests using the default `EpochsTestContext.setup()` (without `skipInitialSequencer`) need roughly
doubled timeouts for `waitUntilCheckpointNumber` calls.

### Tests incompatible with pipelining
Some tests deliberately manipulate L1 timing (delaying txs, pausing mining, reorging) or use very
tight slot durations (3 L1 blocks per L2 slot). These conflict with pipelining's assumption that
previous checkpoints land on L1 promptly. Pipelining was NOT enabled for these.

## Migration status

### Pipelining enabled and passing (11 tests)

| Test | Changes |
|------|---------|
| `epochs_empty_blocks_proof` | `enableProposerPipelining: true` |
| `epochs_multiple` | `enableProposerPipelining: true` |
| `epochs_long_proving_time` | `enableProposerPipelining: true` |
| `epochs_multi_proof` | `enableProposerPipelining: true` |
| `epochs_proof_public_cross_chain` | `enableProposerPipelining: true` |
| `epochs_upload_failed_proof` | `enableProposerPipelining: true` |
| `epochs_ha_sync` | `enableProposerPipelining: true`, `inboxLag: 2` |
| `epochs_sync_after_reorg` | `enableProposerPipelining: true`, increased timeout 5x -> 12x slots |
| `epochs_partial_proof` | `enableProposerPipelining: true`, increased timeout 6x -> 12x slots |
| `epochs_manual_rollback` | `enableProposerPipelining: true`, increased timeout 6x -> 12x slots |

### Pipelining enabled and verified (11 tests)

The 10 tests listed above plus:

| Test | Changes |
|------|---------|
| `epochs_invalidate_block.parallel` | `enableProposerPipelining: true`, `inboxLag: 2` |

### Pipelining NOT enabled (9 tests)

| Test | Reason |
|------|--------|
| `epochs_simple_block_building` | Asserts zero sequencer errors (`failEvents`); pipelining produces transient `Rollup__InvalidArchive` / `ProposedCheckpointNotSequentialError` when checkpoint N's L1 tx is slow, breaking the strict zero-error assertion |
| `epochs_mbps.parallel` | With MBPS, a single proposer builds blocks spanning 3+ checkpoints in one slot, triggering `CheckpointNumberNotSequentialError` on non-proposer nodes. The dedicated `epochs_mbps.pipeline.parallel` test covers MBPS+pipelining with wider timing. |
| `epochs_proof_fails.parallel` | Deliberately delays L1 txs via `proverDelayer`/`sequencerDelayer` with `cancelTxOnTimeout: false` and `maxSpeedUpAttempts: 0` |
| `epochs_missed_l1_slot` | Deliberately pauses L1 mining to simulate missed slots |
| `epochs_l1_reorgs.parallel` | Manipulates L1 state via reorgs with `cancelTxOnTimeout: false` and `maxSpeedUpAttempts: 0` |
| `epochs_first_slot` | Tight timing: 3 L1 blocks per L2 slot (`aztecSlotDurationInL1Slots: 3`) |
| `epochs_high_tps_block_building` | Tight timing: 3 L1 blocks per L2 slot (`aztecSlotDuration: 24`, `ethereumSlotDuration: 8`, `l1PublishingTime: 8`) |
| `epochs_mbps_redistribution` | Pipelining changes block building timing enough to split late txs across 2 blocks instead of 1, breaking the redistribution assertion |
| `epochs_mbps.pipeline.parallel` | Already has pipelining (this is the reference test) |

## What's next

1. **Push** `palla/tests-to-pipelining` (rebased on latest `palla/skip-initial-sequencer-in-e2e`).

2. **Create PR for `palla/skip-initial-sequencer-in-e2e`**, monitor CI, fix until green.

3. **Rebase `palla/tests-to-pipelining`** on top of the merged base and create its own PR.
