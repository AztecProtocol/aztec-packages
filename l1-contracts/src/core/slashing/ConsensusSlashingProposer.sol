// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
// solhint-disable comprehensive-interface
pragma solidity >=0.8.27;

import {ISlasher, SlasherFlavor} from "@aztec/core/interfaces/ISlasher.sol";
import {IValidatorSelection} from "@aztec/core/interfaces/IValidatorSelection.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {SlashPayload} from "@aztec/periphery/SlashPayload.sol";
import {CompressedSlot, CompressedTimeMath} from "@aztec/shared/libraries/CompressedTimeMath.sol";
import {SignatureLib, Signature} from "@aztec/shared/libraries/SignatureLib.sol";
import {Slot, Epoch} from "@aztec/shared/libraries/TimeMath.sol";
import {SlashRound, CompressedSlashRound, CompressedSlashRoundMath} from "@aztec/shared/libraries/SlashRoundLib.sol";
import {EIP712} from "@oz/utils/cryptography/EIP712.sol";
import {SafeCast} from "@oz/utils/math/SafeCast.sol";

/**
 * @title ConsensusSlashingProposer
 * @author Aztec Labs
 * @notice Consensus-based slashing proposer that aggregates validator votes to determine which validators should be
 * slashed
 *
 * @dev This contract implements a voting-based slashing mechanism where block proposers signal their intent to slash
 *      validators from past epochs. The system operates in rounds, with each round corresponding to a time period where
 *      votes are collected from proposers to determine which validators should be slashed.
 *
 *      Key concepts:
 *      - Rounds: Time periods during which votes are collected (measured in slots, multiple of epochs)
 *      - Voting: Block proposers submit encoded votes indicating which validators should be slashed and by how much
 *      - Quorum: Minimum number of votes required in a round to trigger slashing of a specific validator
 *      - Execution Delay: Time that must pass after a round ends before its slashing can be executed (allows vetoing)
 *      - Slash Offset: How many rounds in the past to look when determining which validators to slash
 *
 *      How the system works:
 *      1. Time is divided into rounds (ROUND_SIZE slots each).
 *      2. During each round, block proposers can submit votes indicating which validators from the epochs that span
 *         SLASH_OFFSET_IN_ROUNDS rounds ago should be slashed.
 *      3. Votes are encoded as bytes where the i-th nibble (4 bits) represents the slash amount (0-15 slash units) for
 *         the i-th validator slashed in the round.
 *      4. After a round ends, there is an execution delay period for review so the VETOER in the Slasher can veto the
 *         expected payload address if needed.
 *      5. Once the delay passes, anyone can call executeRound() to tally votes and execute slashing.
 *      6. Validators that reach the quorum threshold are slashed by the specified amount. We consider a vote for
 *         slashing N units as also a vote for slashing N-1, N-2, ..., 1 units. We slash for the largest amount that
 *         reaches quorum.
 *
 *      About SLASH_OFFSET_IN_ROUNDS:
 *      - This offset gives us time to detect an offense and then vote on it in a later
 *        round. For instance, an `VALID_EPOCH_PRUNED` offense for epoch N is only triggered after
 *        `PROOF_SUBMISSION_WINDOW` epochs. Consider the following:
 *        - Epoch 1 is valid
 *        - At the end of epoch 3, the proof for 1 has not landed, so epoch 1 is pruned
 *        - Network decides to slash the committee of epoch 1
 *        - This means that only starting from epoch 4 we should be voting for slashing the committee of epoch 1
 *      - In terms of voting, this parameter means that in round R we are voting for the committee of epochs starting
 *        from (R - SLASH_OFFSET_IN_ROUNDS) * ROUND_SIZE_IN_EPOCHS.
 *      - For example, with SLASH_OFFSET_IN_ROUNDS=2, ROUND_SIZE=10, and EPOCH_DURATION=2
 *        - In round 4, we are voting for the committee of epochs starting from (4 - 2) * 10 = 20 (i.e., epochs 20-29)
 *
 *      Considerations:
 *      - Only the designated proposer for each slot can submit votes
 *      - Votes are signed using EIP-712
 *      - Votes include slot numbers to prevent replay attacks
 *      - Committee commitments are verified against on-chain data
 *      - Rounds have a lifetime limit
 *      - Uses circular storage to limit memory usage while maintaining recent round data
 *
 *      Integration with Aztec system:
 *      - Connects to the main Rollup contract (INSTANCE) to get proposer information and committee data
 *      - Uses the Slasher contract to execute actual slashing operations
 *      - Coordinates with validator selection of the Rollup instance to identify which validators should be slashed
 *      - Supports the Rollup's security model by enabling punishment of misbehaving validators
 *
 *      Parameters and configuration:
 *      - QUORUM: Minimum votes needed to slash a validator
 *      - ROUND_SIZE: Number of slots per voting round
 *      - EXECUTION_DELAY_IN_ROUNDS: Rounds to wait before allowing execution
 *      - LIFETIME_IN_ROUNDS: Maximum age of rounds that can still be executed
 *      - SLASH_OFFSET_IN_ROUNDS: How far back to look for validators to slash
 *      - SLASHING_UNIT: Base amount of slashing per unit voted
 *      - COMMITTEE_SIZE: Number of validators per committee
 */
