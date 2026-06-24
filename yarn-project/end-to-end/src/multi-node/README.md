# `multi-node` e2e test category

Multi-node tests run N validator nodes sharing an in-memory `MockGossipSubNetwork` bus (no real
libp2p). This is the category for any multi-node test whose subject — proposals, attestations,
checkpointing, pruning/recovery, offense detection — is faithfully reproduced by the mock-gossip bus.
Tests that need *real networking* (peer discovery / discv5, the req/resp protocol, gossip mesh
formation, peer auth/scoring, transport behavior) belong in the `p2p` category instead.

## Base class

`MultiNodeTestContext` (`multi_node_test_context.ts`) extends `SingleNodeTestContext` (in
`../single-node/`) with the N-validator topology:

- `createValidatorNode` / `createValidatorNodeAt(index)` spawn nodes on the mock-gossip bus; passing
  the same index to two calls (with different coinbases) models an equivocating proposer that shares
  a key across two nodes. Validators with no spawned node stay registered-but-offline.
- The per-validator registration accessors (`validatorAt` / `addressAt` / `privateKeyAt`) for the
  validators registered at genesis via `initialValidators`.
- `getSlashingContracts()` for the rollup / slasher / slashing-proposer L1 contracts.
- The committee convergence helpers `waitForAllNodes*` and `findSlotsWithProposers`.

The environment (in-process anvil + L1 deploy), the prover lifecycle, and the proving / reorg waiters
all live on the parent and are inherited.

## Shared presets and helpers

These are exported from `multi_node_test_context.ts` and spread into a `setup(...)` call rather than
copy-pasted:

- `buildMockGossipValidators(n)` — the deterministic validator set (keys from
  `getPrivateKeyFromIndex(i + 3)`), passed as `initialValidators`.
- `MOCK_GOSSIP_MULTI_VALIDATOR_OPTS` — a tight committee on the mock bus with no prover
  (`{ mockGossipSubNetwork, skipInitialSequencer, startProverNode: false, aztecProofSubmissionEpochs:
  1024, numberOfAccounts: 0 }`). Tests that want a prover leave `startProverNode` explicit.
- `SLASHER_ENABLED_MULTI_VALIDATOR_OPTS` — the same committee with the slasher turned on, used by the
  offense-detection tests.
- `defaultSlashingPenalties(unit?)` / `withOnlyOffense(offense, unit?)` — build the per-offense
  `slash*Penalty` knobs; `withOnlyOffense` zeroes all but the named offense to isolate one offense.
- `setupHaPairs(test, validators, { baseOpts, coinbases })` — stands up two HA pairs (nodes 0/1 share
  keys pk1+pk2, nodes 2/3 share pk3+pk4), each pair on a shared slashing-protection DB with distinct
  per-node coinbases. Used by the `high-availability/` tests.

## Organizing principle

The top level groups tests by node topology and setup model; the second level names the primary
behavior under test, not the shared setup or a flag. Multiple-blocks-per-slot and proposer pipelining
are default traits of block production here, not separate categories. Each file has a single top-level
`describe` named to match its path, and a co-located `setup.ts` holds shared setup. A `.parallel`
suffix marks files with more than one top-level `it`; CI splits each `it` into its own job.

## Subfolders

