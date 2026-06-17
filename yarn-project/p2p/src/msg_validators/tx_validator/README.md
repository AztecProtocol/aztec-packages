# Transaction Validation

This module defines the transaction validators and the factory functions that assemble them for each entry point into the system.

## Validation Strategy

Transactions enter the system through different paths. **Unsolicited** transactions (gossip and RPC) are fully validated before acceptance. **Solicited** transactions (req/resp and block proposals) are only checked for well-formedness because we must store them for block re-execution — they may ultimately be invalid, which is caught during block building and reported as part of block validation/attestation.

When solicited transactions fail to be mined, they may be migrated to the pending pool. At that point, the pool runs the state-dependent checks that were skipped on initial receipt.

## Entry Points

### 1. Gossip (libp2p pubsub)

**Factory**: `createFirstStageTxValidationsForGossipedTransactions` + `createSecondStageTxValidationsForGossipedTransactions`
**Called from**: `LibP2PService.handleGossipedTx()` in `libp2p_service.ts`

Unsolicited transactions from any peer. Fully validated in two stages with a pool pre-check in between to avoid wasting CPU on proof verification for transactions the pool would reject:

| Step | What runs | On failure |
|------|-----------|------------|
| **Stage 1** (fast) | TxPermitted, Data, Metadata, Timestamp, DoubleSpend, Gas, Phases, BlockHeader | Penalize peer, reject tx |
| **Pool pre-check** | `canAddPendingTx` — checks for duplicates, pool capacity | Ignore tx (no penalty) |
| **Stage 2** (slow) | Proof verification | Penalize peer, reject tx |
| **Pool add** | `addPendingTxs` | Accept, ignore, or reject |

Each stage-1 and stage-2 validator is paired with a `PeerErrorSeverity`. If a validator fails, the sending peer is penalized with that severity. The `doubleSpendValidator` has special handling: its severity is determined by how recently the nullifier appeared (recent = high tolerance, old = low tolerance).

### 2. JSON-RPC

**Factory**: `createTxValidatorForAcceptingTxsOverRPC`
**Called from**: `AztecNodeService.isValidTx()` in `aztec-node/server.ts`

Unsolicited transactions from a local wallet/PXE. Runs the full set of checks as a single aggregate validator:

- TxPermitted, Size, Data, Metadata, Timestamp, DoubleSpend, Phases, BlockHeader
- Gas (optional — skipped when `skipFeeEnforcement` is set)
- Proof verification (optional — skipped for simulations when no verifier is provided)

### 3. Req/resp and block proposals

**Factories**: `createTxValidatorForReqResponseReceivedTxs`, `createTxValidatorForBlockProposalReceivedTxs`
**Called from**: `LibP2PService.validateRequestedTx()`, `LibP2PService.validateTxsReceivedInBlockProposal()`, and `BatchRequestTxValidator` in `batch-tx-requester/tx_validator.ts`

Solicited transactions — we requested these from peers or received them as part of a block proposal we need to validate. We must accept them for re-execution even if they are invalid against the current state. Only well-formedness is checked:

- Metadata, Size, Data, Proof

State-dependent checks are deferred to either the block building validator (for txs included in blocks) or the pending pool migration validator (for unmined txs migrating to pending).

### 4. Block building

**Factory**: `createTxValidatorForBlockBuilding`
**Called from**: `CheckpointBuilder.makeBlockBuilderDeps()` in `validator-client/checkpoint_builder.ts`

Transactions already in the pool, about to be sequenced into a block. Re-validates against the current state of the block being built. **This is where invalid txs that entered via req/resp or block proposals are caught** — their invalidity is reported as part of block validation/attestation.

Runs:
- Timestamp, DoubleSpend, Phases, Gas, BlockHeader

Does **not** run:
- Proof, Data — already verified on entry (by gossip, RPC, or req/resp validators)

### 5. Pending pool migration

**Factory**: `createTxValidatorForTransactionsEnteringPendingTxPool`
**Called from**: `TxPoolV2Impl` (injected as the `createTxValidator` factory via `TxPoolV2Dependencies`)

When transactions that arrived via req/resp or block proposals fail to be mined, they may need to be included in our pending pool. These txs only had well-formedness checks on receipt, so the pool runs the state-dependent checks they missed before accepting them.

This validator is invoked on **every** transaction potentially entering the pending pool:
- `addPendingTxs` — validating each tx before adding
- `prepareForSlot` — unprotecting txs back to pending after a slot ends
- `handlePrunedBlocks` — unmining txs from pruned blocks back to pending
- Startup hydration — revalidating persisted non-mined txs on node restart

Runs:
- DoubleSpend, BlockHeader, GasLimits, MaxFeePerGas, Timestamp, AllowedSetupCalls

