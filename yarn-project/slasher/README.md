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

## Slashing Models

The system supports two slashing models:

### Tally Model

_This is the model currently in use._

The tally model uses consensus-based voting where proposers vote on individual validator offenses. Time is divided into rounds, and during each round, proposers submit votes indicating which validators from a given past round should be slashed (eg round N votes to slash the validators from round N-2). Votes are encoded as bytes where each validator's vote is represented by 2 bits indicating the slash amount (0-3 slash units) for each validator. The L1 contract tallies votes and slashes validators that reach quorum.

Key characteristics:
- Proposers vote directly on validator offenses
- Requires a slash offset to vote on validators from past rounds
- Requires quorum to execute slashing
- L1 contract determines which offenses reach consensus
- Execution happens after a delay period for review
- Slash payloads can be vetoed during the execution delay period

### Empire Model

_This model was developed during an earlier iteration and later modified, but never tested in a real network. It remains in the code in case we decide to switch from the tally model in the future._

The empire model piggybacks on the empire governance system and uses fixed slash payloads that are created and voted on. Proposers aggregate pending offenses and create payloads containing multiple offenses, or vote for existing payloads. The payload with the highest score (based on total offenses, votes received, and round progress) gets executed.

Key characteristics:
- Fixed payloads containing multiple offenses
- Payload scoring system for selection
- Requires agreement on payload contents (main reason why it was dropped in favor of the Tally model)

## Architecture

### Core Components

#### SlasherClientInterface
Common interface implemented by both tally and empire clients. Provides methods for:
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
- `vote-offenses`: Vote on validator offenses (tally model)
- `execute-slash`: Execute slashing for a round that reached quorum (tally model)
- `create-empire-payload`: Create a new slash payload (empire model)
- `vote-empire-payload`: Vote for an existing payload (empire model)
- `execute-empire-payload`: Execute a payload with sufficient votes (empire model)

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
**Description**: The data required for proving an epoch was not made publicly available.  
**Detection**: EpochPruneWatcher detects when an epoch cannot be proven due to missing data.  
**Target**: Committee members of the affected epoch.  
**Time Unit**: Epoch-based offense.

### VALID_EPOCH_PRUNED
**Description**: An epoch was not successfully proven within the proof submission window.  
**Detection**: EpochPruneWatcher monitors epochs that expire without valid proofs.  
**Target**: Committee members of the unpruned epoch.  
**Time Unit**: Epoch-based offense.

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

### ATTESTED_DESCENDANT_OF_INVALID
**Description**: A committee member attested to a block built on top of an invalid ancestor.  
**Detection**: AttestationsBlockWatcher tracks invalid blocks and their descendants.  
**Target**: Committee members who attested to the descendant block.  
**Time Unit**: Slot-based offense.

## Configuration

### L1 System Settings (L1ContractsConfig)
These settings are deployed with the L1 contracts and apply system-wide to the protocol:

- `slashingQuorumSize`: Votes required to slash (defaults to half the validators in a round, plus one)
- `slashingRoundSizeInEpochs`: Number of epochs per slashing round
- `slashingOffsetInRounds`: How many rounds to look back for offenses (tally model)
- `slashingExecutionDelayInRounds`: Rounds to wait before execution
- `slashingLifetimeInRounds`: Maximum age of executable rounds
- `slashingAmounts`: Valid values for each individual slash (tally model)

Considerations:

- The `slashingQuorumSize` should be more than half and less than the total number of validators in a round, so that we require a majority to slash. The number of validators in a round is the committee size times the number of epochs in a round.
- The bigger a `slashingRoundSizeInEpochs`, the bigger the upper bound on the quorum size. This increases security, as we need more validators to agree before slashing. However, it also makes slashing slower, and more expensive to execute in terms of gas in the tally model.
- The `slashingOffsetInRounds` is required because the validators in a given slashing round must vote for _past_ offenses. Otherwise, if someone commits an offense near the end of a round, they can get away with their offense without the validators being able to collect enough votes to slash them. The offset needs to be big enough so that all offenses are discoverable, so this value should be strictly greater than the proof submission window in order to be able to slash for epoch prunes or data withholding.
- The `slashingExecutionDelayInRounds` allows vetoers to stop an invalid slash. This should be large enough to give vetoers time to act, but strictly smaller than the validator exit window, so an offender cannot escape before they are slashed. It should also be small enough so that an offender that would be kicked out does not get picked up to be a committee member again before their slash is executed. In other words, if a validator commits a serious enough offense that we want them out of the validator set as soon as possible, the execution delay should not allow them to be chosen to participate in another committee.

