# Proposal Validation

This module validates `BlockProposal` and `CheckpointProposal` gossipsub messages. Both share the same base `ProposalValidator` (neither subclass overrides `validate()`), with checkpoint-specific logic layered on top in the gossipsub handler.

## BlockProposal

**Topic**: `block_proposal` | **Snappy size limit**: 10 MB

### Stage 1: Gossipsub Validation (ProposalValidator)

File: `proposal_validator.ts`

| # | Rule | Consequence | Severity |
|---|------|-------------|----------|
| 1 | **Slot check**: must be `currentSlot` or `nextSlot`. Previous slot within 500ms tolerance: IGNORE. | REJECT | HighToleranceError |
| 2 | **Signature**: `getSender()` must recover a valid address. If `signedTxs` present, its recovered sender must match. | REJECT | MidToleranceError |
| 3 | **Txs permitted**: if `disableTransactions`, must have 0 txHashes and 0 embedded txs | REJECT | MidToleranceError |
| 4 | **Max txs**: `txHashes.length <= maxTxsPerBlock` | REJECT | MidToleranceError |
| 5 | **Embedded txs in txHashes**: every embedded tx's hash must appear in `txHashes` | REJECT | MidToleranceError |
| 6 | **Proposer check**: signer must match expected proposer for slot (skipped if committee size = 0) | REJECT | MidToleranceError |
| 7 | **Tx hash integrity**: each embedded tx's recomputed hash must match declared hash | REJECT | LowToleranceError |
| 8 | **NoCommitteeError**: epoch cache cannot determine committee | REJECT | LowToleranceError |

Deserialization guards: `BlockProposal.fromBuffer` and `SignedTxs.fromBuffer` both enforce `txCount <= MAX_TXS_PER_BLOCK` (65536). Violation -> REJECT + LowToleranceError.

### Stage 2: Mempool (Attestation Pool)

| # | Rule | Consequence |
|---|------|-------------|
| 9 | **Duplicate**: same archive root already stored | IGNORE (no penalty) |
| 10 | **Per-position cap**: max 2 proposals per (slot, indexWithinCheckpoint) | REJECT + HighToleranceError |
| 11 | **Equivocation**: >1 distinct proposal for same (slot, index) | ACCEPT (rebroadcast for detection). At count=2: `duplicateProposalCallback` fires -> slash event (`OffenseType.DUPLICATE_PROPOSAL`, configured via `slashDuplicateProposalPenalty`) |

### Stage 3: Validator-Client Processing (BlockProposalHandler)

Only runs on validator nodes. Non-validator nodes use a default handler that triggers tx collection without deep validation.

| # | Rule | Failure Reason |
|---|------|----------------|
| 12 | Signature re-check | `invalid_proposal` |
| 13 | ProposalValidator re-run | `invalid_proposal` |
| 14 | Self-proposal filter | Ignored silently |
| 15 | Parent block exists (`lastArchive.root` matches known block or genesis) | `parent_block_not_found` |
| 16 | Parent block slot <= proposal slot | `parent_block_wrong_slot` |
| 17 | Block number not already in archiver | `block_number_already_exists` |
| 18 | Checkpoint number consistency (multiple sub-rules for first/non-first blocks) | `invalid_proposal` |
| 19 | Global variables consistency (non-first block: chainId, version, slot, timestamp, coinbase, feeRecipient, gasFees match parent) | `global_variables_mismatch` |
| 20 | L1-to-L2 message hash matches `proposal.inHash` | `in_hash_mismatch` |
| 21 | All txs referenced by `txHashes` obtainable | `txs_not_available` |
| 22 | **Re-execution**: processed tx count matches `txHashes.length` | `timeout` (ReExTimeoutError) |
| 23 | **Re-execution**: no failed txs | `failed_txs` (ReExFailedTxsError) -- **SLASHABLE** |
| 24 | **Re-execution**: archive root and header match proposal | `state_mismatch` (ReExStateMismatchError) -- **SLASHABLE** |

**Escape hatch**: during escape hatch periods (`isEscapeHatchOpenAtSlot`), re-execution and slashing are both disabled, and the proposal is rejected locally.