Operates on `TxMetaData` (pre-built by the pool) rather than full `Tx` objects.

The `AllowedSetupCallsMetaValidator` checks a precomputed boolean flag (`TxMetaData.allowedSetupCalls`) rather than re-running the full `PhasesTxValidator`. This flag is computed by `createCheckAllowedSetupCalls` when the tx first enters the pool (via `addProtectedTxs` or startup hydration), so the pool migration validator can reject txs with disallowed setup calls without needing the full `Tx` object or its dependencies.

## Individual Validators

| Validator | What it checks | Benchmarked verification duration |
|-----------|---------------|---------------|
| `TxPermittedValidator` | Whether the system is accepting transactions (controlled by config flag) | 1.56 us |
| `DataTxValidator` | Transaction data integrity — correct structure, non-empty fields | 4.10–18.18 ms |
| `SizeTxValidator` | Transaction does not exceed maximum size limits | 2.28 us |
| `MetadataTxValidator` | Chain ID, rollup version, protocol contracts hash, VK tree root | 4.18 us |
| `TimestampTxValidator` | Transaction has not expired (expiration timestamp vs next slot) | 1.56 us |
| `DoubleSpendTxValidator` | Nullifiers do not already exist in the nullifier tree | 106.08 us |
| `GasTxValidator` | Gas limits are within bounds (delegates to `GasLimitsValidator`), max fee per gas meets current block fees (delegates to `MaxFeePerGasValidator`), and fee payer has sufficient FeeJuice balance | 1.02 ms |
| `GasLimitsValidator` | Gas limits are >= fixed minimums and <= AVM max processable L2 gas. Used standalone in pool migration; also called internally by `GasTxValidator` | 3–10 us |
| `MaxFeePerGasValidator` | Max fee per gas >= current block gas fees on both dimensions (DA and L2). Used standalone in pool migration; also called internally by `GasTxValidator` | 3–10 us |
| `PhasesTxValidator` | Public function calls in setup phase are on the allow list | 10.12–13.12 us |
| `AllowedSetupCallsMetaValidator` | Checks the precomputed `allowedSetupCalls` flag on `TxMetaData`. Used in pool migration instead of the full `PhasesTxValidator` | — |
| `BlockHeaderTxValidator` | Transaction's anchor block hash exists in the archive tree | 98.88 us |
| `TxProofValidator` | Client proof verifies correctly | ~250ms |

## Validator Coverage by Entry Point

| Validator | Gossip | RPC | Req/resp | Block building | Pool migration |
|-----------|--------|-----|----------|----------------|----------------|
| TxPermitted | Stage 1 | Yes | — | — | — |
| Data | Stage 1 | Yes | Yes | — | — |
| Size | — | Yes | Yes | — | — |
| Metadata | Stage 1 | Yes | Yes | — | — |
| Timestamp | Stage 1 | Yes | — | Yes | Yes |
| DoubleSpend | Stage 1 | Yes | — | Yes | Yes |
| Gas (balance + limits) | Stage 1 | Optional* | — | Yes | — |
| GasLimits (standalone) | — | — | — | — | Yes |
| MaxFeePerGas (standalone) | — | — | — | — | Yes |
| Phases | Stage 1 | Yes | — | Yes | — |
| AllowedSetupCalls | — | — | — | — | Yes |
| BlockHeader | Stage 1 | Yes | — | Yes | Yes |
| Proof | Stage 2 | Optional** | Yes | — | — |

\* Gas balance check is skipped when `skipFeeEnforcement` is set (testing/dev). `GasTxValidator` internally delegates to `GasLimitsValidator` and `MaxFeePerGasValidator` as its first steps, so gas limits and fee-per-gas are checked wherever `GasTxValidator` runs. Pool migration uses `GasLimitsValidator` and `MaxFeePerGasValidator` standalone because it doesn't need the balance check.
\** Proof verification is skipped for simulations (no verifier provided).

The gas-limit bounds `GasLimitsValidator` enforces here — the per-tx protocol maxima and the network admission limits — are documented in [`stdlib/src/gas/README.md`](../../../../stdlib/src/gas/README.md) under "Gas and Data Limits".

## Fee-Per-Gas Rejection Strategy

The `MaxFeePerGasValidator` and `InsufficientFeePerGasEvictionRule` reject and evict transactions whose `maxFeesPerGas` falls below the current block's gas fees. This is a simple strategy: if a tx can't pay the current fees, it gets rejected on entry and evicted after each new block.

**Caveat**: This may evict transactions that would become valid again if block fees drop. A more nuanced approach would be to define a threshold (e.g., 50%) and only reject/evict when the tx's max fee falls below that fraction of the current fees. The current approach is simpler and ensures the pool doesn't accumulate transactions with low max fees that are unlikely to be mined soon.
