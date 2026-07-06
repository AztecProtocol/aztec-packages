# `p2p` e2e test category

P2P tests run a network of validator nodes over **real libp2p** — a real bootstrap node, discv5
discovery, the GossipSub mesh, the req/resp protocol, and real peer authentication and transport. This
is the category for any test whose subject is the networking layer itself: peer discovery and
rediscovery, gossip mesh formation and propagation, req/resp fetching, preferred-peer / supernode
topologies, and peer auth gating.

Tests whose subject — proposals, attestations, checkpointing, pruning/recovery, offense detection,
sentinel observability — is faithfully reproduced by the in-memory `MockGossipSubNetwork` bus belong in
the `multi-node` category instead, which is far cheaper to run. Only reach for `p2p` when the behavior
under test genuinely cannot be reproduced without real networking.

## Entrypoint

`P2PNetworkTest` (`p2p_network.ts`) is the env-builder for this category. Unlike `MultiNodeTestContext`,
it does **not** extend `SingleNodeTestContext`; it is a parallel, self-contained builder that calls the
root `setup()` directly, then spawns real-libp2p nodes via the factories in
`../fixtures/setup_p2p_test.ts`. Its distinguishing traits:

- A real bootstrap node (`addBootstrapNode`) with a fixed private key, so nodes discover each other via
  discv5 and data directories can be reused across a restart.
- Two validator-registration paths: `applyBaseSetup()` registers the committee post-genesis via the
  on-chain `MultiAdder` cheat (validators are added at `aztecTargetCommitteeSize: 0`, then activated by
  warping past the validator-set lag), while tests that exercise the real onboarding flow call
  `addBootstrapNode()` and register each validator through the CLI `addL1Validator` path instead.
- `waitForP2PMeshConnectivity(nodes, …)` — waits for peer connections and for the GossipSub mesh to
  form on the requested topics; callers that need a proposal to reach the whole committee within a slot
  raise `minMeshPeerCount` for a full mesh.
- Data-directory management: `setup()` creates one root temp dir; `dataDirFor(label)` hands out a nested
  per-role path (`createNodes` appends `-<index>`, single-node factories use it verbatim); `teardown()`
  removes the whole tree in one recursive delete. Test files never `mkdtemp`/`rmSync` themselves.
- One named timing preset: `SHORTENED_BLOCK_TIME_CONFIG_NO_PRUNES` (ethSlot 4s, aztecSlot 12s,
  `aztecProofSubmissionEpochs: 640` so the chain effectively never prunes), used by every file with
  per-file slot/epoch overrides. `WAIT_FOR_TX_TIMEOUT` derives from the env slot duration.

## Shared skeleton and helpers

`shared.ts` holds the common scenario skeleton and the reusable building blocks, so test bodies read
declaratively rather than re-deriving the same ~40 lines of node-creation / mesh-wait / signer-check
boilerplate:

- `runGossipScenario(opts)` — the shared bootstrap→createNodes→mesh→account→(submit)→verify skeleton.
  Each varying part is a callback/flag: validator registration (`beforeCreateNodes`), extra prover /
  monitor nodes (`createExtraNodes`), pre-submit waits (`beforeSubmit`), mesh parameters (`mesh`),
  whether/how many txs to submit (`txsPerNode`, `submitSequentially`), which published checkpoint to
  read signers from (`checkpointSource`), and scenario-specific verification (`afterVerify`).
- `verifyAttestationSigners(t, nodes, checkpoint)` — recovers the attestation signers from a published
  checkpoint and asserts each belongs to the validator set; returns the signers for extra assertions.
- `getPublishedCheckpointForTx(node, txHash)` / `waitForFirstPublishedCheckpoint(t, nodes)` — resolve
  the published checkpoint to read signers from, either from a mined tx's block or by polling for the
  first one indexed by the archiver.
- `waitForNodesToSync(t, nodes)` — wait for every node to catch up to the initial node's tip.
- `maybeCheckQosAlerts(logger)` — run the QoS Grafana alert check when `CHECK_ALERTS=true`, else a no-op.
- `submitTransactions` / `submitComplexTxsTo` / `prepareTransactions` — build a throwaway wallet on a
  node and submit (or pre-prove) N txs through it.

Node factories live in `../fixtures/setup_p2p_test.ts` (`createNodes`, `createNode`,
`createNonValidatorNode`, `createProverNode`, `createValidatorConfig`, `generatePrivateKeys`), shared
with `P2PNetworkTest`.

## Organizing principle

Each file is one real-libp2p scenario the mock-gossip bus cannot reproduce, with a single top-level
`describe` named `e2e_p2p_*`. Files are plain `*.test.ts` (no `.parallel` suffix): each is one CI
container running the whole file. Because the nodes bind **fixed UDP/TCP ports**, two p2p test files
must never run at the same time — run them one at a time locally.

## Files

| File | Scenario |
|---|---|
| `gossip_network.test.ts` | The baseline gossip test, two describes on the shared skeleton: `cheat-registered validators` (4 validators + a p2p-only prover + a re-execution monitor; txs mine from every node, attestation signers match the committee, and the prover produces a proven block by collecting txs over p2p) and `on-chain-registered validators (no cheats)` (validators registered via the real `addL1Validator` CLI path with a ZkPassport mock proof, then the same propagation/signer checks). |
| `fee_asset_price_oracle_gossip.test.ts` | A fee-asset price set on a mock L1 `StateView` contract gossips through the validator network and the rollup's on-chain price converges on it across two adjustments. Runs on the shared skeleton with `txsPerNode: 0` — no txs are submitted; empty blocks carry the price. |
| `late_prover_tx_collection.test.ts` | A prover that joins after a block was already mined learns the block from its archiver (via L1 sync) but is missing the txs, and must fetch them from peers over the req/resp `BLOCK_TXS` path — the same path `ProverNode.gatherTxs` takes when preparing an epoch proof. |
| `preferred_gossip_network.test.ts` | A preferred-node (supernode) topology: preferred nodes accept only validator connections, a no-discovery validator reaches the network exclusively through them, and gossip monitors assert traffic flows only through the expected peers. Verifies exact per-role peer counts, tx mining, and attestation signers. |
| `rediscovery.test.ts` | Nodes form a mesh, then the bootstrap node and all validators are stopped and restarted from their data directories with no bootstrap ENR — they rejoin purely from the discv5 peer tables they persisted to disk. |
| `reqresp/reqresp.test.ts` | Tx gossip is disabled on the upcoming proposer nodes, so they must request the missing tx data over req/resp before they can attest; also asserts a multiple-blocks-per-slot checkpoint is produced with correctly ordered blocks. The scenario body lives in `reqresp/utils.ts`. |
