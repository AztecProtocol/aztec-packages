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
| `proving/` | Three proving scenarios split from `proving.parallel`: `multiple` (consecutive epochs proven + world-state pruning), `empty_blocks` (proof submitted even with no txs), `long_proving_time` (prover delay spanning multiple epochs). |
| `reorg-recovery/` | `manual_rollback` (exercises `rollbackTo` admin API) and `sync_after_reorg` (regression for new-node sync past an unpruned reorg window). |
| `partial-proofs/` | `multi_root` (AZIP-14 partial-proof multi-root Outbox design, manually driven via `EpochTestSettler`) and `single_root` (prover-node `startProof` path). |
| *(flat)* | `l1_reorgs.parallel`, `missed_l1_slot`, `multi_proof`, `optimistic_proving.parallel`, `proof_fails.parallel`, `proof_public_cross_chain`, `upload_failed_proof`. |

`.parallel.test.ts` files are split per-`it` by CI into independent jobs.
