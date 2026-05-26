# Slasher

## Overview

The slasher module implements validator slashing for the Aztec network. Slashing punishes validators who misbehave or are inactive by reducing their stake. This mechanism ensures network security and liveness.

## Usage

The slasher is integrated into the Aztec node and activates when:
1. The node is configured as a validator
2. The validator is selected as proposer for a slot
3. Slashable offenses have been detected

No manual intervention is required for normal operation. The slasher client handles:
- Monitoring for offenses
- Generating appropriate slash actions
- Coordinating with the SequencerPublisher for L1 execution

## Slashing Model

The slashing model uses consensus-based voting where proposers vote on individual validator offenses. Time is divided into rounds, and during each round, proposers submit votes indicating which validators from a given past round should be slashed (eg round N votes to slash the validators from round N-2). Votes are encoded as bytes where each validator's vote is represented by 2 bits indicating the slash amount (0-3 slash units) for each validator. The L1 contract tallies votes and slashes validators that reach quorum.

Key characteristics:
- Proposers vote directly on validator offenses
- Requires a slash offset to vote on validators from past rounds
- Requires quorum to execute slashing
- L1 contract determines which offenses reach consensus
- Execution happens after a delay period for review
- Slash payloads can be vetoed during the execution delay period

## Architecture

### Core Components

#### SlasherClientInterface
Interface implemented by the slasher client. Provides methods for:
- `getProposerActions()`: Returns actions for the current proposer
- `gatherOffensesForRound()`: Collects offenses for a specific round

#### SlashOffensesCollector
Collects slashable offenses from watchers and stores them in the offenses store. Features:
- Subscribes to `WANT_TO_SLASH_EVENT` from watchers
- Manages offense lifecycle and automatic expiration

#### SlasherOffensesStore
Persistent storage for offenses. Tracks:
- Pending offenses awaiting slashing
- Executed offenses to prevent double slashing
- Round-based offense organization
- Automatic expiration of old offenses based on configurable rounds

#### SlashRoundMonitor
Monitors slashing rounds and triggers actions on round transitions:
- Tracks current round based on L2 slots
- Emits events when rounds change

#### ProposerSlashAction
Actions returned by the slasher client to the SequencerPublisher:
- `vote-offenses`: Vote on validator offenses
- `execute-slash`: Execute slashing for a round that reached quorum

### Integration Flow

1. **Offense Detection**: Watchers monitor the network and emit `WANT_TO_SLASH_EVENT` when they detect violations
2. **Offense Collection**: SlashOffensesCollector receives events and stores offenses in SlasherOffensesStore
3. **Action Generation**: When a validator is proposer, the slasher client generates ProposerSlashActions
4. **Action Execution**: SequencerPublisher receives actions and executes them on L1
5. **Round Monitoring**: SlashRoundMonitor tracks rounds and triggers execution when conditions are met

## Vetoing

The slashing system includes a veto mechanism that allows designated vetoers to block slash payloads during the execution delay period. When a slash payload is ready for execution, the system first checks if it has been vetoed before proceeding.

Key features:
- Slash payloads can be vetoed by authorized addresses on the L1 slasher contract
- Veto checks are performed automatically before execution attempts
- The veto mechanism provides a safety valve for incorrectly proposed slashes

## Slashable Offenses

List of all slashable offenses in the system:

