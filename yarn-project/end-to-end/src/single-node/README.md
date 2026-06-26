# `single-node` e2e test category

Single-node tests run one Aztec node with the production sequencer (and, where a test needs proving,
a prover node). They cover behavior that only requires a single sequencer and no multi-validator
committee: block building, sequencer config and governance signalling, world-state sync, the
proving/epoch lifecycle, partial proofs, L1-reorg handling, and pending-chain recovery.

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

## Setup factories

`setup.ts` holds thin factories over `SingleNodeTestContext.setup`, named by the prover mode a test
wants. Tests call the factory rather than the static method directly:

- `setupWithProver(opts)` — a single sequencer plus the context's fake in-process prover node. This is
  the default the proving / partial-proofs / l1-reorgs / recovery / misc suites use.
- `setupBlockProducer(opts)` — a single production sequencer with **no prover node**, used by the
  block-building / sequencer / sync suites. It raises `aztecProofSubmissionEpochs` to `1024` so unproven
  blocks are not pruned without a prover, and points the PXE at `syncChainTip: 'proposed'` so tests can
  assert on freshly proposed blocks. Both are overridable via `opts`.

The `prover/` suite (real Barretenberg proofs) builds its environment through `FullProverTest`, which
extends `SingleNodeTestContext` directly rather than going through a factory.

## Organizing principle

The top level groups tests by node topology and setup model; the second level names the primary
behavior under test (the proving lifecycle, partial proofs, reorgs, recovery) rather than the shared
setup. Each file has a single top-level `describe` named to match its path, and a co-located
`setup.ts` holds any shared timeout/option wiring. A `.parallel` suffix marks files with more than one
top-level `it`; CI splits each `it` into its own job.

## Subfolders

| Path | Contents |
|---|---|
| `block-building/` | Block assembly mechanics under the production sequencer with pipelining. `block_building` (multi-tx blocks, double-spend rejection, log ordering, regressions, and L1 reorgs), `debug_trace` (blocks proposed through a Forwarder proxy, including a failing-then-succeeding propose call), `multiple_blobs` (a block whose combined side effects span more than one EIP-4844 blob). |
| `sequencer/` | Sequencer configuration, governance signalling, and publisher management on a single node. `gov_proposal.parallel` (a 16-validator committee proposes blocks while casting governance votes, and votes even when block building is disabled), `escape_hatch_vote_only` (governance signals advance while the escape hatch is closed), `reload_keystore` (the keystore is hot-reloaded to add a validator and pick up new coinbases), `slasher_config` (slasher config updated at runtime via the admin API), `multi_eoa` (publisher rotation when an L1 tx is withheld; exercises multi-EOA publisher failover), `publisher_funding_multi` (PublisherManager auto top-up of publisher EOAs when balances drop below threshold), `sequencer_config` (runtime `maxL2BlockGas`/`manaTarget` reconfiguration via a live Bot). |
| `fees/` | Fee mechanics on a single node. `fee_asset_price_oracle` (on-chain fee-asset price-oracle convergence; starts its own Anvil instance with a MockStateView etched at the StateView address). |
| `bot/` | Transaction bot implementations. `bot` (transfer bot, AMM bot, and cross-chain bot; exercises fee-juice portal deposits, L2→L1 messages, and bot contract reuse). |
| `sync/` | World-state sync stress and reorg-replay harness. `synching` builds fixture block data (env-gated, slow) and replays it for sync benchmarks and prune/reorg scenarios; only the outer `it.each` runs in CI. |
| `proving/` | Epoch and proof lifecycle. `world_state_pruning` (consecutive epochs prove and finalized blocks are purged from world state beyond the checkpoint-history window), `empty_blocks` (a proof is submitted even with no txs), `long_proving_time` (a prover delay spanning multiple epochs), `multi_proof` (multiple prover nodes prove one epoch), `optimistic.parallel` (checkpoint-driven proving across the happy path and several mid-epoch / last-slot / during-proving reorg cases), `proof_fails.parallel` (proof not accepted after epoch end; proving aborts when the next epoch ends), `cross_chain_public_message` (an epoch with a public tx that consumes an L1→L2 message in the block it lands, guarding against a sequencer/prover state-root mismatch), `upload_failed_proof` (a failed proving job's state is uploaded and re-run on a fresh instance). |
| `prover/` | Real-proof exercises on the `FullProverTest` harness (real Barretenberg when `FAKE_PROOFS=0`, fake otherwise). `client` (client-side proof generation and `verifyProof` for private and public transfers, no on-chain submission) and `full` (the end-to-end pipeline: client proves, node builds blocks, prover node generates epoch proofs, L1 verifies them). |
| `partial-proofs/` | Manually driven partial-proof submission. `single_root` (the prover node's `startProof` path on a single root) and `multi_root` (three partial-proof roots are staged and messages consume against any covering root, exercising the multi-root Outbox semantics). |
| `l1-reorgs/` | Behavior under L1 reorgs, split by what reorgs. `blocks.parallel` (prune L2 blocks when a reorg drops a proof, hold when a replacement proof lands in the window, restore blocks when a proof reappears, prune pending-chain blocks, and see new blocks added by a reorg) and `messages.parallel` (L1→L2 messages updated by a reorg, and a missed message inserted by one). `setup.ts` holds the shared `FAST_REORG_TIMING` profile and delayer wiring. |
| `recovery/` | Reorg and pending-chain recovery. `manual_rollback` (the `rollbackTo` admin API rolls back to an unfinalized block), `sync_after_reorg` (a fresh node syncs world state past an unpruned reorg window), `prune_when_cannot_build` (a solo sequencer prunes the pending chain via the fallback path when it cannot propose). |
| `misc/` | Genuine single-node outliers. `missed_l1_slot` (the sequencer builds a block after missed L1 slots once the previous checkpoint is synced). |