**Conditional re-execution**: rules 22-24 only run when at least one condition is true: `fishermanMode` enabled, `slashBroadcastedInvalidBlockPenalty > 0`, committee membership, `alwaysReexecuteBlockProposals`, or `blobClient.canUpload()`.

**Slashing**: only `state_mismatch` and `failed_txs` trigger on-chain slashing (`OffenseType.BROADCASTED_INVALID_BLOCK_PROPOSAL`, gated by `slashBroadcastedInvalidBlockPenalty > 0`). Unknown errors during re-execution do NOT slash.

**Embedded tx validation**: txs in `signedTxs` are validated via `createTxValidatorForBlockProposalReceivedTxs` (well-formedness only) when stored in the tx pool. Invalid embedded txs are rejected from the pool but do not cause the block proposal itself to be rejected at gossipsub level.

### Gossipsub Topic Scoring

| Parameter | Effect |
|-----------|--------|
| P4 (invalidMessageDeliveries) | weight = -20, decay over 4 slots |
| P3 (meshMessageDeliveries) | Enabled only when `expectedBlockProposalsPerSlot > 0` (MBPS mode) |
| P1/P2 | Only active when P3 is enabled |

---

## CheckpointProposal

**Topic**: `checkpoint_proposal` | **Snappy size limit**: 10 MB

### Stage 1: Gossipsub Validation (ProposalValidator)

Same `ProposalValidator.validate()` as BlockProposal (shared implementation, neither subclass overrides it). See BlockProposal Stage 1 rules 1-8.

### Stage 2: Embedded Block Proposal Validation (if `lastBlock` present)

The checkpoint's embedded `lastBlock` is extracted via `getBlockProposal()` and validated through `BlockProposalValidator.validate()` plus block mempool checks.

| Rule | Consequence | File |
|------|-------------|------|
| Block proposal must pass `BlockProposalValidator.validate()` | If REJECT: entire checkpoint REJECTED | `libp2p_service.ts` |
| Block proposal must not exceed per-position cap (2) | Checkpoint REJECTED + HighToleranceError | same |
| Block equivocation detected (>1 proposals for same slot+index) | Checkpoint REJECTED (block itself is ACCEPT for re-broadcast) | same |

### Stage 3: Mempool (Attestation Pool)

| Rule | Consequence | File |
|------|-------------|------|
| Duplicate (same archive ID) | IGNORE (no penalty). Embedded block still processed if valid. | `attestation_pool.ts` |
| Per-slot cap: `MAX_CHECKPOINT_PROPOSALS_PER_SLOT` = 2 | REJECT + HighToleranceError. Embedded block still processed. | same |

### Stage 4: Equivocation Detection

When >1 checkpoint proposals exist for same slot (count > 1): ACCEPT (re-broadcast). At count == 2 (exactly): `duplicateProposalCallback` fires. Proposal NOT further processed. Callback fires only once per equivocation pair.

### Stage 5: Validator-Client Consensus Validation

Determines whether the validator signs an attestation.

| Rule | Consequence | File |
|------|-------------|------|
| Escape hatch open | No attestation | `validator-client/src/validator.ts` |
| Signature invalid (re-check) | No attestation | same |
| Self-proposal | No attestation (ignored) | same |
| `feeAssetPriceModifier` outside [-100, +100] bps | No attestation | same |
| Not in committee (unless fisherman mode) | No attestation | same |
| Checkpoint header mismatch (computed vs proposal) | No attestation | same |
| Archive root mismatch | No attestation | same |
| Epoch out hash mismatch | No attestation | same |
| Last block not found / not matching | No attestation | same |
| Already attested to this or earlier slot | No attestation (unless `attestToEquivocatedProposals`) | same |

**`skipCheckpointProposalValidation` config**: when true, the re-execution checks (header/archive/epoch hash) are all skipped. Signature, fee modifier, committee, escape hatch, and equivocation checks still apply.

### Gossipsub Topic Scoring

P3 enabled with expected rate of 1 message per slot. P4 weight = -20, max P3 penalty = -34 per topic.