### DATA_WITHHOLDING
**Description**: The transaction data for a published checkpoint was not made available within the tolerance window.
**Detection**: DataWithholdingWatcher checks each published checkpoint's txs against the local mempool once `slashDataWithholdingToleranceSlots` full slots have elapsed past the checkpoint's slot (i.e. at `slotStart(checkpoint.slot + slashDataWithholdingToleranceSlots + 1)`).
**Target**: Validators who attested to the checkpoint.
**Time Unit**: Slot-based offense (the checkpoint's slot).

### INACTIVITY
**Description**: A proposer failed to attest or propose blocks during their assigned slots.
**Detection**: Sentinel tracks validator performance and identifies validators who miss attestations beyond threshold.
**Target**: Individual inactive validator.
**Time Unit**: Epoch-based offense.

### BROADCASTED_INVALID_BLOCK_PROPOSAL
**Description**: A proposer broadcast an invalid block proposal over the p2p network.
**Detection**: Validators detect invalid proposals during attestation validation.
**Target**: Proposer who broadcast the invalid block.
**Time Unit**: Slot-based offense.

### PROPOSED_INSUFFICIENT_ATTESTATIONS
**Description**: A proposer submitted a block to L1 without sufficient committee attestations.
**Detection**: AttestationsBlockWatcher checks L1 blocks for attestation count.
**Target**: Block proposer.
**Time Unit**: Slot-based offense.

### PROPOSED_INCORRECT_ATTESTATIONS
**Description**: A proposer submitted a block to L1 with signatures from non-committee members.
**Detection**: AttestationsBlockWatcher validates attestation signatures against committee membership.
**Target**: Block proposer.
**Time Unit**: Slot-based offense.

### PROPOSED_DESCENDANT_OF_CHECKPOINT_WITH_INVALID_ATTESTATIONS
**Description**: A proposer published a checkpoint to L1 that builds on an invalid checkpoint (one with invalid or insufficient attestations).
**Detection**: AttestationsBlockWatcher tracks invalid checkpoints and their descendants.
**Target**: Proposer of the descendant checkpoint.
**Time Unit**: Slot-based offense.

### DUPLICATE_PROPOSAL
**Description**: A proposer sent multiple block or checkpoint proposals for the same position (slot and indexWithinCheckpoint for blocks, or slot for checkpoints) with different content. Since each slot has exactly one designated proposer, sending conflicting proposals is equivocation. This also covers the case where a proposer broadcasts one checkpoint proposal via P2P but submits a different checkpoint to L1 for the same slot.
**Detection**: Detected in two places. (1) The P2P layer flags duplicates when a second proposal arrives for the same position with a different archive; the AttestationPool tracks proposals by position and the first duplicate is propagated (Accept) so other validators can witness the offense. (2) CheckpointEquivocationWatcher compares the archive root of each L1-confirmed checkpoint against retained signed P2P checkpoint proposals from the same slot's proposer and flags any mismatch.
**Target**: Proposer who broadcast the duplicate proposal.
**Time Unit**: Slot-based offense.

### ATTESTED_TO_INVALID_CHECKPOINT_PROPOSAL
**Description**: A committee member attested to a checkpoint proposal in a slot where this node detected a slashable invalid block proposal.
**Detection**: ValidatorClient marks slots with invalid block proposals detected via reexecution and slashes checkpoint attesters seen for that slot. If proposal equivocation is later detected for the slot, pending bad-attestation offenses are cleared.
**Target**: Committee members who attested in the invalid proposal slot.
**Time Unit**: Slot-based offense.

### BROADCASTED_INVALID_CHECKPOINT_PROPOSAL
**Description**: A proposer broadcast an invalid checkpoint proposal, either one that terminates before a higher-index block proposal signed by the same proposer in the same slot, one whose signed header does not match deterministic validator recomputation, or one with a malformed fee asset price modifier.
**Detection**: BroadcastedInvalidCheckpointProposalWatcher scans retained P2P proposal evidence and compares checkpoint archive roots to signed block proposals from the same slot and signer. ValidatorClient also validates checkpoint proposals during the all-nodes callback and emits this offense when checkpoint header recomputation fails or the signed fee asset price modifier is malformed.
**Target**: Proposer who broadcast the invalid checkpoint proposal.
**Time Unit**: Slot-based offense.

## Configuration

### L1 System Settings (L1ContractsConfig)
These settings are deployed with the L1 contracts and apply system-wide to the protocol:

- `slashingQuorumSize`: Votes required to slash (defaults to half the validators in a round, plus one)
- `slashingRoundSizeInEpochs`: Number of epochs per slashing round
- `slashingOffsetInRounds`: How many rounds to look back for offenses
- `slashingExecutionDelayInRounds`: Rounds to wait before execution
- `slashingLifetimeInRounds`: Maximum age of executable rounds
- `slashingAmounts`: Valid values for each individual slash

Considerations:

- The `slashingQuorumSize` should be more than half and less than the total number of validators in a round, so that we require a majority to slash. The number of validators in a round is the committee size times the number of epochs in a round.
- The bigger a `slashingRoundSizeInEpochs`, the bigger the upper bound on the quorum size. This increases security, as we need more validators to agree before slashing. However, it also makes slashing slower, and more expensive to execute in terms of gas.
- The `slashingOffsetInRounds` is required because the validators in a given slashing round must vote for _past_ offenses. Otherwise, if someone commits an offense near the end of a round, they can get away with their offense without the validators being able to collect enough votes to slash them. The offset needs to be big enough so that all offenses are discoverable, so this value should be strictly greater than the data-withholding tolerance window so that there is time to detect missing data and vote.
- The `slashingExecutionDelayInRounds` allows vetoers to stop an invalid slash. This should be large enough to give vetoers time to act, but strictly smaller than the validator exit window, so an offender cannot escape before they are slashed. It should also be small enough so that an offender that would be kicked out does not get picked up to be a committee member again before their slash is executed. In other words, if a validator commits a serious enough offense that we want them out of the validator set as soon as possible, the execution delay should not allow them to be chosen to participate in another committee.

### Local Node Configuration (SlasherConfig)

These settings are configured locally on each validator node:

Block and checkpoint validation settings are expected to be the same across all validators. Slashing relies on
validators making the same deterministic validity decisions for block and checkpoint proposals; operators should not run
with divergent validation limits.

- `slashGracePeriodL2Slots`: Number of initial L2 slots where slashing is disabled
- `slashOffenseExpirationRounds`: Number of rounds after which pending offenses expire
- `slashValidatorsAlways`: Array of validator addresses that should always be slashed
- `slashValidatorsNever`: Array of validator addresses that should never be slashed (own validator addresses are automatically added to this list)
- `slashInactivityTargetPercentage`: Percentage of misses during an epoch to be slashed for INACTIVITY
- `slashInactivityConsecutiveEpochThreshold`: How many consecutive inactive epochs are needed to trigger an INACTIVITY slash on a validator
- `slashDataWithholdingPenalty`: Penalty for DATA_WITHHOLDING
- `slashDataWithholdingToleranceSlots`: Number of full L2 slots to wait after a checkpoint's slot before declaring its txs missing
- `slashInactivityPenalty`: Penalty for INACTIVITY
- `slashBroadcastedInvalidBlockPenalty`: Penalty for BROADCASTED_INVALID_BLOCK_PROPOSAL
- `slashBroadcastedInvalidCheckpointProposalPenalty`: Penalty for BROADCASTED_INVALID_CHECKPOINT_PROPOSAL
- `slashDuplicateProposalPenalty`: Penalty for DUPLICATE_PROPOSAL
- `slashProposeInvalidAttestationsPenalty`: Penalty for PROPOSED_INSUFFICIENT_ATTESTATIONS and PROPOSED_INCORRECT_ATTESTATIONS
- `slashProposeDescendantOfCheckpointWithInvalidAttestationsPenalty`: Penalty for PROPOSED_DESCENDANT_OF_CHECKPOINT_WITH_INVALID_ATTESTATIONS
- `slashAttestInvalidCheckpointProposalPenalty`: Penalty for ATTESTED_TO_INVALID_CHECKPOINT_PROPOSAL
- `slashUnknownPenalty`: Default penalty for unknown offense types
- `slashMaxPayloadSize`: Limits the number of **unique validators** (across all committees and epochs in a round) that receive non-zero votes. When this cap is hit, the lowest-severity validator-epoch pairs are zeroed out first, so the most severe slashes are always preserved. Note that multiple offenses for the same validator in the same epoch are summed and counted as a single validator entry against this limit.

Considerations:

- All penalties should map to one of the `slashingAmounts`. A penalty lower than the smallest slashing amount will not be executable, and a penalty greater than the maximum will be capped at the maximum value.
- The `slashOffenseExpirationRounds` should be strictly larger than the `slashingOffsetInRounds`. This can be a relatively large value, as it's used only for data store cleanup.

## Offenses In-Depth

Details about specific offenses in the system:

### Inactivity

Inactivity slashing is one of the most critical, since it allows purging validators that are not fulfilling their duties, which could potentially bring the chain to a halt. This slashing must be aggressive enough to balance out the rate of the entry queue, in case the queue is filled with inactive validators. Furthermore, if enough inactive validators join the system, it may become impossible to gather enough quorum to pass any governance proposal.

Inactivity slashing is handled by the `Sentinel` (in `aztec-node/src/sentinel/`), which monitors performance of all validators slot-by-slot. With the multiple-blocks-per-slot model, block proposals and checkpoints are distinct concepts: proposers build multiple blocks per slot, but attestations are only for checkpoints. After each slot, the sentinel assigns one of the following to the proposer for the slot, in highest-confidence order:

- `checkpoint-mined` — a checkpoint covering this slot has landed on L1
- `checkpoint-valid` — the local node re-executed a checkpoint proposal for this slot successfully
- `checkpoint-invalid` — the local node re-executed a checkpoint proposal for this slot and rejected it (header / archive / out-hash mismatch, limit breach, etc.). Proposer-fault
- `checkpoint-unvalidated` — a checkpoint proposal arrived but the local node could not validate it (missing blocks/txs, timeout). Treated as proposer-fault
- `checkpoint-missed` — block proposals seen on P2P but no checkpoint proposal at all
- `blocks-missed` — no block proposals seen for this slot at all

Re-execution outcomes are read from the `CheckpointReexecutionTracker`, which the validator client populates at every early-return in `validateCheckpointProposal`. The same tracker is consumed by the data-withholding watcher via `hasReexecuted(checkpointNumber, archiveRoot)`.

Each non-proposer committee member is assigned one of:
- `attestation-sent` if their checkpoint attestation was seen on L1 or on the P2P network
- `attestation-missed` if the proposer status was `checkpoint-mined` or `checkpoint-valid` but no checkpoint attestation was seen
- none in any other case

`blocks-missed`, `checkpoint-missed`, `checkpoint-invalid`, and `checkpoint-unvalidated` all count as proposer inactivity for the slot.

The sentinel evaluates an epoch once `sentinelEpochEndBufferSlots` (default 2) L2 slots have elapsed past the epoch's last slot AND the per-slot recorder has covered that last slot. Epoch evaluation does not wait for an L1 proof — it relies on local-state evidence (the re-execution tracker plus L1 checkpoint landings) — so inactive validators are slashed promptly regardless of prover availability.

At end-of-epoch evaluation, for each validator such that:

```
total_failures = count(blocks-missed) + count(checkpoint-missed)
               + count(checkpoint-invalid) + count(checkpoint-unvalidated)
               + count(attestation-missed)
total = count(checkpoint-*) + count(blocks-*) + count(attestation-*)
total_failures / total >= slashInactivityTargetPercentage
```

they are voted to be slashed for inactivity. If `slashInactivityConsecutiveEpochThreshold` is greater than one, the above must also hold for the last `threshold` times the validator was part of a committee.