### Local Node Configuration (SlasherConfig)

These settings are configured locally on each validator node:

- `slashGracePeriodL2Slots`: Number of initial L2 slots where slashing is disabled
- `slashOffenseExpirationRounds`: Number of rounds after which pending offenses expire
- `slashValidatorsAlways`: Array of validator addresses that should always be slashed
- `slashValidatorsNever`: Array of validator addresses that should never be slashed (own validator addresses are automatically added to this list)
- `slashInactivityTargetPercentage`: Percentage of misses during an epoch to be slashed for INACTIVITY
- `slashInactivityConsecutiveEpochThreshold`: How many consecutive inactive epochs are needed to trigger an INACTIVITY slash on a validator
- `slashPrunePenalty`: Penalty for VALID_EPOCH_PRUNED
- `slashDataWithholdingPenalty`: Penalty for DATA_WITHHOLDING
- `slashInactivityPenalty`: Penalty for INACTIVITY
- `slashBroadcastedInvalidBlockPenalty`: Penalty for BROADCASTED_INVALID_BLOCK_PROPOSAL
- `slashProposeInvalidAttestationsPenalty`: Penalty for PROPOSED_INSUFFICIENT_ATTESTATIONS and PROPOSED_INCORRECT_ATTESTATIONS
- `slashAttestDescendantOfInvalidPenalty`: Penalty for ATTESTED_DESCENDANT_OF_INVALID
- `slashUnknownPenalty`: Default penalty for unknown offense types
- `slashMaxPayloadSize`: Maximum size of slash payloads (empire model)
- `slashMinPenaltyPercentage`: Agree to slashes if they are at least this percentage of the configured penalty (empire model)
- `slashMaxPenaltyPercentage`: Agree to slashes if they are at most this percentage of the configured penalty (empire model)

Considerations:

- All penalties should map to one of the `slashingAmounts`. A penalty lower than the smallest slashing amount will not be executable, and a penalty greater than the maximum will be capped at the maximum value.
- The `slashOffenseExpirationRounds` should be strictly larger than the `slashingOffsetInRounds`. This can be a relatively large value, as it's used only for data store cleanup.

## Offenses In-Depth

Details about specific offenses in the system:

### Inactivity

Inactivity slashing is one of the most critical, since it allows purging validators that are not fulfilling their duties, which could potentially bring the chain to a halt. This slashing must be aggressive enough to balance out the rate of the entry queue, in case the queue is filled with inactive validators. Furthermore, if enough inactive validators join the system, it may become impossible to gather enough quorum to pass any governance proposal.

Inactivity slashing is handled by the `Sentinel` which monitors performance of all validators slot-by-slot. After each slot, the sentinel assigns one of the following to the block proposer for the slot:
- `block-mined` if the block was added to L1
- `block-proposed` if the block received at least one attestation, but didn't make it to L1
- `block-missed` if the block received no attestations (note that we cannot rely on the P2P proposal alone since it may be invalid, unless we reexecute it)

And assigns one of the following to each validator:
- `attestation-sent` if there was a `block-proposed` or `block-mined` and an attestation from this validator was seen on either on L1 or on the P2P network
- `attestation-missed` if there was a `block-proposed` or `block-mined` but no attestation was seen
- none if the slot was a `block-missed`

Once an epoch is proven, the sentinel computes the _proven performance_ for the epoch for each validator. Note that we wait until the epoch is proven so we know that the data for all blocks in the epoch was available, and validators who did not attest were effectively inactive. Then, for each validator such that:

```
total_failures = count(block-missed) + count(attestation-missed)
total = count(block-*) + count(attestation-*)
total_failures / total >= slash_inactivity_target_percentage
```

They are voted to be slashed for inactivity. Note that, if `slashInactivityConsecutiveEpochThreshold` is greater than one, we first check if the above is true for the last `threshold` times the given validator was part of a committee, and only then trigger the offense.


