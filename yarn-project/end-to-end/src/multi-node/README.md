# `multi-node` e2e test category

Multi-node tests run N validator nodes sharing the in-memory `MockGossipSubNetwork` bus (no real
libp2p). This is the **default** category for any multi-node test whose subject — proposals,
attestations, checkpointing, pruning/recovery, slashing, consensus, governance via proposals,
gossiped application messages — is faithfully reproduced by the mock-gossip bus. Tests that need
*real networking* (peer discovery / discv5, the req/resp protocol, gossip mesh formation, peer
auth/scoring, transport behavior) belong in the `p2p` category instead.

## Base-class hierarchy

```
SingleNodeTestContext            single_node_test_context.ts — the prod-sequencer single-node topology
  │   Owns the environment (in-proc anvil + L1 deploy), node spawning (createNonValidatorNode /
  │   createProverNode incl. mock-gossip p2pServiceFactory wiring — harmless with one node), the
  │   ChainMonitor, and the epoch / checkpoint / proof-window / reorg waiters and assertion helpers.
  │   DEFAULT inboxLag: 2 (the intended value when pipelining).
  └─ MultiNodeTestContext        multi_node_test_context.ts — extends the parent with the N-validator
        topology: createValidatorNode, the all-node convergence helpers (waitForAllNodes*,
        findSlotsWithProposers), and the multi-validator presets/helpers below.
```

`ValidatorRegistrationHarness` (`validator_registration_harness.ts`) composes a `MultiNodeTestContext`
and adds on-chain validator registration + the slasher contracts the slashing/sentinel tests need.

`SingleNodeTestContext` is exactly the base we will later promote to a top-level `single-node/`
category; building it now makes that promotion a pure folder move (see "Deferred" below).

## Shared presets / helpers

Exported from the context files; spread into a `setup(...)` call rather than copy-pasting option blocks.

On `single_node_test_context.ts` (re-exported from `multi_node_test_context.ts`):
- `FAST_REORG_TIMING` — timing-only profile `{ ethereumSlotDuration: 4, aztecSlotDuration: 36,
  blockDurationMs: 8000, aztecEpochDuration: 4, anvilSlotsInAnEpoch: 32 }` for the fast L1-reorg tests.
  Intent-encoding fields (`maxSpeedUpAttempts`, `cancelTxOnTimeout`, `aztecProofSubmissionEpochs`) stay
  explicit; `aztecEpochDuration` is overridable after the spread (one reorg block uses 8).

On `multi_node_test_context.ts`:
- `buildMockGossipValidators(n): RegisteredValidator[]` — the deterministic `initialValidators` builder
  (keys from `getPrivateKeyFromIndex(i + 3)`) that every direct multi-validator test used to copy-paste.
- `MOCK_GOSSIP_MULTI_VALIDATOR_OPTS` — the tight-cluster spread `{ mockGossipSubNetwork: true,
  skipInitialSequencer: true, startProverNode: false, aztecProofSubmissionEpochs: 1024,
  numberOfAccounts: 0 }`. Tests that want a prover (MBPS/HA-sync) leave `startProverNode` explicit;
  `ha_sync` does NOT use this preset because it keeps its initial sequencer (no `skipInitialSequencer`).
- `defaultSlashingPenalties(unit?)` / `withOnlyOffense(offense, unit?)` — build the 10 per-offense
  `slash*Penalty` knobs; `withOnlyOffense` zeroes all but the named offense (replaces the manual
  ~9-line zero-out in the slashing tests). Applied only where it is behavior-preserving and clarifies
  intent — tests that rely on the config penalty defaults leave the knobs unset.
- `setupHaPairs(test, validators, { baseOpts, coinbases })` — stands up two HA pairs (nodes[0]/[1] share
  keys pk1+pk2, nodes[2]/[3] share pk3+pk4) with a per-pair shared slashing-protection DB and distinct
  per-node coinbases. Used by both `ha/` tests; the per-test divergence (publishing on/off,
  buildCheckpointIfEmpty) is passed through `baseOpts`.

## Subfolder map

