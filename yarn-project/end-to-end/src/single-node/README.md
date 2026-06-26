# `single-node` e2e test category

Single-node tests run one Aztec node with the production sequencer (and, where a test needs proving,
a fake-proof prover node). They cover behavior that only requires a single sequencer and no
multi-validator committee: the proving/epoch lifecycle, partial proofs, L1-reorg handling, and
pending-chain recovery.

## Base class

All tests use `SingleNodeTestContext` (`single_node_test_context.ts`), which owns:

- The environment: an in-process anvil plus the L1 contract deploy.
- Node spawning: `createNonValidatorNode` and `createProverNode` (the latter wires the mock-gossip
  `p2pServiceFactory`, which is harmless with a single node).
- The `ChainMonitor`.
- The epoch / checkpoint / proof-window / reorg waiters and assertion helpers (`waitUntilEpochStarts`,
  `waitUntilProvenCheckpointNumber`, `waitForNodeToSync`, `verifyHistoricBlock`, …).

`MultiNodeTestContext` (in `../multi-node/`) extends this base with the N-validator topology, so the
multi-node category inherits the same environment and waiters.

## Organizing principle

The top level groups tests by node topology and setup model; the second level names the primary
behavior under test (the proving lifecycle, partial proofs, reorgs, recovery) rather than the shared
setup. Each file has a single top-level `describe` named to match its path, and a co-located
`setup.ts` holds any shared timeout/option wiring. A `.parallel` suffix marks files with more than one
top-level `it`; CI splits each `it` into its own job.

## Subfolders

| Path | Contents |
|---|---|
| `proving/` | Epoch and proof lifecycle. `world_state_pruning` (consecutive epochs prove and finalized blocks are purged from world state beyond the checkpoint-history window), `empty_blocks` (a proof is submitted even with no txs), `long_proving_time` (a prover delay spanning multiple epochs), `multi_proof` (multiple prover nodes prove one epoch), `optimistic.parallel` (checkpoint-driven proving across the happy path and several mid-epoch / last-slot / during-proving reorg cases), `proof_fails.parallel` (proof not accepted after epoch end; proving aborts when the next epoch ends), `cross_chain_public_message` (an epoch with a public tx that consumes an L1→L2 message in the block it lands, guarding against a sequencer/prover state-root mismatch), `upload_failed_proof` (a failed proving job's state is uploaded and re-run on a fresh instance). |
| `partial-proofs/` | Manually driven partial-proof submission. `single_root` (the prover node's `startProof` path on a single root) and `multi_root` (three partial-proof roots are staged and messages consume against any covering root, exercising the multi-root Outbox semantics). |
| `l1-reorgs/` | Behavior under L1 reorgs, split by what reorgs. `blocks.parallel` (prune L2 blocks when a reorg drops a proof, hold when a replacement proof lands in the window, restore blocks when a proof reappears, prune pending-chain blocks, and see new blocks added by a reorg) and `messages.parallel` (L1→L2 messages updated by a reorg, and a missed message inserted by one). `setup.ts` holds the shared `FAST_REORG_TIMING` profile and delayer wiring. |
| `recovery/` | Reorg and pending-chain recovery. `manual_rollback` (the `rollbackTo` admin API rolls back to an unfinalized block), `sync_after_reorg` (a fresh node syncs world state past an unpruned reorg window), `prune_when_cannot_build` (a solo sequencer prunes the pending chain via the fallback path when it cannot propose). |
| `misc/` | Genuine single-node outliers. `missed_l1_slot` (the sequencer builds a block after missed L1 slots once the previous checkpoint is synced). |
