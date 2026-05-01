# Block Production & Consensus

## Overview

This specification defines how L2 blocks are proposed, attested, and finalized in the Aztec protocol. It covers the validator lifecycle (staking, committee formation, proposer selection), the block and checkpoint proposal flow, attestation collection and verification, timing constraints, slashing conditions, the escape hatch censorship-resistance mechanism, and the relationship between L2 consensus and L1 finality.

Aztec uses a **leader-based, single-proposer-per-slot** consensus protocol with **checkpoint-level attestations**. A deterministically selected proposer builds one or more blocks within a slot, packages them into a checkpoint, collects attestations from the validator committee, and submits the checkpoint to L1. An epoch-level validity proof then advances the chain from "checkpointed" to "proven" status.

**Cross-references:**

- Spec #1 (Protocol Overview) — introduces the sequencer, validator, and prover roles and the block/checkpoint/epoch hierarchy.
- Spec #2 (Constants) — defines `MAX_CHECKPOINTS_PER_EPOCH`, `OUT_HASH_TREE_HEIGHT`, and other structural constants.
- Spec #6 (Block Format & Header) — defines `BlockHeader`, `CheckpointHeader`, `GlobalVariables`, block assembly, and the block lifecycle stages.
- Spec #9 (Rollup Circuits) — defines the proof hierarchy (transaction → block → checkpoint → epoch).
- Spec #10 (L1 Rollup Contract) — defines the `propose()` and `submitEpochRootProof()` functions, chain tips, pruning, and invalidation.
- Spec #15 (Gas & Fees) — defines mana pricing, fee distribution, and reward mechanisms.
- Spec #17 (P2P Network) — defines gossip topics, message formats, and P2P validation rules for proposals and attestations.

## Requirements

### R1: Deterministic Proposer Selection

The protocol MUST select exactly one proposer per slot using a deterministic algorithm seeded by L1 randomness. Given the same epoch, slot, and RANDAO seed, all implementations MUST compute the same proposer. This selection MUST be verifiable on L1 at least one full L2 slot before the slot for which the proposer is selected.

**Rationale:** Deterministic selection prevents disputes over who may propose and enables permissionless verification by any node or the L1 contract. Cementing the choice of proposer at least one slot in advance allows the proposer to start building early.

### R2: Committee-Based Attestation

Checkpoints MUST be attested by more than two-thirds of the validator committee before the epoch proof can be accepted on L1. The committee MUST be deterministically sampled from the active validator set using L1 randomness with sufficient lag to prevent manipulation.

**Rationale:** A supermajority attestation threshold provides Byzantine fault tolerance — the chain remains safe as long as fewer than one-third of committee members are adversarial. Attestations serve two purposes: 1) they prevent bogus checkpoints from being posted to L1, which would halt the chain until these are evicted, and 2) they guarantee availability of transaction data for constructing valid epoch proofs.

### R3: Stake-Based Participation

Validators MUST deposit a minimum stake to participate in consensus. The protocol MUST support adding validators through a queued activation process and removing them through a delayed exit process.

**Rationale:** Proof-of-stake ensures validators have economic incentive to behave honestly. Queued activation prevents validator set churn, and delayed exits ensure slashing can be applied for recently observed misbehavior.

### R4: Slashing for Misbehavior

The protocol MUST support slashing validators who produce invalid blocks, equivocate (produce conflicting proposals or attestations for the same slot), withhold data, attest to invalid blocks, propose with insufficient or incorrect attestations, or remain inactive over extended periods. Slashing MUST be implemented through an on-chain voting mechanism with a quorum requirement.

**Rationale:** Without credible punishment, rational validators could profit from misbehavior (e.g., censoring transactions, double-proposing). Quorum-based voting prevents a single entity from maliciously slashing honest validators.

### R5: Censorship Resistance via Escape Hatch

The protocol MUST provide an alternative block production mechanism (escape hatch) that activates periodically and does not require committee attestations. This ensures chain liveness even when the validator committee is unavailable or colluding to censor transactions.

**Rationale:** If the committee can halt the chain indefinitely, censorship resistance is lost. The escape hatch provides a guaranteed liveness backstop.

### R6: Timing Determinism

Slot timestamps MUST be deterministically derived from the genesis time and slot number. Epoch boundaries MUST be deterministic functions of slot numbers. All implementations MUST agree on these values.

**Rationale:** Consistent timing is required for proposer selection, attestation validity, and L1 verification. Clock drift between nodes is handled by a bounded tolerance window.

### R7: Equivocation Prevention

Validators MUST NOT sign multiple conflicting proposals or attestations for the same slot. The protocol MUST detect equivocation, propagate evidence, and trigger slashing.

**Rationale:** Equivocation can cause chain splits or finality violations. Detection and punishment are essential for consensus safety.

## Specification

### Time Model

