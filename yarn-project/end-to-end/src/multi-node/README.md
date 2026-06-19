# `multi-node` e2e test category

Multi-node tests run N validator nodes sharing the in-memory `MockGossipSubNetwork` bus (no real
libp2p). This is the **default** category for any multi-node test whose subject — proposals,
attestations, checkpointing, pruning/recovery, slashing, consensus, governance via proposals,
gossiped application messages — is faithfully reproduced by the mock-gossip bus. Tests that need
*real networking* (peer discovery / discv5, the req/resp protocol, gossip mesh formation, peer
auth/scoring, transport behavior) belong in the `p2p` category instead.

## Base class: `MultiNodeTestContext`

`multi_node_test_context.ts` owns the environment and lifecycle:

- **Environment** — `MultiNodeTestContext.setup(opts)` stands up in-proc anvil, deploys the full L1
  contract set, and configures fast block times / short epochs. A fake-proof prover node runs by
  default (`startProverNode: true`); the sequencer may build empty blocks.
- **Node spawning** — `createValidatorNode(keys, opts)`, `createNonValidatorNode(opts)`, and
  `createProverNode(opts)` all wire the mock-gossip `p2pServiceFactory` (via
  `getMockPubSubP2PServiceFactory`) onto the shared `MockGossipSubNetwork` bus.
- **Observation** — a running `ChainMonitor` (`monitor`), the `epochCache`, the prover/sequencer
  `Delayer`s, and `this.nodes` / `this.proverNodes`.

### Node count is a knob, not a category boundary

Single-node-topology epochs tests (one sequencer plus a prover node, no second validator) use the
*same* base with one node — they are not a separate category. These members live in this category
and move here as the epochs cluster migrates: `epochs_empty_blocks_proof`, `epochs_long_proving_time`,
`epochs_multiple`, `epochs_multi_proof`, `epochs_partial_proof`, `epochs_proof_fails.parallel`,
`epochs_sync_after_reorg`, `epochs_upload_failed_proof`, `epochs_l1_reorgs.parallel`,
`epochs_manual_rollback`, `epochs_partial_proof_multi_root`, `epochs_proof_public_cross_chain`, and
`epochs_optimistic_proving.parallel`.

`e2e_slashing` sits here as a sub-folder.

## Helper surface

Prefer these named waiters over hand-rolled `retryUntil` / raw `.on` / `sleep` polling in test bodies.

On `MultiNodeTestContext`:

- `waitUntilEpochStarts(epoch)` / `waitUntilNextEpochStarts()` — epoch-boundary waiters.
- `waitUntilCheckpointNumber(n)` / `waitUntilProvenCheckpointNumber(n)` — checkpoint waiters.
- `waitUntilLastSlotOfProofSubmissionWindow(epoch)` — proof-window timing.
- `waitForNodeToSync(blockNumber, type)` — single-node sync wait.
- `waitForAllNodes(predicate, opts)` and the conveniences
  `waitForAllNodesToReachProvenCheckpoint(target, opts)` /
  `waitForAllNodesToReachBlockAtSlot(slot, tag, match?, opts)` — multi-node fan-out convergence.
- `findSlotsWithProposers(count, predicate, opts)` — finds N consecutive slots whose proposers
  satisfy `predicate`, warping the L1 clock forward and retrying on `EpochNotStable`.
- `watchSequencerEvents(sequencers, ...)` — accumulates state-changes and fail-events across
  sequencers; `assertNoFailuresFromSequencers(failEvents)` asserts none fired.
- `waitForSequencerEvent(sequencer, event, match?, opts)` — one-shot wait for a matching sequencer
  event, with timeout and listener cleanup.

On `ChainMonitor` (`@aztec/ethereum/test`):

- `waitUntilCheckpoint(n)` / `waitUntilCheckpointProven(n)`, `waitUntilL2Slot(slot)`,
  `waitUntilL1Block` / `waitUntilL1Timestamp`.

Node-only / wallet-only waits (no context dependency) live in `../fixtures/wait_helpers.ts`:

- `waitForBlockNumber(node, target, { tag })` / `waitForProvenBlock(node, target)`.
- `waitForTxs(node, txHashes, opts)` — the plural form of `waitForTx`.