| Folder | Base | Contents |
|---|---|---|
| `single-node/` | `SingleNodeTestContext` | The single-node-topology tests (one sequencer ± a prover): `proving.parallel` (merge of the former `multiple` + `empty_blocks_proof` + `long_proving_time`), `multi_proof`, `proof_public_cross_chain`, `upload_failed_proof`, `proof_fails.parallel`, `partial_proof_multi_root` (co-located with the former `partial_proof` `it`), `l1_reorgs.parallel`, `optimistic_proving.parallel`, `node_reorg_recovery` (former `manual_rollback` + `sync_after_reorg`), `missed_l1_slot`. |
| `consensus/` | `MultiNodeTestContext` + MV preset | Multi-validator block/checkpoint production: `block_building.parallel` (merge of `simple_block_building` + `high_tps_block_building`), `first_slot`, `proof_at_boundary.parallel`. |
| `prune/` | `MultiNodeTestContext` + MV preset | Prune-and-recover: `missed_l1_publish`, `orphan_block_prune` (kept as two files; `orphan_block_prune` uses `findSlotsWithProposers`). |
| `ha/` | `MultiNodeTestContext` + `setupHaPairs` | HA-pair sync / handoff: `ha_sync`, `ha_checkpoint_handoff`. |
| `slashing/` | `ValidatorRegistrationHarness` (or `MultiNodeTestContext` for `equivocation`/`invalidate_block`) | Slasher offenses: `equivocation_slash.parallel` (merge of `duplicate_attestation_slash` + `duplicate_proposal_slash`), `equivocation`, `invalidate_block.parallel`. (Renamed from the old `e2e_slashing/` sub-folder.) |
| *(top level)* | `MultiNodeTestContext` + MV preset | `mbps.parallel`, `mbps.pipeline.parallel`, `mbps_redistribution` — **dissolution pending review** (see below). |

`.parallel.test.ts` files are split per-`it` by CI, so a multi-`it` merge does not grow wall-clock.

## MBPS / pipelining dissolution — PENDING REVIEW

Now that every multi-validator test runs with MBPS + pipelining timing and `inboxLag: 2`, the three
dedicated MBPS files (`mbps.parallel`, `mbps.pipeline.parallel`, `mbps_redistribution`) are largely
redundant. The per-assertion disposition — which assertions are redundant vs. genuinely unique, and the
exact `consensus/`/`prune/` suite each unique one folds into — is recorded in
`tmp/e2e-survey/mbps-deletion-candidates.md` and **awaits Santiago's sign-off**. Until then the three
files stay in place and keep running; do not delete or fold them.

## Deferred: top-level `single-node/` category

The `single-node/` subfolder already runs on the dedicated `SingleNodeTestContext`. Promoting it to a
top-level `single-node/` e2e category is deferred until the other single-node tests (e.g. the
`e2e_prover/*` real-BB proving tests) can consolidate onto the same harness; at that point it is a pure
folder move with no setup changes.

## Helper surface

Prefer these named waiters over hand-rolled `retryUntil` / raw `.on` / `sleep` polling in test bodies.

On `SingleNodeTestContext` (inherited by `MultiNodeTestContext`):

- `waitUntilEpochStarts(epoch)` / `waitUntilNextEpochStarts()` — epoch-boundary waiters.
- `waitUntilCheckpointNumber(n)` / `waitUntilProvenCheckpointNumber(n)` — checkpoint waiters.
- `waitUntilLastSlotOfProofSubmissionWindow(epoch)` — proof-window timing.
- `waitForNodeToSync(blockNumber, type)` — single-node sync wait.
- `watchSequencerEvents(sequencers, ...)` — accumulates state-changes and fail-events across
  sequencers; `assertNoFailuresFromSequencers(failEvents)` asserts none fired.
- `waitForSequencerEvent(sequencer, event, match?, opts)` — one-shot wait for a matching sequencer
  event, with timeout and listener cleanup.
- `assertMultipleBlocksPerSlot(n)` — asserts some checkpoint has ≥ n blocks (MBPS).

Added by `MultiNodeTestContext`:

- `waitForAllNodes(predicate, opts)` and the conveniences
  `waitForAllNodesToReachProvenCheckpoint(target, opts)` /
  `waitForAllNodesToReachBlockAtSlot(slot, tag, match?, opts)` — multi-node fan-out convergence.
- `findSlotsWithProposers(count, predicate, opts)` — finds N consecutive slots whose proposers
  satisfy `predicate`, warping the L1 clock forward and retrying on `EpochNotStable`.

On `ChainMonitor` (`@aztec/ethereum/test`):

- `waitUntilCheckpoint(n)` / `waitUntilCheckpointProven(n)`, `waitUntilL2Slot(slot)`,
  `waitUntilL1Block` / `waitUntilL1Timestamp`.

Node-only / wallet-only waits (no context dependency) live in `../fixtures/wait_helpers.ts`:

- `waitForBlockNumber(node, target, { tag })` / `waitForProvenBlock(node, target)`.
- `waitForNodeCheckpoint(node, target, opts)` / `waitForNodeProvenCheckpoint(node, target)`.
- `waitForTxs(node, txHashes, opts)` — the plural form of `waitForTx`.