| Folder | Base / preset | Contents |
|---|---|---|
| `block-production/` | `MultiNodeTestContext` + MBPS/consensus timing (`setup.ts`) | Happy-path committee block production with multiple blocks per slot and pipelining as the default cadence: `simple`, `high_tps`, `first_slot` (blocks on the first two slots of an epoch), `deploy_and_call_ordering` (a contract deployed and called in separate blocks of one slot), `cross_chain_messages.parallel` (multi-block slots carrying L2→L1 and L1→L2 messages), `proposed_chain.parallel` (txs anchored to proposed blocks; non-validators re-execute and sync multi-block slots), `proof_boundary.parallel` (the proof-submission deadline vs. the pipelining boundary slot, across five proof-landing scenarios), `redistribution.parallel` (checkpoint budget redistributed so a late tx burst fits across the last blocks), `blob_promotion` (a promotion-disabled node fetches blobs while peers skip them, and a high-block-count checkpoint still proves). |
| `recovery/` | `MultiNodeTestContext` + MV/MBPS timing | The chain detects a bad/withheld/conflicting proposal and recovers: `proposal_failure_recovery.parallel` (all nodes prune and recover when a proposer fails to publish to L1), `pipeline_prune` (an uncheckpointed-blocks prune under pipelined MBPS, then recovery to a multi-block checkpoint), `equivocation_recovery` (an L1-confirmed checkpoint overrides a gossip-only equivocating proposal, the chain heals, and observers record the offense). |
| `invalid-attestations/` | `MultiNodeTestContext` (slasher on) | Invalid checkpoints are detected, invalidated on L1, and the chain progresses: `invalidate_block.parallel`, a six-validator suite injecting insufficient/fake/high-s/unrecoverable/shuffled attestations and withheld blobs. |
| `high-availability/` | `MultiNodeTestContext` + `setupHaPairs` | HA-pair sync and handoff between nodes that share validator keys: `ha_sync` (a peer that did not build a block syncs to the proposed chain tip over P2P), `ha_checkpoint_handoff` (a peer records and takes over a pipelined checkpoint when its partner proposes the previous slot). |
| `slashing/` | `MultiNodeTestContext` + `SLASHER_ENABLED_MULTI_VALIDATOR_OPTS` (`setup.ts`) | Pure offense detection: a validator equivocates and the slasher records the offense. `duplicate_proposal` and `duplicate_attestation`. |

## Helper surface

Prefer these named waiters over hand-rolled `retryUntil` / raw `.on` / `sleep` polling in test bodies.

On `SingleNodeTestContext` (inherited):

- `waitUntilEpochStarts(epoch)` / `waitUntilNextEpochStarts()` — epoch-boundary waiters.
- `waitUntilCheckpointNumber(n)` / `waitUntilProvenCheckpointNumber(n)` — checkpoint waiters.
- `waitUntilLastSlotOfProofSubmissionWindow(epoch)` — proof-window timing.
- `waitForNodeToSync(blockNumber, type)` — single-node sync wait.
- `watchSequencerEvents(sequencers, …)` accumulates state-changes and fail-events across sequencers;
  `assertNoFailuresFromSequencers(failEvents)` asserts none fired.
- `waitForSequencerEvent(sequencer, event, match?, opts)` — one-shot wait for a matching event, with
  timeout and listener cleanup.
- `assertMultipleBlocksPerSlot(n)` — asserts some checkpoint has at least `n` blocks (MBPS).

Added by `MultiNodeTestContext`:

- `waitForAllNodes(predicate, opts)` and the conveniences
  `waitForAllNodesToReachProvenCheckpoint(target, opts)` and
  `waitForAllNodesToReachBlockAtSlot(slot, tag, match?, opts)` — multi-node convergence.
- `findSlotsWithProposers(count, predicate, opts)` — finds N consecutive slots whose proposers
  satisfy `predicate`, warping the L1 clock forward and retrying on `EpochNotStable`.

On `ChainMonitor` (`@aztec/ethereum/test`):

- `waitUntilCheckpoint(n)` / `waitUntilCheckpointProven(n)`, `waitUntilL2Slot(slot)`,
  `waitUntilL1Block` / `waitUntilL1Timestamp`.

Node-only / wallet-only waits (no context dependency) live in `../fixtures/wait_helpers.ts`:

- `waitForBlockNumber(node, target, { tag })` / `waitForProvenBlock(node, target)`.
- `waitForNodeCheckpoint(node, target, opts)` / `waitForNodeProvenCheckpoint(node, target)`.
- `waitForTxs(node, txHashes, opts)` — the plural form of `waitForTx`.
