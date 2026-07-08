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

Prefer these named waiters — and the node-level ones in `../fixtures/wait_helpers.ts` — over hand-rolled
`retryUntil` / `.on` / `sleep` polling in test bodies; the full catalog, including the helpers this base
class defines, is listed under [Helper surface](../multi-node/README.md#helper-surface) in the multi-node
README.

## Setup factories

`setup.ts` holds thin factories over `SingleNodeTestContext.setup`, named by the prover mode a test
wants. Tests call the factory rather than the static method directly:

- `setupWithProver(opts)` — a single sequencer plus the context's fake in-process prover node. This is
  the default the proving / partial-proofs / l1-reorgs / recovery / misc suites use.
- `setupBlockProducer(opts)` — a single production sequencer with **no prover node**, used by the
  block-building / sequencer / sync suites. It raises `aztecProofSubmissionEpochs` to
  `NO_REORG_SUBMISSION_EPOCHS` (1024) so unproven blocks are not pruned without a prover, and points the
  PXE at `syncChainTip: 'proposed'` so tests can assert on freshly proposed blocks. Both are overridable
  via `opts`.

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
| `sequencer/` | Sequencer configuration, governance signalling, and publisher management on a single node. `gov_proposal.parallel` (a 16-validator committee proposes blocks while casting governance votes, and votes even when block building is disabled), `escape_hatch_vote_only` (governance signals advance while the escape hatch is closed), `reload_keystore` (the keystore is hot-reloaded to add a validator and pick up new coinbases), `multi_eoa` (publisher rotation when an L1 tx is withheld; exercises multi-EOA publisher failover), `publisher_funding_multi` (PublisherManager auto top-up of publisher EOAs when balances drop below threshold), `runtime_config` (the former `slasher_config` and `sequencer_config` admin-API checks on one node: slasher inactivity-config getters, plus runtime `maxL2BlockGas`/`manaTarget` reconfiguration enforced via a live Bot). |
| `fees/` | Fee mechanics on a single node. `fee_asset_price_oracle` (on-chain fee-asset price-oracle convergence; starts its own Anvil instance with a MockStateView etched at the StateView address). The remaining files run on the `FeesTest` harness (`fees_test.ts`), which extends `SingleNodeTestContext` with the fee/gas domain setup (FPC funding, fee-juice bridging, banana token): `account_init` (fee payment during account-contract initialization), `failures` (fees still charged when txs revert in setup/app/teardown), `fee_juice_payments` (direct Fee Juice payment with and without initial funds), `fee_settings` (max-fee-per-gas handling, stale-fee-snapshot race, governance fee-config bump), `gas_estimation.parallel` (gas-estimation accuracy and FPC teardown gas prediction), `private_payments.parallel` (private fee payment via the BananaCoin FPC, plus the single-assertion public-FPC and sponsored-FPC payment checks folded onto the same fixture from the former `public_payments`/`sponsored_payments` files). |
| `cross-chain/` | L1↔L2 messaging on a single node, on the `CrossChainMessagingTest` harness (`cross_chain_messaging_test.ts`), which extends `SingleNodeTestContext` and owns a `CrossChainTestHarness` plus the L1 inbox/outbox handles (it auto-proves via an `EpochTestSettler` when no prover node runs). The shared L1→L2 message helpers live in `message_test_helpers.ts` (`createL1ToL2MessageHelpers`, whose injected `markAsProven` lets each suite plug in its own proving policy). `l1_to_l2` (L1→L2 message readiness and duplicate messages, over private and public scope), `l1_to_l2_inbox_drift` (inbox checkpoint drift after a rollup reorg, over private and public scope), `l2_to_l1` (L2→L1 message inclusion across single/multi-message txs and multi-block checkpoints, subtree-root balancing, and a reorg-and-remine case), `token_bridge` (private and public L1→L2 deposits and L2→L1 withdrawals via the TokenBridge — including mint-on-behalf — plus the withdrawal/claim failure cases, merged from the former three `token_bridge_*` files). |
| `bot/` | Transaction bot implementations. `bot` (transfer bot, AMM bot, and cross-chain bot; exercises fee-juice portal deposits, L2→L1 messages, and bot contract reuse). |
| `sync/` | World-state sync stress and snapshot sync. `synching` builds fixture block data (env-gated, slow) and replays it for sync benchmarks and prune/reorg scenarios (only the outer `it.each` runs in CI); `snapshot_sync` exercises the node snapshot upload/download path, syncing fresh nodes from one or multiple snapshot URLs, including fallback from a corrupted snapshot. |
| `proving/` | Epoch and proof lifecycle. `default_node` (basic proving/node coverage that shares one context-default node across three suites: consecutive epochs prove and finalized blocks are purged from world state beyond the checkpoint-history window, a proof is submitted even with no txs, and the node returns initial genesis-block data — the former `world_state_pruning`, `empty_blocks`, and `node_block_api` files), `long_proving_time` (a prover delay spanning multiple epochs), `multi_proof` (multiple prover nodes prove one epoch), `optimistic.parallel` (checkpoint-driven proving across the happy path and several mid-epoch / last-slot / during-proving reorg cases), `proof_fails.parallel` (proof not accepted after epoch end; proving aborts when the next epoch ends), `cross_chain_public_message` (an epoch with a public tx that consumes an L1→L2 message in the block it lands, guarding against a sequencer/prover state-root mismatch), `upload_failed_proof` (a failed proving job's state is uploaded and re-run on a fresh instance), `prover_restart` (a clean prover-node shutdown leaves its in-flight broker jobs untouched, and a restart against the same broker resumes proving from them rather than aborting and re-proving). |
| `prover/` | Real-proof exercises on the `FullProverTest` harness (real Barretenberg when `FAKE_PROOFS=0`, fake otherwise), split by where the proving runs so CI can size their containers independently: `client/client` (client-side proof generation and `verifyProof` for private and public transfers, no on-chain submission) and `server/full` (the end-to-end pipeline: client proves, node builds blocks, prover node generates epoch proofs, L1 verifies them). |
| `partial-proofs/` | Manually driven partial-proof submission. `single_root` (the prover node's `startProof` path on a single root) and `multi_root` (three partial-proof roots are staged and messages consume against any covering root, exercising the multi-root Outbox semantics). |
| `l1-reorgs/` | Behavior under L1 reorgs, split by what reorgs. `blocks.parallel` (prune L2 blocks when a reorg drops a proof, hold when a replacement proof lands in the window, restore blocks when a proof reappears, prune pending-chain blocks, and see new blocks added by a reorg) and `messages.parallel` (L1→L2 messages updated by a reorg, and a missed message inserted by one). `setup.ts` holds the shared `FAST_REORG_TIMING` profile and delayer wiring. |
| `recovery/` | Reorg and pending-chain recovery. `manual_rollback` (the `rollbackTo` admin API rolls back to an unfinalized block), `sync_after_reorg` (a fresh node syncs world state past an unpruned reorg window), `prune_when_cannot_build` (a solo sequencer prunes the pending chain via the fallback path when it cannot propose). |
| `misc/` | Genuine single-node outliers. `missed_l1_slot` (the sequencer builds a block after missed L1 slots once the previous checkpoint is synced). |