contract ConsensusSlashingProposer is EIP712 {
  using SignatureLib for Signature;
  using CompressedTimeMath for CompressedSlot;
  using CompressedTimeMath for Slot;
  using CompressedSlashRoundMath for CompressedSlashRound;
  using CompressedSlashRoundMath for SlashRound;

  /**
   * @notice Contains metadata about a slashing round stored in uncompressed format
   * @dev Used for in-memory operations and as the return type for getRoundData()
   * @param roundNumber The actual round number (used to detect stale data in circular storage)
   * @param voteCount Number of votes collected in this round so far
   * @param lastVoteSlot The most recent slot in which a vote was cast for this round
   * @param executed Whether this round has been executed and slashing has occurred
   */
  struct RoundData {
    SlashRound roundNumber;
    uint256 voteCount;
    Slot lastVoteSlot;
    bool executed;
  }

  /**
   * @notice Compressed version of RoundData optimized for storage efficiency (fits in 32 bytes)
   * @dev Used in the circular storage buffer to minimize gas costs for storage operations
   * @param roundNumber Compressed round number for staleness detection
   * @param lastVoteSlot Compressed slot number of the last vote
   * @param voteCount Number of votes (max 65535, must fit MAX_ROUND_SIZE constraint)
   * @param executed Whether this round has been executed
   */
  struct CompressedRoundData {
    CompressedSlashRound roundNumber;
    CompressedSlot lastVoteSlot;
    uint16 voteCount;
    bool executed;
  }

  /**
   * @notice Contains all vote data for a single round
   * @dev Stores up to MAX_ROUND_SIZE votes as bytes arrays. Each vote encodes slash amounts
   *      for all validators in the round using 4-bit nibbles per validator.
   * @param votes Array of encoded vote data, one entry per proposer vote in the round
   */
  struct RoundVotes {
    // TODO(palla/slash): Do not use dynamic arrays given we know the size of each `votes` via the committee size
    bytes[1024] votes;
  }

  /**
   * @notice Represents a slashing action to be executed against a specific validator
   * @dev Used to package slashing decisions for execution by the Slasher contract
   * @param validator The address of the validator to be slashed
   * @param slashAmount The amount of stake to slash from the validator (in wei)
   */
  struct SlashAction {
    address validator;
    uint256 slashAmount;
  }

  /**
   * @notice EIP-712 type hash for the Vote struct used in signature verification
   * @dev Defines the structure: Vote(uint256 slot,bytes votes) for EIP-712 signing
   */
  bytes32 public constant VOTE_TYPEHASH = keccak256("Vote(uint256 slot,bytes votes)");

  /**
   * @notice Type of slashing proposer (either Consensus or Empire)
   */
  SlasherFlavor public constant SLASHING_PROPOSER_TYPE = SlasherFlavor.CONSENSUS;

  /**
   * @notice Size of the circular storage buffer for round data
   * @dev Determines how many recent rounds can be kept in storage simultaneously.
   *      Older rounds are overwritten as new rounds are created. Must be larger than
   *      LIFETIME_IN_ROUNDS to prevent data corruption.
   */
  uint256 public constant ROUNDABOUT_SIZE = 128;

  /**
   * @notice Maximum number of votes that can be cast in a single round
   * @dev Hard limit to prevent excessive gas usage and storage requirements.
   *      Also serves as the maximum number of slots per round.
   */
  uint256 public constant MAX_ROUND_SIZE = 1024;

  /**
   * @notice Address of the main rollup contract that this slashing proposer integrates with
   * @dev Used to query current proposers, committee data, and slot information
   */
  address public immutable INSTANCE;

  /**
   * @notice The slasher contract that executes actual slashing operations
   * @dev Receives SlashPayload contracts from this proposer to perform validator punishment
   */
  ISlasher public immutable SLASHER;

  /**
   * @notice Base amount of stake to slash per slashing unit (in wei)
   * @dev Validators can be voted to be slashed by 1-15 units, multiplied by this base amount
   */
  uint256 public immutable SLASHING_UNIT;

  /**
   * @notice Minimum number of votes required to slash a validator
   * @dev Must be greater than ROUND_SIZE/2 to ensure majority consensus
   */
  uint256 public immutable QUORUM;

  /**
   * @notice Number of slots per slashing round
   * @dev Determines the duration of voting periods and must be a multiple of epoch duration
   */
  uint256 public immutable ROUND_SIZE;

  /**
   * @notice Number of validators per committee
   * @dev Used to determine vote encoding length and validator indexing
   */
  uint256 public immutable COMMITTEE_SIZE;

  /**
   * @notice Number of epochs per slashing round
   * @dev Calculated as ROUND_SIZE / epoch duration, determines how many committees are voted on per round
   */
  uint256 public immutable ROUND_SIZE_IN_EPOCHS;

  /**
   * @notice Maximum age in rounds for which a round can still be executed
   * @dev Prevents execution of very old rounds that may no longer be relevant
   */
  uint256 public immutable LIFETIME_IN_ROUNDS;

  /**
   * @notice Number of rounds to wait after a round ends before it can be executed
   * @dev Provides time for review and potential challenges before slashing occurs
   */
  uint256 public immutable EXECUTION_DELAY_IN_ROUNDS;

  /**
   * @notice How many rounds in the past to look when determining which validators to slash
   * @dev During round N, we cannot slash the validators from the epochs of the same round, since the round is not over,
   * and besides we would be asking the current validators to vote to slash themselves. So during round N we look at the
   * epochs spanned during round N - SLASH_OFFSET_IN_ROUNDS. This offset means that the epochs we slash are complete,
   * and also gives nodes time to detect any misbehavior (eg slashing for prunes requires the proof submission window to
   * pass).
   */
  uint256 public immutable SLASH_OFFSET_IN_ROUNDS;

  // Circular mappings of round number to round data and votes
  CompressedRoundData[ROUNDABOUT_SIZE] private roundDatas;
  RoundVotes[ROUNDABOUT_SIZE] private roundVotes;

  /**
   * @notice Emitted when a proposer casts a vote in a slashing round
   * @param round The round number in which the vote was cast
   * @param proposer The address of the proposer who cast the vote
   */
  event VoteCast(SlashRound indexed round, Slot indexed slot, address indexed proposer);

  /**
   * @notice Emitted when a slashing round is executed and validators are slashed
   * @param round The round number that was executed
   * @param slashCount The number of validators that were slashed in this round
   */
  event RoundExecuted(SlashRound indexed round, uint256 slashCount);

  /**
   * @notice Initializes the ConsensusSlashingProposer with configuration parameters
   * @dev Sets up all the voting and slashing parameters and validates their correctness.
   *      The constructor enforces several important invariants to ensure the system operates correctly.
   *
   * @param _instance The address of the rollup contract that this slashing proposer will interact with
   * @param _slasher The slasher contract that will execute the actual slashing operations
   * @param _quorum The minimum number of votes required to slash a validator (must be > ROUND_SIZE/2 and <= ROUND_SIZE)
   * @param _roundSize The number of slots in each voting round (must be > 1 and < MAX_ROUND_SIZE)
   * @param _lifetimeInRounds The maximum age in rounds for which a round can still be executed (must be >
   * _executionDelayInRounds and < ROUNDABOUT_SIZE)
   * @param _executionDelayInRounds The number of rounds to wait after a round ends before it can be executed (provides
   * time for review)
   * @param _slashingUnit The base amount of stake to slash per slashing unit (must be > 0)
   * @param _committeeSize The number of validators in each committee (must be > 0)
   * @param _epochDuration The number of slots in each epoch (used to calculate ROUND_SIZE_IN_EPOCHS)
   * @param _slashOffsetInRounds How many rounds in the past to look when determining which validators to slash (must be
   * > 0)
   */
  constructor(
    address _instance,
    ISlasher _slasher,
    uint256 _quorum,
    uint256 _roundSize,
    uint256 _lifetimeInRounds,
    uint256 _executionDelayInRounds,
    uint256 _slashingUnit,
    uint256 _committeeSize,
    uint256 _epochDuration,
    uint256 _slashOffsetInRounds
  ) EIP712("ConsensusSlashingProposer", "1") {
    INSTANCE = _instance;
    SLASHER = _slasher;
    SLASHING_UNIT = _slashingUnit;
    QUORUM = _quorum;
    ROUND_SIZE = _roundSize;
    ROUND_SIZE_IN_EPOCHS = _roundSize / _epochDuration;
    COMMITTEE_SIZE = _committeeSize;
    LIFETIME_IN_ROUNDS = _lifetimeInRounds;
    EXECUTION_DELAY_IN_ROUNDS = _executionDelayInRounds;
    SLASH_OFFSET_IN_ROUNDS = _slashOffsetInRounds;

    require(
      SLASH_OFFSET_IN_ROUNDS > 0,
      Errors.ConsensusSlashingProposer__SlashOffsetMustBeGreaterThanZero(SLASH_OFFSET_IN_ROUNDS)
    );
    require(
      ROUND_SIZE_IN_EPOCHS * _epochDuration == ROUND_SIZE,
      Errors.ConsensusSlashingProposer__RoundSizeMustBeMultipleOfEpochDuration(ROUND_SIZE, _epochDuration)
    );
    require(QUORUM > 0, Errors.ConsensusSlashingProposer__QuorumMustBeGreaterThanZero());
    require(ROUND_SIZE > 1, Errors.ConsensusSlashingProposer__InvalidQuorumAndRoundSize(QUORUM, ROUND_SIZE));
    require(QUORUM > ROUND_SIZE / 2, Errors.ConsensusSlashingProposer__InvalidQuorumAndRoundSize(QUORUM, ROUND_SIZE));
    require(QUORUM <= ROUND_SIZE, Errors.ConsensusSlashingProposer__InvalidQuorumAndRoundSize(QUORUM, ROUND_SIZE));
    require(SLASHING_UNIT > 0, Errors.ConsensusSlashingProposer__SlashingUnitMustBeGreaterThanZero(SLASHING_UNIT));
    require(
      LIFETIME_IN_ROUNDS > EXECUTION_DELAY_IN_ROUNDS,
      Errors.ConsensusSlashingProposer__LifetimeMustBeGreaterThanExecutionDelay(
        LIFETIME_IN_ROUNDS, EXECUTION_DELAY_IN_ROUNDS
      )
    );
    require(
      LIFETIME_IN_ROUNDS < ROUNDABOUT_SIZE,
      Errors.ConsensusSlashingProposer__LifetimeMustBeLessThanRoundabout(LIFETIME_IN_ROUNDS, ROUNDABOUT_SIZE)
    );
    require(
      ROUND_SIZE_IN_EPOCHS > 0,
      Errors.ConsensusSlashingProposer__RoundSizeInEpochsMustBeGreaterThanZero(ROUND_SIZE_IN_EPOCHS)
    );
    require(
      ROUND_SIZE < MAX_ROUND_SIZE, Errors.ConsensusSlashingProposer__RoundSizeTooLarge(ROUND_SIZE, MAX_ROUND_SIZE)
    );
    require(COMMITTEE_SIZE > 0, Errors.ConsensusSlashingProposer__CommitteeSizeMustBeGreaterThanZero(COMMITTEE_SIZE));
  }

  /**
   * @notice Submit a vote for slashing validators from SLASH_OFFSET_IN_ROUNDS rounds ago
   * @dev Only the current block proposer can submit votes, enforced via EIP-712 signature verification.
   *      Each byte in the votes encodes slash amounts for 2 validators using 4-bit nibbles (0-15 units each).
   *      The vote includes the current slot number to prevent replay attacks.
   *
   * @param _votes Encoded voting data where each byte represents slash amounts for 2 validators.
   *               Lower 4 bits for first validator, upper 4 bits for second validator in each byte.
   *               Length must equal (COMMITTEE_SIZE * ROUND_SIZE_IN_EPOCHS) / 2 bytes.
   * @param _sig EIP-712 signature from the current proposer proving authorization to vote.
   *             Signature covers the vote data and current slot number.
   *
   * Emits:
   * - VoteCast: When the vote is successfully recorded
   *
   * Reverts with:
   * - ConsensusSlashingProposer__VotingNotOpen: If current round is less than SLASH_OFFSET_IN_ROUNDS
   * - ConsensusSlashingProposer__InvalidSignature: If signature verification fails
   * - ConsensusSlashingProposer__InvalidVoteLength: If vote data length is incorrect
   * - ConsensusSlashingProposer__VoteAlreadyCastInCurrentSlot: If proposer already voted in this slot
   */
  function vote(bytes calldata _votes, Signature calldata _sig) external {
    Slot slot = _getCurrentSlot();
    SlashRound round = _computeRound(slot);

    // We vote for slashing validators for epochs from SLASH_OFFSET_IN_ROUNDS ago, so in early rounds there is no one to
    // be slashed.
    require(round >= SlashRound.wrap(SLASH_OFFSET_IN_ROUNDS), Errors.ConsensusSlashingProposer__VotingNotOpen(round));

    // Get the current proposer from the rollup - only they can submit votes
    address proposer = _getCurrentProposer();

    // Verify EIP-712 signature (which includes slot to prevent replay attacks)
    bytes32 digest = getVoteSignatureDigest(_votes, slot);
    require(_sig.verify(proposer, digest), Errors.ConsensusSlashingProposer__InvalidSignature());

    // Each byte encodes 2 validators (4 bits each), so each validator is represented as a nibble in the byte array.
    uint256 expectedLength = COMMITTEE_SIZE * ROUND_SIZE_IN_EPOCHS / 2;
    require(
      _votes.length == expectedLength,
      Errors.ConsensusSlashingProposer__InvalidVoteLength(expectedLength, _votes.length)
    );

    // Get the round data for the current round
    RoundData memory roundData = _getRoundData(round, round);

    // Check if a vote has already been cast in the current slot
    require(roundData.lastVoteSlot < slot, Errors.ConsensusSlashingProposer__VoteAlreadyCastInCurrentSlot(slot));

    // Store the vote for this round
    uint256 voteCount = roundData.voteCount;
    _getRoundVotes(round).votes[voteCount] = _votes;

    // Increment the vote count for this round (all other fields remain unchanged)
    _setRoundData(round, slot, voteCount + 1, roundData.executed);

    emit VoteCast(round, slot, proposer);
  }

  /**
   * @notice Execute the slashing round by tallying votes and executing slashes for validators that reached quorum
   * @dev Can be called by anyone once a round has passed its execution delay but is still within its lifetime.
   *      The function tallies all votes cast during the round, identifies validators that reached the quorum threshold,
   *      and executes slashing by deploying a SlashPayload contract and calling the Slasher.
   *
   * @param _round The round number to execute (must be ready for execution based on timing constraints)
   * @param _committees Array of validator committees slashed for each epoch in the round being executed.
   *                   Must contain exactly ROUND_SIZE_IN_EPOCHS committees. Only committees with slashed
   *                   validators will have their commitments verified against on-chain data.
   *
   * Emits:
   * - RoundExecuted: When the round execution completes, regardless of whether any slashing occurred
   *
   * Reverts with:
   * - ConsensusSlashingProposer__RoundAlreadyExecuted: If the round has already been executed
   * - ConsensusSlashingProposer__RoundNotComplete: If the round is not yet ready for execution or has expired
   * - ConsensusSlashingProposer__InvalidCommitteeCommitment: If any committee commitment doesn't match on-chain data
   * - ConsensusSlashingProposer__InvalidNumberOfCommittees: If the number of committees doesn't match
   * ROUND_SIZE_IN_EPOCHS
   */
  function executeRound(SlashRound _round, address[][] calldata _committees) external {
    // Get round data to check if already executed
    SlashRound currentRound = getCurrentRound();
    RoundData memory roundData = _getRoundData(_round, currentRound);
    require(!roundData.executed, Errors.ConsensusSlashingProposer__RoundAlreadyExecuted(_round));

    // Ensure enough time has passed (execution delay) but not too much (lifetime)
    require(_isRoundReadyToExecute(_round, currentRound), Errors.ConsensusSlashingProposer__RoundNotComplete(_round));

    // Get the slash actions by tallying votes and which committees have slashes
    (SlashAction[] memory actions, bool[] memory committeesWithSlashes) = _tally(roundData, _committees);

    // Only verify committees that have slashed validators
    for (uint256 i = 0; i < committeesWithSlashes.length; i++) {
      if (!committeesWithSlashes[i]) {
        continue;
      }

      // Check committee commitments against the stored on-chain data
      bytes32 commitment = _computeCommitteeCommitment(_committees[i]);
      Epoch epochNumber = getSlashTargetEpoch(_round, i);
      require(
        commitment == _getCommitteeCommitment(epochNumber),
        Errors.ConsensusSlashingProposer__InvalidCommitteeCommitment()
      );
    }

    // Mark round as executed to prevent re-execution
    // We set this flag before actually slashing to avoid re-entrancy issues
    _setRoundData(_round, roundData.lastVoteSlot, roundData.voteCount, /*executed=*/ true);

    // Execute slashes if any were determined
    if (actions.length > 0) {
      // Deploy payload contract and execute slashes
      IPayload slashPayload = _deploySlashPayload(_round, actions);
      SLASHER.slash(slashPayload);
    }

    emit RoundExecuted(_round, actions.length);
  }

  /**
   * @notice Get the tally results for a specific round, showing which validators would be slashed
   * @dev This function is intended for off-chain querying and analysis of voting results.
   *      It uses transient storage when calling getEpochCommittee on the rollup contract.
   *      Returns the same slash actions that would be executed if executeRound() were called for this round.
   *
   * @param _round The round number to analyze and return tally results for
   * @return actions Array of SlashAction structs containing validator addresses and slash amounts
   *                for all validators that reached the quorum threshold in this round
   */
  function getTally(SlashRound _round) external returns (SlashAction[] memory) {
    // Get the round data for the specified round
    RoundData memory roundData = _getRoundData(_round, getCurrentRound());

    // Load the committees for this round
    address[][] memory committees = _getSlashTargetCommittees(_round);

    // Tally votes and return slash actions
    (SlashAction[] memory actions,) = _tally(roundData, committees);
    return actions;
  }

  /**
   * @notice Get the deterministic address where a slash payload would be deployed for given actions
   * @dev Uses CREATE2 to predict the deployment address based on the round number and slash actions.
   *      Returns zero address if no actions are provided. The address is deterministic and will be
   *      the same across multiple calls with identical parameters.
   *
   * @param _round The round number that will be mixed into the CREATE2 salt
   * @param _actions Array of SlashAction structs containing validator addresses and slash amounts
   * @return The predicted deployment address of the SlashPayload contract, or zero address if no actions
   */
  function getPayloadAddress(SlashRound _round, SlashAction[] memory _actions) external view returns (address) {
    // Return zero address if no actions
    if (_actions.length == 0) {
      return address(0);
    }
    (,,, address predictedAddress) = _preparePayloadDataAndAddress(_round, _actions);
    return predictedAddress;
  }

  /**
   * @notice Get information about a specific slashing round's status and voting data
   * @param _round The round number to retrieve information for
   * @return isExecuted True if the round has already been executed and slashing has occurred
   * @return readyToExecute True if the round is currently ready for execution (past execution delay but within
   * lifetime)
   * @return voteCount The total number of votes that have been cast in this round by proposers
   */
  function getRound(SlashRound _round) external view returns (bool isExecuted, bool readyToExecute, uint256 voteCount) {
    SlashRound currentRound = getCurrentRound();

    // Load round data from the circular storage
    RoundData memory roundData = _getRoundData(_round, currentRound);

    // Check if the round is ready to execute based on current round number
    bool isReady = _isRoundReadyToExecute(_round, currentRound);

    // If we have not written to this round yet, return fresh round data
    if (roundData.roundNumber != _round) {
      return (false, isReady, 0);
    }

    return (roundData.executed, isReady, roundData.voteCount);
  }

  /**
   * @notice Get the current round number based on the current slot from the rollup
   * @dev Calculates the current round by dividing the current slot number by ROUND_SIZE.
   *      This determines which voting round is currently active.
   * @return The current SlashRound number
   */
  function getCurrentRound() public view returns (SlashRound) {
    // Get current slot from the rollup instance
    IValidatorSelection rollup = IValidatorSelection(INSTANCE);
    Slot currentSlot = rollup.getCurrentSlot();
    // Divide slot by round size to get round number
    return SlashRound.wrap(Slot.unwrap(currentSlot) / ROUND_SIZE);
  }

  /**
   * @notice Get the epoch number that will be slashed during a specific round at a given epoch index
   * @dev Calculates which epoch's validators are being voted on for slashing in a given round.
   *      The epoch is determined by looking back SLASH_OFFSET_IN_ROUNDS rounds from the voting round
   *      and then adding the epoch index within that round.
   *
   * @param _round The round number during which voting is taking place
   * @param _epochIndex The index of the epoch within the round (must be 0 to ROUND_SIZE_IN_EPOCHS-1)
   * @return epochNumber The epoch number whose validators will be considered for slashing
   *
   * Reverts with:
   * - ConsensusSlashingProposer__VotingNotOpen: If the round is less than SLASH_OFFSET_IN_ROUNDS
   */
  function getSlashTargetEpoch(SlashRound _round, uint256 _epochIndex) public view returns (Epoch epochNumber) {
    require(_round >= SlashRound.wrap(SLASH_OFFSET_IN_ROUNDS), Errors.ConsensusSlashingProposer__VotingNotOpen(_round));
    require(
      _epochIndex < ROUND_SIZE_IN_EPOCHS,
      Errors.ConsensusSlashingProposer__InvalidEpochIndex(_epochIndex, ROUND_SIZE_IN_EPOCHS)
    );
    return Epoch.wrap((SlashRound.unwrap(_round) - SLASH_OFFSET_IN_ROUNDS) * ROUND_SIZE_IN_EPOCHS + _epochIndex);
  }

  /**
   * @notice Generate the EIP-712 signature digest for a vote to prevent replay attacks
   * @dev Creates a typed data hash according to EIP-712 standard that includes both the vote data
   *      and the slot number. The slot number inclusion prevents votes from being replayed in
   *      different slots, ensuring each vote is tied to a specific time.
   *
   * @param _votes The encoded vote data that will be signed by the proposer
   * @param _slot The slot number when the vote is being cast (prevents replay attacks)
   * @return The EIP-712 compliant signature digest that should be signed by the proposer
   */
  function getVoteSignatureDigest(bytes calldata _votes, Slot _slot) public view returns (bytes32) {
    return _hashTypedDataV4(keccak256(abi.encode(VOTE_TYPEHASH, keccak256(_votes), Slot.unwrap(_slot))));
  }

  /**
   * @notice Get the address of the validator who is authorized to propose in the current slot
   * @dev Queries the rollup contract to determine which validator has proposing rights.
   *      This is used to verify that vote signatures come from the authorized proposer.
   * @return The address of the current slot's designated proposer
   */
  function _getCurrentProposer() internal returns (address) {
    // Query the rollup for who is allowed to propose in the current slot
    IValidatorSelection rollup = IValidatorSelection(INSTANCE);
    return rollup.getCurrentProposer();
  }

  /**
   * @notice Get the committee commitment from the Rollup.
   * @param _epoch The epoch number
   */
  function _getCommitteeCommitment(Epoch _epoch) internal returns (bytes32) {
    IValidatorSelection rollup = IValidatorSelection(INSTANCE);
    (bytes32 commitment,) = rollup.getEpochCommitteeCommitment(_epoch);

    return commitment;
  }

  /**
   * @notice Deploy a slash payload contract with the given actions
   * @dev Deploys a SlashPayload contract using CREATE2 for deterministic addresses
   * @param _round The round number (mixed into the salt)
   * @param _actions Array of slash actions to encode in the payload
   */
  function _deploySlashPayload(SlashRound _round, SlashAction[] memory _actions) internal returns (IPayload) {
    // Prepare arrays for the SlashPayload constructor and get the predicted address
    (address[] memory validators, uint96[] memory amounts, bytes32 salt, address predictedAddress) =
      _preparePayloadDataAndAddress(_round, _actions);

    // Return existing payload if already deployed
    if (predictedAddress.code.length > 0) {
      return IPayload(predictedAddress);
    }

    // Deploy new SlashPayload contract
    SlashPayload payload = new SlashPayload{salt: salt}(validators, amounts, IValidatorSelection(INSTANCE));

    return IPayload(address(payload));
  }

  /**
   * @notice Load committees for all epochs to be potentially slashed in a round from the rollup instance
   * @dev This is an expensive call, use only from external view functions
   * @param _round The round number to load committees for
   * @return committees Array of committees, one for each epoch in the round
   */
  function _getSlashTargetCommittees(SlashRound _round) internal returns (address[][] memory committees) {
    committees = new address[][](ROUND_SIZE_IN_EPOCHS);

    IValidatorSelection rollup = IValidatorSelection(INSTANCE);
    for (uint256 epochIndex = 0; epochIndex < ROUND_SIZE_IN_EPOCHS; epochIndex++) {
      Epoch epoch = getSlashTargetEpoch(_round, epochIndex);
      committees[epochIndex] = rollup.getEpochCommittee(epoch);
    }

    return committees;
  }

  /**
   * @notice Set round data in the circular storage
   * This function DOES NOT check for round validity or range within the roundabout
   * @param roundNumber The round number to set
   * @param lastVoteSlot The last slot for which a vote was received
   * @param voteCount The number of votes collected so far in this round
   * @param executed Whether this round has been executed
   * @dev This is an internal function that should only be called after verifying the round is valid and within range
   * @dev It updates the round data in the circular storage buffer
   */
  function _setRoundData(SlashRound roundNumber, Slot lastVoteSlot, uint256 voteCount, bool executed) internal {
    roundDatas[SlashRound.unwrap(roundNumber) % ROUNDABOUT_SIZE] = CompressedRoundData({
      roundNumber: roundNumber.compress(),
      lastVoteSlot: lastVoteSlot.compress(),
      voteCount: SafeCast.toUint16(voteCount), // Ensure voteCount fits in uint16
      executed: executed
    });
  }

  /**
   * @notice Tally votes for a specific round and return the slash actions to execute
   * @param _roundData The round data containing votes to tally
   * @param _committees The committees for each epoch in the round
   * @return slashActions Array of slash actions that reached quorum
   * @return committeesWithSlashes Boolean array indicating which committees have at least one slashed validator
   */
  function _tally(RoundData memory _roundData, address[][] memory _committees)
    internal
    view
    returns (SlashAction[] memory slashActions, bool[] memory committeesWithSlashes)
  {
    // Must have one committee per epoch in the round
    require(
      _committees.length == ROUND_SIZE_IN_EPOCHS,
      Errors.ConsensusSlashingProposer__InvalidNumberOfCommittees(ROUND_SIZE_IN_EPOCHS, _committees.length)
    );

    uint256 voteCount = _roundData.voteCount;

    // No votes cast, return empty array
    if (voteCount == 0) {
      return (new SlashAction[](0), new bool[](ROUND_SIZE_IN_EPOCHS));
    }

    SlashRound roundNumber = _roundData.roundNumber;

    // Create a 2D voting tally matrix: tallyMatrix[validatorIndex][slashAmountInUnits] = voteCount
    // - First dimension: validator index (0 to COMMITTEE_SIZE * ROUND_SIZE_IN_EPOCHS - 1)
    // - Second dimension: slash amount in units (0-15, where 0 means no slash)
    // Each validator can be voted to be slashed by 1-15 units (0 represents no slashing)
    uint256[16][] memory tallyMatrix = new uint256[16][](COMMITTEE_SIZE * ROUND_SIZE_IN_EPOCHS);

    // Process all votes cast during this round to populate the tally matrix
    // Vote encoding: each byte contains 2 validator votes using 4-bit nibbles
    // - Lower 4 bits (0x0F): slash amount for validator at index (j * 2)
    // - Upper 4 bits (0xF0): slash amount for validator at index (j * 2 + 1)
    for (uint256 i = 0; i < voteCount; i++) {
      // Load the i-th votes from this round from storage into memory
      bytes memory currentVote = _getRoundVotes(roundNumber).votes[i];
      for (uint256 j = 0; j < currentVote.length; j++) {
        // Extract lower 4 bits for first validator in the byte
        uint8 validatorSlash = uint8(currentVote[j]) & 0x0F;
        if (validatorSlash > 0) {
          tallyMatrix[j * 2][validatorSlash]++;
        }

        // Extract upper 4 bits for second validator in the byte
        validatorSlash = (uint8(currentVote[j]) >> 4) & 0x0F;
        if (validatorSlash > 0) {
          tallyMatrix[j * 2 + 1][validatorSlash]++;
        }
      }
    }

    // Prepare arrays to collect slash actions and track committees with slashes
    SlashAction[] memory actions = new SlashAction[](COMMITTEE_SIZE * ROUND_SIZE_IN_EPOCHS);
    uint256 actionCount = 0;
    committeesWithSlashes = new bool[](ROUND_SIZE_IN_EPOCHS);

    // Determine which validators reached quorum and should be slashed
    // For each validator in all committees across all epochs in this round
    for (uint256 i = 0; i < tallyMatrix.length; i++) {
      uint256 voteCountForValidator = 0;

      // Check slash amounts from highest (15 units) to lowest (1 unit)
      // Cumulative voting: a vote for N units counts as votes for N-1, N-2, ..., 1 units
      // This means if someone votes to slash 5 units, it also counts as votes for 1-4 units
      for (uint256 j = 15; j > 0; j--) {
        voteCountForValidator += tallyMatrix[i][j];

        // Check if this slash amount has reached quorum
        if (voteCountForValidator >= QUORUM) {
          // Quorum reached - calculate validator details and slash amount
          uint256 committeeIndex = i / COMMITTEE_SIZE; // Which epoch's committee
          uint256 validatorIndex = i % COMMITTEE_SIZE; // Position within committee
          address validator = _committees[committeeIndex][validatorIndex];
          uint256 slashAmount = SLASHING_UNIT * j; // Convert units to actual slash amount

          // Record the slashing action
          actions[actionCount] = SlashAction({validator: validator, slashAmount: slashAmount});
          actionCount++;

          // Mark this committee as having at least one slashed validator
          // This is used later to determine which committee commitments need verification
          committeesWithSlashes[committeeIndex] = true;

          // Only slash each validator once at the highest amount that reached quorum
          break;
        }
      }
    }

    // Resize actions array to the actual number of actions
    assembly {
      mstore(actions, actionCount)
    }

    return (actions, committeesWithSlashes);
  }

  /**
   * @notice Get the current slot number from the rollup contract
   * @dev Retrieves the current time-based slot number which determines the active round and proposer.
   * @return The current Slot number
   */
  function _getCurrentSlot() internal view returns (Slot) {
    IValidatorSelection rollup = IValidatorSelection(INSTANCE);
    return rollup.getCurrentSlot();
  }

  /**
   * @notice Check if a round is ready for execution based on timing constraints
   * @dev A round is ready for execution when:
   *      1. Enough time has passed (current round > round + execution delay)
   *      2. Not too much time has passed (current round <= round + lifetime)
   *      This ensures there's time for review before execution while preventing stale executions.
   *
   * @param _round The round number to check readiness for
   * @param _currentRound The current round number for comparison
   * @return True if the round is ready for execution, false otherwise
   */
  function _isRoundReadyToExecute(SlashRound _round, SlashRound _currentRound) internal view returns (bool) {
    // Round must have passed execution delay but not exceeded lifetime
    // This gives time for review before execution and prevents stale executions
    return SlashRound.unwrap(_currentRound) > SlashRound.unwrap(_round) + EXECUTION_DELAY_IN_ROUNDS
      && SlashRound.unwrap(_currentRound) <= SlashRound.unwrap(_round) + LIFETIME_IN_ROUNDS;
  }

  /**
   * @notice Internal function to prepare payload data and compute address from slash actions
   * @param _round The round number (mixed into the salt)
   * @param _actions Array of slash actions
   * @return validators Array of validator addresses
   * @return amounts Array of slash amounts as uint96
   * @return salt The computed salt for CREATE2 deployment
   * @return predictedAddress The predicted address where the payload would be deployed
   */
  function _preparePayloadDataAndAddress(SlashRound _round, SlashAction[] memory _actions)
    internal
    view
    returns (address[] memory validators, uint96[] memory amounts, bytes32 salt, address predictedAddress)
  {
    uint256 actionCount = _actions.length;
    validators = new address[](actionCount);
    amounts = new uint96[](actionCount);

    // Extract validators and amounts from actions
    for (uint256 i = 0; i < actionCount; i++) {
      validators[i] = _actions[i].validator;
      // Convert uint256 to uint96, checking for overflow
      require(_actions[i].slashAmount <= type(uint96).max, Errors.ConsensusSlashingProposer__SlashAmountTooLarge());
      amounts[i] = uint96(_actions[i].slashAmount);
    }

    // Compute salt for CREATE2 deployment, including round number
    salt = keccak256(abi.encodePacked(SlashRound.unwrap(_round), validators, amounts));

    // Compute predicted address using CREATE2
    bytes memory constructorArgs = abi.encode(validators, amounts, IValidatorSelection(INSTANCE));
    bytes32 creationCodeHash = keccak256(abi.encodePacked(type(SlashPayload).creationCode, constructorArgs));
    predictedAddress =
      address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, creationCodeHash)))));

    return (validators, amounts, salt, predictedAddress);
  }

  /**
   * @notice Returns a storage reference to the round votes for a specific round from the circular storage buffer
   * @dev Uses modulo arithmetic to map round numbers to storage slots in the circular buffer.
   *      IMPORTANT: This function DOES NOT validate that the round is within the valid range or that
   *      the data hasn't been overwritten by newer rounds. Always call getRoundData() first to ensure
   *      the round data is valid before using this function.
   *
   * @param _round The round number to get votes for
   * @return A storage reference to the RoundVotes struct containing the vote data for this round
   */
  function _getRoundVotes(SlashRound _round) internal view returns (RoundVotes storage) {
    // Map round number to circular storage index using modulo
    // This allows reuse of storage slots as older rounds become irrelevant
    return roundVotes[SlashRound.unwrap(_round) % ROUNDABOUT_SIZE];
  }

  /**
   * @notice Get round data for a specific round, loading from circular storage and decompressing it
   * @param _round The round number to retrieve data for
   * @param _currentRound The current round number, so we dont try loading data outside the valid roundabout range.
   * Required as a parameter to avoid having to recompute it on every call to this function.
   * @return RoundData struct containing the round's data
   */
  function _getRoundData(SlashRound _round, SlashRound _currentRound) internal view returns (RoundData memory) {
    // Check if the requested round is within the valid roundabout range
    if (
      SlashRound.unwrap(_round) > SlashRound.unwrap(_currentRound)
        || SlashRound.unwrap(_round) + ROUNDABOUT_SIZE <= SlashRound.unwrap(_currentRound)
    ) {
      revert Errors.ConsensusSlashingProposer__RoundOutOfRange((_round), (_currentRound));
    }

    // Load round data from the circular storage into memory in a single SLOAD
    CompressedRoundData memory roundData = roundDatas[SlashRound.unwrap(_round) % ROUNDABOUT_SIZE];

    // If we find in storage round data for an older round since we've gone around the roundabout, return an empty one
    if (roundData.roundNumber.decompress() != _round) {
      return RoundData({roundNumber: _round, lastVoteSlot: Slot.wrap(0), voteCount: 0, executed: false});
    }

    return RoundData({
      roundNumber: _round,
      lastVoteSlot: roundData.lastVoteSlot.decompress(),
      voteCount: roundData.voteCount,
      executed: roundData.executed
    });
  }

  /**
   * @notice Computes the round at the given slot
   * @param _slot - The slot to compute round for
   * @return The round number
   */
  function _computeRound(Slot _slot) internal view returns (SlashRound) {
    return SlashRound.wrap(Slot.unwrap(_slot) / ROUND_SIZE);
  }

  /**
   * @notice Reconstruct committee commitment from addresses
   */
  function _computeCommitteeCommitment(address[] calldata _committee) internal pure returns (bytes32) {
    // Hash the committee addresses to create a commitment for verification
    // Duplicated from ValidatorSelectionLib.sol
    return keccak256(abi.encode(_committee));
  }
}
