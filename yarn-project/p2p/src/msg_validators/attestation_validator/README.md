# Attestation Validation

This module validates `CheckpointAttestation` gossipsub messages. Attestations are signatures from committee members endorsing a checkpoint proposal.

**Topic**: `checkpoint_attestation` | **Snappy size limit**: 5 KB

## Stage 1: AttestationValidator (Gossipsub Validation)

| # | Rule | Consequence | Severity | File |
|---|------|-------------|----------|------|
| 1 | **Slot timeliness**: `currentSlot` or `nextSlot`. Previous slot within 500ms: IGNORE. Older: REJECT. | REJECT or IGNORE | HighToleranceError | `attestation_validator.ts` |
| 2 | **Attester signature**: `getSender()` must recover valid address | REJECT | LowToleranceError | same |
| 3 | **Attester in committee**: recovered address in committee for slot | REJECT | HighToleranceError | same |
| 4 | **Proposer exists**: `getProposerAttesterAddressInSlot` must return defined | REJECT | HighToleranceError | same |
| 5 | **Proposer signature**: `getProposer()` must recover valid address | REJECT | LowToleranceError | same |
| 6 | **Proposer matches expected**: recovered proposer = expected for slot | REJECT | HighToleranceError | same |
| 7 | **NoCommitteeError**: committee unavailable | REJECT | LowToleranceError | same |

**Fisherman mode extension** (`FishermanAttestationValidator`): if a checkpoint proposal for the same archive exists in pool, the attestation's `ConsensusPayload` must `.equals()` the stored proposal's payload. On mismatch: REJECT + LowToleranceError.

## Stage 2: Pool Admission

| # | Rule | Consequence |
|---|------|-------------|
| 8 | Sender recoverable (pool-side) | Silent drop |
| 9 | Not a duplicate (same slot + proposalId + signer) | IGNORE |
| 10 | Per-signer cap: `MAX_ATTESTATIONS_PER_SLOT_AND_SIGNER` = 2 | IGNORE |

Own attestations added via `addOwnCheckpointAttestations` bypass the per-signer cap.

## Stage 3: Equivocation Detection

When a signer's attestation count for a slot reaches exactly 2 (different proposals): `duplicateAttestationCallback` fires -> `WANT_TO_SLASH_EVENT` with `OffenseType.DUPLICATE_ATTESTATION`. Attestation still ACCEPTED and rebroadcast. Callback fires once (not again at count 3+).

## Validation at L1 Checkpoint Submission (Archiver)

| Rule | Consequence | File |
|------|-------------|------|
| Each attestation must have recoverable signature (or address-only is allowed but does not count toward quorum) | Checkpoint rejected as invalid | `archiver/src/modules/validation.ts` |
| Attestation at index `i` must correspond to committee member at index `i` | Checkpoint rejected as invalid | same |
| Valid attestation count >= floor(committee * 2/3) + 1 | Checkpoint rejected as invalid | same |
| No committee / escape hatch open | Accepted unconditionally | same |

Note: `skipValidateCheckpointAttestations` config flag bypasses all archiver attestation validation.

## Gossipsub Topic Scoring

P3 enabled with expected messages per slot = `targetCommitteeSize`. Conservative threshold (30% of convergence value). Max P3 penalty = -34 per topic.

