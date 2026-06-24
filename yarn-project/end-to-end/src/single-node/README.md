# `single-node` e2e test category

Single-node tests run one Aztec node with the production sequencer (and optionally a fake-proof prover
node), exercising proving, reorg recovery, partial proofs, and cross-chain messaging — all scenarios
that only need a single sequencer and do not require a multi-validator committee.

## Base class

All tests use `SingleNodeTestContext` (`single_node_test_context.ts` in this directory), which owns:
- The environment (in-proc anvil + L1 deploy).
- Node spawning (`createNonValidatorNode`, `createProverNode` incl. mock-gossip `p2pServiceFactory`
  wiring — harmless with a single node).
- The `ChainMonitor`.
- Epoch / checkpoint / proof-window / reorg waiters and assertion helpers.

`MultiNodeTestContext` (in `../multi-node/`) extends this base with the N-validator topology; the
cross-folder import direction is intentional.

## Subfolder map

| Path | Contents |
|---|---|
| `proving/` | Epoch/proof lifecycle: `world_state_pruning` (post-finalization world-state pruning), `empty_blocks` (proof submitted even with no txs), `long_proving_time` (prover delay spanning multiple epochs), `multi_proof` (multiple prover nodes prove one epoch), `optimistic.parallel` (checkpoint-driven proving with reorg cases), `proof_fails.parallel` (proof-submission failure paths), `cross_chain_public_message` (prover/sequencer state-root regression), `upload_failed_proof` (failed-proving-job upload + rerun). |
| `partial-proofs/` | `multi_root` (AZIP-14 partial-proof multi-root Outbox design, manually driven via `EpochTestSettler`) and `single_root` (prover-node `startProof` path). |
| `l1-reorgs/` | L1-reorg behavior split along its `describe` blocks: `blocks.parallel` (5 its: prune/restore L2 blocks on proof removed/added, prune pending-chain blocks, see new blocks) and `messages.parallel` (2 its: L1→L2 messages updated / missed-message inserted). Shared `SingleNodeTestContext` + `FAST_REORG_TIMING` + delayer setup in `setup.ts`. |
| `recovery/` | Reorg + pending-chain recovery: `manual_rollback` (`rollbackTo` admin API), `sync_after_reorg` (new-node sync past an unpruned reorg window), `prune_when_cannot_build` (failed-sync prune fallback on a single solo sequencer). |
| `misc/` | Genuine single-node outliers: `missed_l1_slot` (sequencer sync/timetable regression). |

`.parallel.test.ts` files are split per-`it` by CI into independent jobs.
