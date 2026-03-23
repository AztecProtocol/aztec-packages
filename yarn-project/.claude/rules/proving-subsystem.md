# Proving Subsystem (Split Proving)

When `PROVER_NODE_SPLIT_PROVING=true`, epoch proving is split into independent checkpoint sub-tree jobs and a top-tree job, coordinated through the broker.

## Architecture

- **Sub-tree boundary**: `BlockRollupPublicInputs` (NOT checkpoint root inputs). Sub-trees need NO epoch-level context (no blob challenges, no other checkpoint data).
- **TopTreeOrchestrator**: Computes blob/out-hash state from archiver data directly. No block re-processing, no world state forks, no tx simulation.
- **WorkPoller**: Discovers checkpoints incrementally as posted to L1. Only the top-tree needs epoch completion.
- **claimN API**: Claims multiple work items atomically. WorkPoller passes all discoverable items and available capacity in one request.

## Broker Multi-Consumer Notifications

Multiple `BrokerCircuitProverFacade` instances poll the same broker. Each facade has a unique `consumerId` (randomUUID). Notifications are pushed to ALL consumer queues — each facade filters for its own jobs. Stale queues are expired after inactivity.

If facades steal each other's notifications (single drain-on-read list), the symptom is 27-30 second delays waiting for snapshot sync.

## Serialization Between Jobs

All data flows through broker completion markers. No in-memory passing.

- **Sub-tree to Top-tree**: `jsonStringify` / `jsonParseWithSchema` with `schemaForPublicInputsAndRecursiveProof(BlockRollupPublicInputs.schema, ...)`
- **Top-tree to Publish**: `EpochProofPayload.toBuffer()` / `fromBuffer()` (custom serialization wrapping `RootRollupPublicInputs` + `Proof` + `BatchedBlob`)

## Configuration Gotchas

- `proverBrokerMaxEpochsToKeepResultsFor` must be >= 2 for split proving. With retention=1, epoch N proofs get cleaned when epoch N+1 sub-trees start.
- Sub-tree facades must be stopped after job completion to avoid notification queue pollution.

## Key Files

| File | Purpose |
|------|---------|
| `prover-client/src/orchestrator/checkpoint-sub-tree-orchestrator.ts` | Extends ProvingOrchestrator, stops at BlockRollupPublicInputs |
| `prover-client/src/orchestrator/top-tree-orchestrator.ts` | Standalone, drives checkpoint-root through root-rollup |
| `prover-client/src/proving_broker/broker_prover_facade.ts` | Per-consumer consumerId + configurable snapshotSyncIntervalMs |
| `prover-node/src/monitors/work-poller.ts` | Poll-based work discovery |
| `prover-node/src/split-prover-manager.ts` | SplitProverManager interface + isSplitProverManager() type guard |
| `stdlib/src/proofs/epoch_proof_payload.ts` | EpochProofPayload serializable type |
| `blob-lib/src/batched_blob.ts` | Has toBuffer/fromBuffer for serialization |

## Branch State

All implementation is on `phil/proving-redesign-phase-6`. The stacked phase branches (phase-1 through phase-5) are stale and need updating to match.

E2e tests passing: `epochs_empty_blocks_proof` (single checkpoint) and `epochs_multiple` (3 epochs, 5-6 checkpoints each).
