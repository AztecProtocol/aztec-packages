# `multi-node` e2e test category

Multi-node tests run N validator nodes sharing the in-memory `MockGossipSubNetwork` bus (no real
libp2p). This is the **default** category for any multi-node test whose subject — proposals,
attestations, checkpointing, pruning/recovery, slashing, consensus, governance via proposals,
gossiped application messages — is faithfully reproduced by the mock-gossip bus. Tests that need
*real networking* (peer discovery / discv5, the req/resp protocol, gossip mesh formation, peer
auth/scoring, transport behavior) belong in the `p2p` category instead.

## Base-class hierarchy

```
SingleNodeTestContext            ../single-node/single_node_test_context.ts — the prod-sequencer single-node topology
  │   Owns the environment (in-proc anvil + L1 deploy), node spawning (createNonValidatorNode /
  │   createProverNode incl. mock-gossip p2pServiceFactory wiring — harmless with one node), the
  │   ChainMonitor, and the epoch / checkpoint / proof-window / reorg waiters and assertion helpers.
  │   DEFAULT inboxLag: 2 (the intended value when pipelining).
  └─ MultiNodeTestContext        multi_node_test_context.ts — extends the parent with the N-validator
        topology: createValidatorNode, the per-validator registration accessors
        (validatorAt/addressAt/privateKeyAt/createValidatorNodeAt) and slasher contracts
        (getSlashingContracts) the slashing tests use, the all-node convergence helpers
        (waitForAllNodes*, findSlotsWithProposers), and the multi-validator presets/helpers below.
```

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
- `SLASHER_ENABLED_MULTI_VALIDATOR_OPTS` — `{ mockGossipSubNetwork: true, skipInitialSequencer: true,
  slasherEnabled: true }`, the offense-detection preset used by `slashing/` (spread alongside
  `slashing/setup.ts`'s `baseSlashingOpts` and `initialValidators`).
- `defaultSlashingPenalties(unit?)` / `withOnlyOffense(offense, unit?)` — build the 10 per-offense
  `slash*Penalty` knobs; `withOnlyOffense` zeroes all but the named offense (replaces the manual
  ~9-line zero-out in the slashing tests). Applied only where it is behavior-preserving and clarifies
  intent — tests that rely on the config penalty defaults leave the knobs unset.
- `setupHaPairs(test, validators, { baseOpts, coinbases })` — stands up two HA pairs (nodes[0]/[1] share
  keys pk1+pk2, nodes[2]/[3] share pk3+pk4) with a per-pair shared slashing-protection DB and distinct
  per-node coinbases. Used by both `high-availability/` tests; the per-test divergence (publishing
  on/off, buildCheckpointIfEmpty) is passed through `baseOpts`.

## Subfolder map

| Folder | Base | Contents |
|---|---|---|
| `block-production/` | `MultiNodeTestContext` + MV/MBPS preset (`setup.ts`) | Happy-path committee production: `simple`, `high_tps`, `first_slot`, `proof_boundary.parallel`, `proposed_chain.parallel`, `cross_chain_messages.parallel`, `deploy_and_call_ordering`, `blob_promotion`, `redistribution.parallel`. |
| `recovery/` | `MultiNodeTestContext` + MV preset | Chain detects a bad/withheld/conflicting proposal then recovers: `proposal_failure_recovery.parallel`, `pipeline_prune`, `equivocation_recovery`. |
| `invalid-attestations/` | `MultiNodeTestContext` | Invalid-checkpoint detection/removal + chain progress: `invalidate_block.parallel`. |
| `high-availability/` | `MultiNodeTestContext` + `setupHaPairs` | HA-pair sync / handoff: `ha_sync`, `ha_checkpoint_handoff`. |
| `slashing/` | `MultiNodeTestContext` (`SLASHER_ENABLED_MULTI_VALIDATOR_OPTS` + `setup.ts`) | Pure offense detection: `duplicate_proposal`, `duplicate_attestation`. |

`.parallel.test.ts` files are split per-`it` by CI, so a multi-`it` merge does not grow wall-clock.

The `single-node/` tests have been promoted to a top-level sibling category; see `../single-node/README.md`.

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