Time is divided into **slots** and **epochs**, deterministically derived from the L1 genesis timestamp (see also Spec #10).

```
slot_for_timestamp(ts) = (ts - genesis_time) / slot_duration
epoch_for_slot(s)      = s / epoch_duration
slot_timestamp(s)      = genesis_time + s * slot_duration
```

| Parameter | Description | Configured At |
|---|---|---|
| `genesis_time` | L1 timestamp at rollup deployment | Constructor |
| `slot_duration` | Duration of one slot in seconds | Constructor |
| `epoch_duration` | Number of slots per epoch | Constructor |
| `proof_submission_epochs` | Epochs after an epoch ends during which proofs are accepted | Constructor |

All blocks within a checkpoint share the same slot number and timestamp. Epoch boundaries fall at slot numbers that are multiples of `epoch_duration`.

### Validator Lifecycle

#### Staking and Activation

Validators join the protocol by depositing stake and registering their attester keys:

```
function deposit(attester, withdrawer, public_key_g1, public_key_g2, proof_of_possession, move_with_latest_rollup):
    require balance >= ACTIVATION_THRESHOLD
    verify_proof_of_possession(public_key_g1, public_key_g2, proof_of_possession)
    add_to_entry_queue(attester, withdrawer, public_key_g1)
```

| Parameter | Description |
|---|---|
| `attester` | Ethereum address used for signing attestations and proposals |
| `withdrawer` | Ethereum address authorized to withdraw stake |
| `public_key_g1` | BLS12-381 public key in G1 (for future aggregate signature support) |
| `public_key_g2` | BLS12-381 public key in G2 |
| `proof_of_possession` | BLS signature proving the depositor controls the private key |
| `move_with_latest_rollup` | If true, the validator's stake auto-migrates to new rollup versions |

The `ACTIVATION_THRESHOLD` is the minimum stake required to enter the validator set. Validators are NOT immediately active — they enter a queue and are activated in batches.

#### Entry Queue Processing

The entry queue uses a three-phase flush model to control validator set growth:

| Phase | Condition | Flush Size |
|---|---|---|
| Bootstrap | `active_count == 0 AND queue_size < bootstrap_validator_set_size` | 0 (queue accumulates) |
| Growth | `active_count < bootstrap_validator_set_size` | `bootstrap_flush_size` (large batch) |
| Normal | `active_count >= bootstrap_validator_set_size` | `max(active_count / normal_flush_size_quotient, normal_flush_size_min)` |

The bootstrap phase ensures a minimum number of validators are activated together for initial decentralization. Normal-phase growth is conservative to prevent rapid committee changes.

#### Voluntary Exit

Validators may initiate a voluntary exit:

```
function initiate_exit(attester):
    require caller == withdrawer_of(attester)
    remove_from_active_set(attester)
    create_exit(attester, balance, exit_delay)
```

After the `exit_delay` has elapsed, the validator (or their withdrawer) may withdraw their stake. Exits that have been slashed below the ejection threshold are automatically processed.

#### Forced Ejection

Validators whose effective balance falls below the `ejection_threshold` (due to slashing) are forcibly removed from the active set.

### Committee Formation

At the start of each epoch, a committee is sampled from the active validator set. Committee formation occurs on L1 during the first checkpoint proposal of the epoch via `setupEpoch`.

#### Sampling Algorithm

```
function setup_epoch(epoch):
    seed = get_sample_seed(epoch)
    committee = sample_validators(epoch, seed)
    committee_commitment = keccak256(encode(committee))
    store(epoch, committee_commitment)
    checkpoint_randao(epoch)  // Save randao for future epochs
```

The sampling uses two lag parameters to prevent manipulation:

| Parameter | Description |
|---|---|
| `lag_in_epochs_for_validator_set` | How many epochs in the past to snapshot the active validator set |
| `lag_in_epochs_for_randao` | How many epochs in the past to sample the RANDAO seed |

**Constraint:** `lag_in_epochs_for_validator_set >= lag_in_epochs_for_randao` is enforced on the rollup `ValidatorSelectionLib`. The protocol-level intent is the strict inequality `lag_in_epochs_for_validator_set > lag_in_epochs_for_randao` (and the escape-hatch path enforces this strictly with hard-coded values `2 > 1`); the rollup constructor relaxes the rollup constraint to `>=` solely so that test networks with very short epochs can boot. Production deployments SHOULD use the strict inequality.

The seed is derived from L1 RANDAO (`prevrandao`):

```
sample_seed(epoch) = keccak256(epoch || stored_randao_at_lagged_ts(epoch))
stored_randao_at_lagged_ts(epoch) = randao_trace.upperLookup(slot_timestamp(first_slot_of(epoch - lag_in_epochs_for_randao)))
```

`randao_trace` is a `Trace224` of `(timestamp, randao)` checkpoints. `upperLookup(ts)` returns the most recent stored randao at a timestamp `<= ts`. Randao values are appended to the trace by `checkpointRandao(epoch)` whenever the epoch's randao has not yet been recorded; the rollup constructor seeds the trace with `block.prevrandao` at deployment time so the lookup is well-defined for the bootstrap epochs.

Note that the on-chain seed is `keccak256(epoch, randao_at_lagged_ts)` — both the keccak hashing and the explicit mixing of `epoch` are part of the protocol. The raw randao value alone is not used as the seed.

#### Committee Index Selection

Given a `target_committee_size` and total validator set size, the committee indices are selected using `SampleLib.computeCommittee`:

```
function compute_committee(target_size, set_size, seed) -> indices[]:
    require set_size >= target_size
    // Deterministic pseudorandom sampling without replacement
    // using successive keccak256 hashes of the seed
```

The committee is stored on-chain as a commitment (`keccak256` of the encoded address array). The full committee is reconstructed during proposal verification from the attestation data.

#### Committee Properties

- **Fixed size**: `target_committee_size` validators per epoch.
- **Stable**: The committee does not change within an epoch.
- **Deterministic**: Given the same validator set snapshot and RANDAO seed, all implementations produce the same committee.
- **Committed on-chain**: The committee commitment is stored and verified during proposal and proof submission.

### Proposer Selection

Within each slot, exactly one committee member is designated as the proposer:

```
function compute_proposer_index(epoch, slot, seed, committee_size) -> index:
    return uint256(keccak256(encode(epoch, slot, seed))) % committee_size
```

The proposer for a slot is `committee[compute_proposer_index(epoch, slot, seed, committee_size)]`.

This selection is:
- **Deterministic**: All nodes compute the same proposer for a given slot.
- **Pseudorandom**: The proposer rotates unpredictably across slots (from the perspective of an adversary who cannot predict future RANDAO values).
- **Verifiable on L1**: The rollup contract recomputes the proposer index during `propose()` and verifies the proposer's signature.

Note that the modulo step `keccak256(...) % committee_size` introduces a small modulo bias because `committee_size` may not divide `2^256`. This bias is acceptable here: committee members were themselves chosen by uniform random sampling and are not ordered in any security-sensitive way, so a slightly non-uniform distribution over committee positions does not give an adversary a corresponding advantage.

### Block Proposal Flow

The proposer for a slot assembles and broadcasts blocks, then packages them into a checkpoint for L1 submission.

#### Step 1: Block Assembly

The proposer selects transactions from the mempool and builds blocks as specified in Spec #6 (Block Assembly). Each block within a checkpoint is assigned a sequential `index_within_checkpoint` starting from 0.

All blocks within a checkpoint share the same `GlobalVariables` values (except `block_number`, which increments sequentially):
- `slot_number`, `timestamp`, `coinbase`, `fee_recipient`, `gas_fees` are constant across the checkpoint.
- `chain_id` and `version` match the current protocol configuration.

#### Step 2: Block Proposal Broadcast

For each non-final block in the slot, the proposer creates a `BlockProposal` and broadcasts it on the `block_proposal` gossip topic (see Spec #17). The **last** block in the checkpoint is normally **not** broadcast as a separate `BlockProposal`; instead, the proposer embeds it in the subsequent `CheckpointProposal` (see Step 3).

```
function create_block_proposal(header, index_within_checkpoint, in_hash, archive, txs):
    payload = serialize(
        SignatureDomainSeparator.blockProposal,
        header,
        index_within_checkpoint,
        in_hash,
        archive,
        len(tx_hashes(txs)),
        tx_hashes(txs)
    )
    signature = sign(proposer_key, eth_signed_message_hash(keccak256(payload)))
    return BlockProposal(header, index_within_checkpoint, in_hash, archive, tx_hashes, signature)
```

Note that the signed payload is prefixed with `SignatureDomainSeparator.blockProposal` (see Domain Separators below) and the `tx_hashes` array is length-prefixed. The signature itself is over the EIP-191 `personal_sign`-wrapped digest (i.e. `keccak256("\x19Ethereum Signed Message:\n32" || keccak256(payload))`); every consensus signature in the protocol uses this wrap (see Domain Separators below).

The proposer MUST NOT create multiple block proposals for the same `(slot, index_within_checkpoint)` position. Doing so constitutes equivocation (see Slashing).

Proposers are free to push multiple blocks within a single checkpoint, as long as the cumulative gas used and blob space used across the checkpoint does not exceed the rollup limits. The protocol does not mandate specific heuristics for how proposers should fill a checkpoint.

#### Step 3: Checkpoint Proposal Broadcast

After assembling all blocks for the slot, the proposer creates a `CheckpointProposal` and broadcasts it on the `checkpoint_proposal` gossip topic:

```
function create_checkpoint_proposal(checkpoint_header, archive, last_block):
    payload = serialize(SignatureDomainSeparator.checkpointProposal, checkpoint_header, archive)
    signature = sign(proposer_key, eth_signed_message_hash(keccak256(payload)))
    return CheckpointProposal(checkpoint_header, archive, signature, last_block)
```

The checkpoint proposal MAY include the last block as an embedded `BlockProposal` to reduce latency for validators who have not yet received all blocks.

#### Step 4: Attestation Collection

Committee members validate the checkpoint proposal and, if valid, broadcast `CheckpointAttestation` messages (see Attestation Flow below). The proposer collects attestations from the gossip network.

#### Step 5: L1 Submission

The proposer submits the checkpoint to L1 via the `propose()` function on the rollup contract (see Spec #10). The submission includes:
- The checkpoint header and archive root.
- Packed committee attestations.
- Blob commitment data for data availability.
- A fee oracle input for mana pricing.

### Attestation Flow

Attestations are how committee members express agreement with a checkpoint proposal. Attestations are collected at the checkpoint level — validators do NOT attest to individual block proposals.

#### Attestation Decision

When a committee member receives a `CheckpointProposal`, it evaluates whether to attest:

```
function should_attest(proposal) -> bool:
    // Gate 1: Escape hatch must not be active
    if is_escape_hatch_open(proposal.slot): return false

    // Gate 2: Proposal signature must be valid
    if not verify_signature(proposal): return false

    // Gate 3: Do not attest to own proposals (HA coordination)
    if proposer in own_validator_addresses: return false

    // Gate 4: Must be in committee for this slot
    in_committee = filter_in_committee(proposal.slot, own_validator_addresses)
    if in_committee is empty: return false

    // Gate 5: Validate checkpoint (re-execute blocks)
    if not validate_checkpoint(proposal): return false

    // Gate 6: Equivocation check
    if last_attested_slot >= proposal.slot: return false

    return true
```

#### Checkpoint Validation

Before attesting, committee members SHOULD validate the checkpoint by re-executing the blocks:

```
function validate_checkpoint(proposal) -> bool:
    // 1. Wait for the last block to sync (up to 10s timeout)
    blocks = get_blocks_for_slot(proposal.slot)

    // 2. Fork world state at the parent block
    fork = world_state.fork(parent_block_number)

    // 3. Re-execute all blocks in the checkpoint
    computed = rebuild_checkpoint(blocks, fork, l1_to_l2_messages)

    // 4. Compare computed vs. proposed
    return computed.header == proposal.header
       AND computed.archive == proposal.archive
       AND computed.epoch_out_hash == proposal.epoch_out_hash
```

Note that `epoch_out_hash` is **cumulative across the epoch**: it is computed as `accumulateCheckpointOutHashes([...previous_checkpoint_out_hashes, current_checkpoint_out_hash])`. Validators therefore need access to the prior checkpoints' out hashes to compute the expected value.

Re-execution is configurable per node. The following settings control when re-execution occurs:

| Setting | Description |
|---|---|
| `validator_reexecute` | Re-execute when in committee |
| `always_reexecute_block_proposals` | Re-execute all proposals regardless of committee membership |
| `fisherman_mode` | Re-execute for slashing evidence but do not broadcast attestations |

#### Creating Attestations

```
function create_attestation(proposal, attester_address):
    // The attester signs only the consensus payload digest (header_hash, archive, oracle_input).
    // The proposer's signature on the proposal is transported alongside the attestation
    // but is NOT mixed into the attester's signed digest.
    digest = keccak256(abi.encode(
        SignatureDomainSeparator.checkpointAttestation,
        ProposePayload {
            archive:       proposal.archive,
            oracleInput:   proposal.oracle_input,
            headerHash:    sha256_to_field(proposal.checkpoint_header.to_be_bytes()),
        }
    ))
    signature = sign(attester_key, eth_signed_message_hash(digest))
    return CheckpointAttestation(payload, signature, proposal.proposer_signature)
```

The attestation binds to:
- The checkpoint header *hash* (`sha256_to_field` of its byte serialization).
- The archive root after the checkpoint.
- The fee oracle input.

The proposer's signature on the proposal is carried in the attestation object so that downstream consumers (and L1) can recover the proposer address and validate that the attestation is over an existing proposal.

Each committee member creates exactly one attestation per checkpoint. Signing multiple attestations for different proposals at the same slot constitutes equivocation.

#### Attestation Threshold

For epoch proof submission, the last checkpoint in the proven range MUST have valid signatures from at least the strict 2/3+1 quorum:

```
required_signatures = (committee_size * 2) / 3 + 1     // floor(2N/3) + 1
```

This threshold is enforced on L1 during `submitEpochRootProof()` (see Spec #10), unless the escape hatch was open for the epoch (see Escape Hatch and L1 Epoch Proof Validation V11).

#### Domain Separators and EIP-191 Wrapping

All consensus signatures use a single-byte domain separator prepended to the payload before keccak hashing, and are computed over the EIP-191 `personal_sign`-wrapped 32-byte digest (`"\x19Ethereum Signed Message:\n32" || keccak256(payload)`). This keeps L1 verification compatible with `ECDSA.recover` on `MessageHashUtils.toEthSignedMessageHash`.

The domain separator namespace is:

| Value | Name | Used by |
|---|---|---|
| 0 | `blockProposal` | Gossip-layer block proposal signature (proposer over the encoded block proposal) |
| 1 | `checkpointAttestation` | Attester's signature over the `ProposePayload` digest; the proposer also produces one of these (their own attestation), which is the signature L1 verifies during `propose()` |
| 2 | `attestationsAndSigners` | Proposer's signature over the packed `(attestations, signers)` bundle, verified during `propose()` |
| 3 | `checkpointProposal` | Gossip-layer checkpoint proposal signature (proposer over the encoded checkpoint proposal) |
| 4 | `signedTxs` | Proposer's signature over a transaction bundle that travels with a block proposal (used by validators to verify provenance of bundled txs) |

A single proposer typically produces signatures under separators 0, 1, 2, 3, and 4 within a single slot. Validators in the committee produce signatures under separator 1 only.

Independent implementations MUST reproduce both the domain separator byte and the EIP-191 wrap; missing either will cause L1 signature recovery to mismatch.

### L1 Proposer Verification

When a checkpoint is submitted to L1, the rollup contract verifies proposer authorization:

```
function verify_proposer(slot, epoch, attestations, signers, payload_digest, attestations_and_signers_signature):
    // 1. Reconstruct the committee by interleaving the explicit `signers` array
    //    with the non-signer addresses packed in `attestations`. This path does
    //    NOT run ECDSA recovery on the attestation signatures — recovery is
    //    deferred to epoch proof time. (See Packed Attestation Format below.)
    committee = reconstruct_committee_from_signers_and_addresses(attestations, signers, committee_size)

    // 2. Verify committee commitment
    require keccak256(encode(committee)) == stored_committee_commitment[epoch]

    // 3. Compute proposer index
    proposer_index = compute_proposer_index(epoch, slot, sample_seed, committee_size)
    proposer = committee[proposer_index]

    // 4. Verify proposer's attestation signature (one ECDSA recovery, on EIP-191-wrapped digest)
    require attestations.is_signature(proposer_index)
    require ecrecover(eth_signed_message_hash(payload_digest),
                      attestations.get_signature(proposer_index)) == proposer

    // 5. Verify attestations-and-signers binding signature
    attestations_digest = keccak256(abi.encode(
        SignatureDomainSeparator.attestationsAndSigners,
        keccak256(attestations.bytes),
        keccak256(abi.encode(signers))
    ))
    require ecrecover(eth_signed_message_hash(attestations_digest),
                      attestations_and_signers_signature) == proposer
```

**Key design choice:** Only the proposer's signature is fully verified on L1 during `propose()`. The `signers` calldata array is what links each non-signature attestation slot to a committee address; the contract trusts this array provisionally and validates the resulting committee against the stored commitment. Full ECDSA recovery on every attestation signature is deferred to epoch proof submission time, where `verifyAttestations` recovers each signer and confirms the 2/3+1 threshold against the on-chain commitment. This defers the gas cost of full verification, which would be prohibitive for every checkpoint. Should a sequencer post invalid or incomplete signatures along with their checkpoint, anyone can invalidate the submission via a dedicated L1 transaction, which removes the offending checkpoint from the rollup contract altogether.

### Packed Attestation Format

Committee attestations are encoded in a gas-optimized packed format for L1 submission:

| Component | Description |
|---|---|
| `signature_indices` | Bitmap where bit `i` = 1 indicates position `i` contains a 65-byte ECDSA signature |
| `signatures_or_addresses` | Packed data: 65-byte signatures for signers, 20-byte addresses for non-signers |

The full committee is reconstructed differently depending on which path consumes it:

- **Cheap `propose()` path (gas-sensitive).** For positions where `signature_indices[i] = 1`, the contract reads the corresponding address from the explicit `signers` calldata array supplied alongside the attestations (one entry per signer slot, in order). For positions where `signature_indices[i] = 0`, the 20-byte address is read directly from `signatures_or_addresses`. The reconstructed committee is hashed and compared to the stored commitment, with no ECDSA recovery on any attestation signature except the proposer's. This relies on the `attestations_and_signers_signature` (separator 2) to bind the proposer to the supplied `signers` array.
- **Full verification path (`verifyAttestations`, epoch proof time).** For positions where `signature_indices[i] = 1`, the contract recovers the signer address from the ECDSA signature over the payload digest and substitutes it back into the committee at that slot. For positions where `signature_indices[i] = 0`, the address is taken from `signatures_or_addresses` as in the cheap path. The committee is then hashed and compared to the stored commitment, and the number of signatures is checked against the 2/3+1 threshold.

Both paths converge on the same committee array and the same on-chain commitment; only the cost (and therefore the trust model on the `signers` array vs. signature recovery) differs.

### Epoch Proof and Finalization

After an epoch's checkpoints are proposed, a prover generates a validity proof covering a contiguous range of checkpoints within the epoch. The proof is submitted to L1 via `submitEpochRootProof()` (see Spec #10 for full details).

During proof submission, attestations for the last checkpoint in the range are fully verified:

```
function verify_last_checkpoint_attestations(end_checkpoint, attestations, out_hash):
    // 1. Verify attestations hash matches stored value
    require keccak256(encode(attestations)) == stored_attestations_hash[end_checkpoint]

    // 2. Reconstruct committee and verify sufficient signatures
    verify_attestations(slot, epoch, attestations, payload_digest)
    // Requires > 2/3 valid signatures
```

Upon successful proof verification, the proven tip advances. L2-to-L1 messages are published to the Outbox. Fees and rewards are distributed (see Spec #15).

### Finality Stages

Blocks progress through four finality stages (see also Spec #6):

```mermaid
stateDiagram-v2
    [*] --> Proposed: Sequencer broadcasts block
    Proposed --> Checkpointed: Checkpoint submitted to L1
    Checkpointed --> Proven: Epoch proof verified on L1
    Proven --> Finalized: L1 block finalized
    Checkpointed --> Pruned: Proof deadline expired
```

| Stage | Trigger | Guarantee |
|---|---|---|
| Proposed | Block broadcast on P2P network | No L1 guarantee; may be reorganized |
| Checkpointed | Checkpoint submitted to L1 via `propose()` | Committed to L1. Subject to pruning if no proof within window |
| Proven | Epoch proof verified on L1 via `submitEpochRootProof()` | Cryptographic proof verified on L1. Subject to L1 reorg |
| Finalized | L1 block containing proof is finalized | Full finality. Inherits Ethereum's finality guarantees |

**Pruned state:** If no proof is submitted within `proof_submission_epochs + 1` epochs after the epoch containing the unproven checkpoints, the chain is pruned back to the last proven checkpoint. Pruning is performed as the **first action** of each `propose()` call and prunes inline before processing the new checkpoint.

### Checkpoint Invalidation

Checkpoints with invalid or insufficient attestations can be permissionlessly removed from the pending chain. This is critical for liveness — a checkpoint with bad attestations would otherwise block the next checkpoints from being posted to the rollup contract.

Two invalidation functions are available (see Spec #10 for the detailed algorithm):

| Function | Condition | Effect |
|---|---|---|
| `invalidate_bad_attestation` | Any single attestation signature is invalid (recovered address does not match committee member) | Pending tip reset to `checkpoint_number - 1` |
| `invalidate_insufficient_attestations` | Total valid signatures do not exceed 2/3 of committee | Pending tip reset to `checkpoint_number - 1` |

Both functions are callable by any address and remove the invalid checkpoint and all subsequent pending checkpoints. Both functions reject invalidation calls for checkpoints proposed during an open escape hatch (escape-hatch checkpoints have no committee attestations to invalidate).

Also note that all nodes MUST manually verify attester signatures whenever they sync new checkpoints from the L1 rollup contract. Any checkpoints with invalid signatures MUST be ignored and not added to their view of the chain.

### Slashing

Slashing is the mechanism by which misbehaving validators lose stake. The protocol uses a tally-based voting system where proposers cast votes on observed offenses.

#### Slashable Offenses

| Offense | Description | Detection |
|---|---|---|
| `BROADCASTED_INVALID_BLOCK_PROPOSAL` | Proposer broadcasts a block that fails re-execution (state mismatch or failed transactions) | Re-executing validators detect and report |
| `DUPLICATE_PROPOSAL` | Proposer signs multiple block or checkpoint proposals for the same slot with different content | P2P layer detects a second proposal at the same `(slot, index_within_checkpoint)` with a different archive root |
| `DUPLICATE_ATTESTATION` | Validator signs attestations for different checkpoint proposals at the same slot | P2P layer detects conflicting attestations from the same signer at the same slot |
| `PROPOSED_INSUFFICIENT_ATTESTATIONS` | Proposer submitted a checkpoint to L1 whose attestation bitmap claims fewer signatures than the 2/3+1 threshold | `attestations_block_watcher` |
| `PROPOSED_INCORRECT_ATTESTATIONS` | Proposer submitted a checkpoint whose claimed signatures do not all recover to committee members | `attestations_block_watcher` |
| `ATTESTED_DESCENDANT_OF_INVALID` | A validator attested to a checkpoint that descends from a known-invalid one | `attestations_block_watcher` |
| `VALID_EPOCH_PRUNED` | An epoch was pruned despite being valid (e.g. proof not submitted in time) | `epoch_prune_watcher` |
| `DATA_WITHHOLDING` | Required block / blob data was not made available within the required window | `epoch_prune_watcher` (in conjunction with the archive-sync state) |
| `INACTIVITY` | Validator failed to produce expected attestations / proposals over the inactivity window | `sentinel` (cumulative liveness scoring) |

Note that *escape-hatch failure* (failing to propose, or proposing a checkpoint that never gets proven, while serving as the designated escape-hatch proposer) is **not** routed through the slasher — it is punished directly by deducting `FAILED_HATCH_PUNISHMENT` from the candidate's bond inside the escape-hatch contract. See Escape Hatch Accountability below.

#### Slashing Vote Mechanism

Slashing uses a tally-based voting system on L1:

```
function vote(votes_data, signature):
    // Read the current slot and look up its proposer
    slot = current_slot()
    expected_proposer = get_proposer_at(slot)

    // EIP-712 typed-data signature
    struct_hash = keccak256(abi.encode(
        VOTE_TYPEHASH,             // keccak256("Vote(bytes votes,uint256 slot)")
        keccak256(votes_data),
        slot
    ))
    digest = eip712_digest(domain_separator, struct_hash)
    require ecrecover(digest, signature) == expected_proposer

    // One vote per slot per round
    require round_data[current_round].lastVoteSlot < slot
    round_data[current_round].lastVoteSlot = slot

    store_vote(current_round, votes_data)
```

The `(slot, lastVoteSlot)` guard prevents a proposer from spamming votes within the same round and pins each vote to a specific slot. `caller` is unconstrained — relayers may submit on a proposer's behalf.

**Vote encoding:** Each vote is a 2-bit value per validator per epoch within the round:

| Value | Meaning |
|---|---|
| `00` | No slash |
| `01` | Slash small amount |
| `10` | Slash medium amount |
| `11` | Slash large amount |

**Vote semantics are monotone in slash level.** A vote of "slash N units" is *also* counted as a vote for "slash N-1 units", "slash N-2 units", …, "slash 1 unit". I.e. tallies at lower levels are inclusive of votes at higher levels:

```
tally[small]  = count(votes >= small)   // small + medium + large
tally[medium] = count(votes >= medium)  // medium + large
tally[large]  = count(votes == large)
```

This means quorum is reached at the **highest** slash level whose inclusive tally meets the quorum threshold, ensuring the most severe penalty supported by a sufficient number of proposers is applied without forcing voters to coordinate on an exact level.

**Round targeting.** Voting in round `R` does not slash members of round `R`'s committees directly. The slasher applies a configurable `SLASH_OFFSET_IN_ROUNDS` parameter: votes cast in round `R` target the validators of the committees in round `R - SLASH_OFFSET_IN_ROUNDS`. This offset ensures that proposers have time to observe offenses (e.g. completed-but-pruned epochs) before voting on them.

**Round execution:** After a configurable execution delay, rounds can be executed:

```
function execute_round(round):
    require current_round >= round + execution_delay_in_rounds
    require current_round <= round + lifetime_in_rounds

    for each validator:
        tallies = count_votes_per_level(round, validator)
        // Find highest slash level that reaches quorum
        for level in [large, medium, small]:
            if tallies[level] >= quorum:
                slash(validator, slash_amounts[level])
                break
```

**Quorum.** The quorum constraint is `quorum > round_size / 2` (and `quorum <= round_size`). `round_size / 2 + 1` is one valid choice but the spec does not pin the value to that formula — any quorum strictly greater than half the round size satisfies the constraint.

#### Slash Execution

```
function slash(attester, amount):
    if attester has pending exit:
        reduce exit amount
    else:
        withdraw from GSE, reduce by slash amount
        if remaining balance < ejection_threshold:
            force exit with remaining balance minus slash
```

#### Slashing Parameters

| Parameter | Description |
|---|---|
| `slash_amount_small` | Penalty for minor offenses |
| `slash_amount_medium` | Penalty for moderate offenses |
| `slash_amount_large` | Penalty for severe offenses |
| `quorum` | Votes needed to execute a slash. Constrained to `quorum > round_size / 2` and `quorum <= round_size`. |
| `round_size_in_epochs` | Number of epochs per slashing round |
| `slash_offset_in_rounds` | Offset between the round in which votes are cast and the round whose committees those votes target (votes in round `R` slash committees from round `R - slash_offset_in_rounds`) |
| `execution_delay_in_rounds` | Rounds to wait before execution (allows for veto) |
| `lifetime_in_rounds` | Rounds after which a slash expires if not executed |

A **vetoer** address (governance-controlled) may veto slash payloads before execution, providing a safety net against false slashing.

### Equivocation Detection and Propagation

Equivocation detection occurs at the P2P layer and is propagated to the validator client for slashing action.

#### Block Proposal Equivocation

The attestation pool tracks block proposals indexed by `(slot, index_within_checkpoint)`. When a second proposal arrives for the same position with a different archive root:

1. The duplicate is accepted and stored (up to `MAX_BLOCK_PROPOSALS_PER_POSITION = 3` per position).
2. The `duplicate_proposal_callback` is invoked, triggering slashing vote emission.
3. The duplicate proposal is re-propagated on the gossip network to distribute evidence.

#### Attestation Equivocation

The attestation pool tracks attestations indexed by `(slot, proposal_id, signer)`. When attestations from the same signer for different proposals at the same slot are detected:

1. The duplicate is accepted and stored (up to `MAX_ATTESTATIONS_PER_SLOT_AND_SIGNER = 3`).
2. The `duplicate_attestation_callback` is invoked, triggering slashing vote emission.

#### Local Equivocation Prevention

Honest validators SHOULD maintain local state to prevent accidentally equivocating:

| State | Purpose |
|---|---|
| `last_proposed_block` | Prevents creating two block proposals for the same `(slot, index_within_checkpoint)` |
| `last_proposed_checkpoint` | Prevents creating two checkpoint proposals for the same slot |
| `last_attested_proposal` | Prevents attesting to multiple different proposals at the same slot |

### Escape Hatch

The escape hatch is a censorship-resistance mechanism that periodically opens an alternative block production path not requiring committee attestations.

#### Escape Hatch Timing

Escape hatches occur at a configurable frequency measured in epochs:

```
hatch_number(epoch)   = epoch / frequency
is_hatch_epoch(epoch) = (epoch % frequency) < active_duration

is_hatch_open(epoch)  = is_hatch_epoch(epoch) AND designated_proposer[hatch_number(epoch)] != 0
```

The hatch is "open" only when (a) the epoch is in the active window and (b) a designated proposer was actually selected for that hatch. Selection is itself permissionless — anyone may call `selectCandidates()` to pick the designated proposer for an upcoming hatch — but if the candidate set was empty at the freeze time no proposer is selected and the hatch is effectively *closed for lack of preparation*. Production operators are responsible for ensuring `selectCandidates()` is called in time.

| Parameter | Description |
|---|---|
| `frequency` | Epochs between escape hatch windows |
| `active_duration` | Number of consecutive epochs the hatch remains open |
| `lag_in_hatches` | How far ahead the designated proposer is selected |

**Constraint:** `active_duration >= proof_submission_epochs + 1`, ensuring there is enough time for the escape hatch proposer's checkpoint to be proven.

#### Candidate Set

Escape hatch proposers are drawn from a separate candidate set (distinct from the validator committee):

```
function join_candidate_set():
    require caller not already a candidate
    transfer BOND_SIZE from caller to contract
    add caller to candidate set
```

Candidates post a bond (`BOND_SIZE`) that can be partially slashed if they fail to fulfill their duty.

#### Candidate Selection

Candidates are selected in advance using a lag mechanism:

```
function select_candidate(current_hatch):
    target_hatch = current_hatch + lag_in_hatches

    // Snapshot candidate set at freeze time
    freeze_ts = epoch_to_timestamp(first_epoch_of_hatch(target_hatch) - LAG_IN_EPOCHS_FOR_SET_SIZE)
    set_size = candidate_set.length_at(freeze_ts)

    // Sample using RANDAO from seed time
    seed_ts = epoch_to_timestamp(first_epoch_of_hatch(target_hatch) - LAG_IN_EPOCHS_FOR_RANDAO)
    seed = rollup.get_sample_seed_at(seed_ts)
    index = keccak256(encode(target_hatch, seed)) % set_size

    designated_proposer[target_hatch] = candidate_set.get_at(index, freeze_ts)
```

**Constraint:** `LAG_IN_EPOCHS_FOR_SET_SIZE > LAG_IN_EPOCHS_FOR_RANDAO`, ensuring the candidate set is frozen before the selection randomness is known. Note that on the escape-hatch path these are **constants** baked into the contract (`LAG_IN_EPOCHS_FOR_SET_SIZE = 2`, `LAG_IN_EPOCHS_FOR_RANDAO = 1`), not configurable parameters.

#### Proposal During Escape Hatch

During an escape hatch epoch:

- The designated candidate MAY propose checkpoints by calling `propose()` directly (via `msg.sender`).
- Committee attestations are NOT required.
- Epoch setup is skipped (no committee sampling).
- Attestation verification is skipped during proof submission.
- Checkpoints proposed during an open hatch cannot be removed due to invalid attestations.

```
// In propose():
if is_escape_hatch:
    require msg.sender == designated_proposer[current_hatch]
else:
    verify_proposer(slot, epoch, attestations, ...)
```

#### Escape Hatch Accountability

After the escape hatch window closes, the candidate's performance is validated:

```
function validate_escape_hatch(hatch):
    require not isHatchValidated[hatch]              // idempotency guard
    require block.timestamp >= candidate.exitableAt  // window must have closed
    require candidate.status == PROPOSING            // must have been the designated proposer

    proposer = designated_proposer[hatch]
    success = true

    // Check: at least one checkpoint was proposed
    if proposer.last_checkpoint_number == 0: success = false

    // Check: checkpoint was proven
    if rollup.proven_tip < proposer.last_checkpoint_number: success = false

    // Check: the checkpoint that was proposed still occupies the same archive index
    //        on the canonical chain (i.e. it was not later pruned/replaced)
    if rollup.archive_at(proposer.last_checkpoint_number) != proposer.last_submitted_archive: success = false

    if not success:
        proposer.bond -= FAILED_HATCH_PUNISHMENT

    // Reset escape-hatch bookkeeping and mark validation as done
    proposer.last_checkpoint_number = 0
    proposer.last_submitted_archive = 0
    isHatchValidated[hatch] = true
    proposer.status = EXITING
    emit ProofValidated(...)
```

Failed candidates lose a portion of their bond. After validation, the candidate enters an exit period before they can withdraw their remaining bond.

### Clock Tolerance

Due to network latency and minor clock skew between nodes, message validation on the p2p network MAY apply a bounded tolerance:

```
MAXIMUM_GOSSIP_CLOCK_DISPARITY = 500ms
```

Block proposals and attestations referencing the previous slot are accepted if the current slot started less than 500ms ago. This prevents rejecting messages from honest nodes with slightly slow clocks.

## Data Structures

### Committee Attestations (L1 Format)

```mermaid
classDiagram
    class CommitteeAttestations {
        signature_indices: bytes
        signatures_or_addresses: bytes
    }

    class AttestationEntry {
        <<union>>
        signature: bytes65
        address: bytes20
    }

    CommitteeAttestations *-- AttestationEntry : packed array
```

| Field | Type | Description |
|---|---|---|
| `signature_indices` | `bytes` | Bitmap: bit `i` = 1 means position `i` is a 65-byte ECDSA signature |
| `signatures_or_addresses` | `bytes` | Packed data: 65-byte signatures for signers, 20-byte addresses for non-signers |

### Consensus Payload

The data attested to by committee members:

| Field | Type | Description |
|---|---|---|
| `checkpoint_header` | `CheckpointHeader` | Full checkpoint header (see Spec #6) |
| `archive` | `Field` | Archive root after the checkpoint |

### Payload Digest

The digest signed by committee members (and by the proposer's own attestation, which is the signature L1 verifies during `propose()`):

```
payload_digest = keccak256(abi.encode(
    SignatureDomainSeparator.checkpointAttestation,    // uint8 = 1
    ProposePayload {
        archive:     archive,
        oracleInput: oracle_input,           // (int256) tuple
        headerHash:  header_hash,            // sha256_to_field(checkpoint_header.to_be_bytes())
    }
))
```

The ABI shape is `(uint8, (bytes32, (int256), bytes32))`, not a flat keccak over four concatenated fields. Independent implementations MUST reproduce this exact `abi.encode` layout; a flat-list construction will not match. The ECDSA signature is computed over the EIP-191 wrap of `payload_digest` (see Domain Separators and EIP-191 Wrapping).

### Validator State

| Field | Type | Description |
|---|---|---|
| `attester` | `EthAddress` | Signing address |
| `withdrawer` | `EthAddress` | Withdrawal address |
| `public_key_g1` | `G1Point` | BLS public key in G1 (registered at deposit; reserved for future BLS aggregate signatures) |
| `public_key_g2` | `G2Point` | BLS public key in G2 (registered at deposit alongside the G1 key) |
| `status` | `enum` | `NONE`, `VALIDATING`, `ZOMBIE`, `EXITING` |
| `effective_balance` | `uint256` | Current stake amount |

### Exit Record

| Field | Type | Description |
|---|---|---|
| `withdrawal_id` | `uint256` | Identifier for the withdrawal |
| `amount` | `uint256` | Stake amount to return (may be reduced by slashing) |
| `exitable_at` | `Timestamp` | Earliest time the withdrawal can be completed |
| `recipient_or_withdrawer` | `address` | Who receives the funds |
| `is_recipient` | `bool` | Whether `recipient_or_withdrawer` is a direct recipient or the withdrawer |

### Slashing Vote

| Field | Type | Description |
|---|---|---|
| `votes_data` | `bytes` | Packed 2-bit values: one per validator per epoch in the round. Total size is `committee_size * round_size_in_epochs / 4` bytes. |
| `slot` | `Slot` | Slot of the proposer casting the vote. Recovered from `current_slot()` at submission time and bound into the EIP-712 struct hash. |
| `signature` | `Signature` | EIP-712 typed-data signature by the proposer over `Vote(bytes votes,uint256 slot)` (`VOTE_TYPEHASH`). |

### Escape Hatch Candidate

| Field | Type | Description |
|---|---|---|
| `address` | `EthAddress` | Candidate's address |
| `status` | `enum` | `NONE` (not a candidate), `ACTIVE` (in the candidate set), `PROPOSING` (selected as designated proposer for an upcoming hatch), `EXITING` (validated and now eligible to withdraw) |
| `amount` | `uint256` | Bond amount (may be reduced by `FAILED_HATCH_PUNISHMENT` on failed validation, and is further reduced by `WITHDRAWAL_TAX` on `leaveCandidateSet`) |
| `exitable_at` | `Timestamp` | Earliest withdrawal time after duty completion. `validate_escape_hatch` requires `block.timestamp >= exitable_at` before it can run. |
| `last_checkpoint_number` | `CheckpointNumber` | Set by `propose()` (via `escapeHatch.updateSubmittedArchive`) while serving as the designated proposer; cleared by `validate_escape_hatch` |
| `last_submitted_archive` | `Field` | Archive root of the most recent checkpoint the candidate submitted; matched against `rollup.archive_at(...)` in `validate_escape_hatch` |

## Validation Rules

### Block Proposal Validation (P2P)

Nodes MUST validate received block proposals (see also Spec #17):

| # | Rule | Action on Failure |
|---|---|---|
| 1 | Proposal slot is current slot, next slot, or previous slot within clock tolerance | Reject |
| 2 | Proposer signature is valid | Reject |
| 3 | If transactions are not permitted, proposal MUST contain no tx hashes | Reject |
| 4 | Every embedded transaction hash appears in `tx_hashes` | Reject |
| 5 | Proposer matches expected proposer for the slot (from epoch cache) | Reject |
| 6 | Each embedded transaction's computed hash matches its declared hash | Reject |

### Block Proposal Re-Execution Validation

When re-execution is enabled, validators perform deeper validation:

| # | Rule | Outcome |
|---|---|---|
| 1 | Parent block exists (by archive root) | Invalid: `parent_block_not_found` |
| 2 | Parent block slot ≤ proposal slot | Invalid: `parent_block_wrong_slot` |
| 3 | Block number does not already exist | Invalid: `block_number_already_exists` |
| 4 | Computed `in_hash` matches proposal `in_hash` | Invalid: `in_hash_mismatch` |
| 5 | Global variables match within checkpoint (for blocks with `index > 0`) | Invalid: `global_variables_mismatch` |
| 6 | All transactions are available | Invalid: `txs_not_available` |
| 7 | Re-execution produces no failed transactions | Invalid: `failed_txs` (slashable) |
| 8 | Re-execution archive root matches proposal archive root | Invalid: `state_mismatch` (slashable) |
| 9 | Re-execution block header matches proposal block header | Invalid: `state_mismatch` (slashable) |

Results `state_mismatch` and `failed_txs` trigger slashing if the `slash_broadcasted_invalid_block_penalty` is configured.

### Checkpoint Attestation Validation (P2P)

Nodes MUST validate received attestations (see also Spec #17):

| # | Rule | Action on Failure |
|---|---|---|
| 1 | Attestation slot is current or next slot (with clock tolerance) | Reject |
| 2 | Attester signature is valid | Reject |
| 3 | Attester is in the committee for the slot | Reject |
| 4 | Proposer signature embedded in attestation is valid | Reject |
| 5 | Proposer matches expected proposer for the slot | Reject |

### L1 Checkpoint Validation

The L1 rollup contract validates during `propose()` (see Spec #10):

| # | Rule |
|---|---|
| 1 | `coinbase` is non-zero |
| 2 | `total_mana_used` does not exceed `mana_limit` (= `mana_target * 2`) |
| 3 | `last_archive_root` matches stored archive root at the current pending tip |
| 4 | `slot_number` is strictly greater than the slot of the *effective pending* checkpoint (the on-chain pending tip after accounting for any pruning that would apply at the current L1 timestamp) |
| 5 | `slot_number` equals the slot derived from `block.timestamp` |
| 6 | `timestamp` equals `genesis_time + slot_number * slot_duration` |
| 7 | `blobs_hash` matches the commitment computed from EIP-4844 blob hashes |
| 8 | `fee_per_da_gas` is `0` |
| 9 | `fee_per_l2_gas` equals the mana minimum fee, the lower bound derived from the per-checkpoint mana fee components. Exact equality is enforced inside the rollup proof; L1 enforces only this lower bound at propose time. |
| 10 | Proposer's signature recovers to the designated committee member for the slot (the `propose()` path is signature-authorized, not caller-authorized, except on the escape-hatch path which requires `msg.sender == designated_proposer`) |
| 11 | Proposer's attestation signature is valid (one ECDSA recovery, on the EIP-191-wrapped payload digest) |
| 12 | Proposer's `attestations_and_signers_signature` is valid (binds the proposer to the explicit `signers` calldata array; uses a separate domain separator) |
| 13 | `in_hash` matches the consumed inbox tree root (when transactions are enabled) |

### L1 Epoch Proof Validation

During `submitEpochRootProof()` (see Spec #10):

| # | Rule |
|---|---|
| 1 | Start and end checkpoints are in the same epoch |
| 2 | Current epoch is within the proof submission deadline |
| 3 | Start checkpoint is the first checkpoint of its epoch (parent in prior epoch) |
| 4 | Start checkpoint builds on the proven tip (`start - 1 <= proven`) |
| 5 | Checkpoint count does not exceed `MAX_CHECKPOINTS_PER_EPOCH` (32) |
| 6 | Attestations hash for the last checkpoint matches stored value |
| 7 | Valid attestation signatures meet the strict 2/3+1 threshold (`(committee_size << 1) / 3 + 1`). Skipped when the escape hatch was open for the epoch. |
| 8 | Reconstructed committee commitment matches stored commitment. Skipped when the escape hatch was open for the epoch. |
| 9 | Batched blob proof is valid (EIP-4844 point evaluation precompile) |
| 10 | Root rollup validity proof verifies against assembled public inputs |

## Security Considerations

### Byzantine Fault Tolerance

The attestation threshold of `> 2/3` of the committee provides standard BFT safety: the chain is safe as long as fewer than `1/3` of committee members are adversarial. With a committee size of 48, up to 15 adversarial members can be tolerated.

### RANDAO Manipulation

An adversary who controls the L1 block proposer at the RANDAO checkpoint epoch can bias the committee selection. The `lag_in_epochs_for_randao` parameter mitigates this by sampling RANDAO from multiple epochs in the past, increasing the cost of manipulation (the adversary must predict or control L1 proposers far in advance).

### Proposer Censorship

A malicious proposer can censor specific transactions by excluding them from blocks. Mitigations:
1. **Slot rotation**: Proposers change every slot, limiting censorship duration.
2. **Escape hatch**: Even if the entire committee colludes, the escape hatch provides an alternative production path at regular intervals.

### Long-Range Attacks

The lag between committee formation and epoch start means an adversary who acquires validator keys after the committee was selected cannot retroactively attack past epochs. The `lag_in_epochs_for_validator_set` ensures the validator set snapshot is taken well before the committee is active.

### Deferred Attestation Verification

During `propose()`, only the proposer's signature is verified on L1. Full committee attestation verification is deferred to `submitEpochRootProof()`. Between proposal and proof:
- An invalid checkpoint can be removed via `invalidateBadAttestation` or `invalidateInsufficientAttestations`.
- If no invalidation occurs and no proof is submitted within the deadline, the chain is pruned.

This design trades immediate safety for gas efficiency, relying on the permissionless invalidation functions as a safety net.

## Open Questions

1. **Committee size vs. decentralization**: The `target_committee_size` is configurable (48 on testnet, 24 on mainnet initial deployment). What is the target long-term committee size, and what analysis determines the optimal trade-off between attestation overhead and Byzantine fault tolerance?

2. **Slashing calibration**: The current slashing amounts (small, medium, large) and quorum thresholds are subject to change. What economic analysis should determine the appropriate penalty levels relative to the activation threshold?

3. **Escape hatch frequency**: The escape hatch frequency (e.g., every 35 epochs) determines the maximum censorship window. What is the acceptable censorship duration, and how does escape hatch frequency interact with the proof submission deadline?

4. **BLS signature aggregation**: Validators currently register BLS keys but attestations use ECDSA. When will BLS aggregate signatures be activated, and how will this change the attestation format and L1 gas costs?

5. **Validator set size bounds**: The entry queue flush model controls growth, but there is no explicit maximum validator set size. Should the protocol enforce a ceiling, and if so, what happens when it is reached?

## References

- Spec #1: Protocol Overview & Architecture
- Spec #2: Constants
- Spec #6: Block Format & Header
- Spec #9: Rollup Circuits
- Spec #10: L1 Rollup Contract & State Transition
- Spec #15: Gas & Fees
- Spec #17: P2P Network Protocol
