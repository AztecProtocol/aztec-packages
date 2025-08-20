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

The tally model uses consensus-based voting where proposers vote on individual validator offenses. Time is divided into rounds, and during each round, proposers submit votes indicating which validators should be slashed. Votes are encoded as bytes where each nibble (4 bits) represents the slash amount (0-15 slash units) for each validator. The L1 contract tallies votes and slashes validators that reach quorum.

Key characteristics:
- Proposers vote directly on validator offenses
- Uses a slash offset to vote on validators from past rounds (e.g., round N votes on round N-2)
- Requires quorum to execute slashing
- L1 contract determines which offenses reach consensus
- Execution happens after a delay period for review

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
- Manages offense lifecycle and expiration

#### SlasherOffensesStore
Persistent storage for offenses. Tracks:
- Pending offenses awaiting slashing
- Executed offenses to prevent double slashing
- Round-based offense organization

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

## Slashable Offenses

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
**Note**: Currently not actively monitored in production.

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

### Slasher Configuration
- `slashGracePeriodL2Slots`: Number of initial L2 slots where slashing is disabled
- `slashMaxPayloadSize`: Maximum size of slash payloads (empire model)
- `slashingRoundSize`: Number of slots per slashing round
- `slashingQuorumSize`: Votes required to slash (tally model)
- `slashingOffsetInRounds`: How many rounds to look back for offenses (tally model)
- `slashingExecutionDelayInRounds`: Rounds to wait before execution
- `slashingLifetimeInRounds`: Maximum age of executable rounds
- `slashingUnit`: Base slashing amount per unit

### Environment Variables
- `SLASHER_CLIENT_TYPE`: Select between 'tally' or 'empire' (default: 'tally')
