// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
// solhint-disable comprehensive-interface
pragma solidity >=0.8.27;

import {ISlasher, SlasherFlavor} from "@aztec/core/interfaces/ISlasher.sol";
import {IValidatorSelection} from "@aztec/core/interfaces/IValidatorSelection.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {SlashPayloadLib} from "@aztec/core/libraries/SlashPayloadLib.sol";
import {SlashRound, CompressedSlashRound, CompressedSlashRoundMath} from "@aztec/core/libraries/SlashRoundLib.sol";
import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {SlashPayloadCloneable} from "@aztec/periphery/SlashPayloadCloneable.sol";
import {CompressedSlot, CompressedTimeMath} from "@aztec/shared/libraries/CompressedTimeMath.sol";
import {SignatureLib, Signature} from "@aztec/shared/libraries/SignatureLib.sol";
import {Slot, Epoch} from "@aztec/shared/libraries/TimeMath.sol";
import {Clones} from "@oz/proxy/Clones.sol";
import {EIP712} from "@oz/utils/cryptography/EIP712.sol";
import {SafeCast} from "@oz/utils/math/SafeCast.sol";

/**
 * @title TallySlashingProposer
 * @author Aztec Labs
 * @notice Tally-based slashing proposer that aggregates validator votes to determine which validators should be
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
 *      3. Votes are encoded as bytes where each 2-bit pair represents the slash amount (0-3 slash units) for
 *         the corresponding validator slashed in the round.
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
 *      - Committee commitments are verified against onchain data
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
 *      - SLASH_AMOUNT_SMALL/MEDIUM/LARGE: Specific amounts for each slash unit level
 *      - COMMITTEE_SIZE: Number of validators per committee
 */
contract TallySlashingProposer is EIP712 {
  using SignatureLib for Signature;
  using CompressedTimeMath for CompressedSlot;
  using CompressedTimeMath for Slot;
  using CompressedSlashRoundMath for CompressedSlashRound;
  using CompressedSlashRoundMath for SlashRound;
  using Clones for address;
  using SlashPayloadLib for address[];

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
   * @dev Stores up to MAX_ROUND_SIZE votes as fixed-size arrays. Each vote encodes slash amounts
   *      for all validators in the round using 2 bits per validator.
   * @param votes Array of encoded vote data, one entry per proposer vote in the round
   *         Each vote is stored as fixed-size bytes32 chunks, to avoid the overhead of an extra SLOAD/SSTORE operation
   *         just to load/write the length of the array, which we already know.
   *         Vote size = COMMITTEE_SIZE * ROUND_SIZE_IN_EPOCHS / 4 bytes
   *         Number of bytes32 slots needed = ceil(voteSize / 32)
   *         Note that we check the vote size in the constructor to avoid issues
   */
  struct RoundVotes {
    bytes32[4][1024] votes; // Assuming max 4 slots (128 bytes) per vote
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
  bytes32 public constant VOTE_TYPEHASH = keccak256("Vote(bytes votes,uint256 slot)");

  /**
   * @notice Type of slashing proposer (either Tally or Empire)
   */
  SlasherFlavor public constant SLASHING_PROPOSER_TYPE = SlasherFlavor.TALLY;

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
   * @notice The implementation contract for SlashPayload clones
   * @dev Single instance deployed once and used as template for all slash payload clones
   */
  address public immutable SLASH_PAYLOAD_IMPLEMENTATION;

  /**
   * @notice Base amount of stake to slash per slashing unit (in wei)
   * @dev Validators can be voted to be slashed by 1-3 units, multiplied by this base amount
   * @notice Small slash amount for 1 unit votes (in wei)
   */
  uint256 public immutable SLASH_AMOUNT_SMALL;

  /**
   * @notice Medium slash amount for 2 unit votes (in wei)
   */
  uint256 public immutable SLASH_AMOUNT_MEDIUM;

  /**
   * @notice Large slash amount for 3 unit votes (in wei)
   */
  uint256 public immutable SLASH_AMOUNT_LARGE;

  /**
   * @notice Minimum number of votes required to slash a validator
   * @dev Must be greater than ROUND_SIZE/2 to ensure majority agreement
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
   * @notice Initializes the TallySlashingProposer with configuration parameters
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
   * @param _slashAmounts Array of 3 slash amounts [small, medium, large] for 1, 2, 3 unit votes (all must be > 0)
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
    uint256[3] memory _slashAmounts,
    uint256 _committeeSize,
    uint256 _epochDuration,
    uint256 _slashOffsetInRounds
  ) EIP712("TallySlashingProposer", "1") {
    INSTANCE = _instance;
    SLASHER = _slasher;
    SLASH_AMOUNT_SMALL = _slashAmounts[0];
    SLASH_AMOUNT_MEDIUM = _slashAmounts[1];
    SLASH_AMOUNT_LARGE = _slashAmounts[2];
    QUORUM = _quorum;
    ROUND_SIZE = _roundSize;
    ROUND_SIZE_IN_EPOCHS = _roundSize / _epochDuration;
    COMMITTEE_SIZE = _committeeSize;
    LIFETIME_IN_ROUNDS = _lifetimeInRounds;
    EXECUTION_DELAY_IN_ROUNDS = _executionDelayInRounds;
    SLASH_OFFSET_IN_ROUNDS = _slashOffsetInRounds;

    // Deploy the SlashPayloadCloneable implementation contract once
    SLASH_PAYLOAD_IMPLEMENTATION = address(new SlashPayloadCloneable{salt: bytes32(bytes20(uint160(address(this))))}());

    require(
      SLASH_OFFSET_IN_ROUNDS > 0, Errors.TallySlashingProposer__SlashOffsetMustBeGreaterThanZero(SLASH_OFFSET_IN_ROUNDS)
    );
    require(
      ROUND_SIZE_IN_EPOCHS * _epochDuration == ROUND_SIZE,
      Errors.TallySlashingProposer__RoundSizeMustBeMultipleOfEpochDuration(ROUND_SIZE, _epochDuration)
    );
    require(QUORUM > 0, Errors.TallySlashingProposer__QuorumMustBeGreaterThanZero());
    require(ROUND_SIZE > 1, Errors.TallySlashingProposer__InvalidQuorumAndRoundSize(QUORUM, ROUND_SIZE));
    require(QUORUM > ROUND_SIZE / 2, Errors.TallySlashingProposer__InvalidQuorumAndRoundSize(QUORUM, ROUND_SIZE));
    require(QUORUM <= ROUND_SIZE, Errors.TallySlashingProposer__InvalidQuorumAndRoundSize(QUORUM, ROUND_SIZE));
    require(_slashAmounts[0] <= _slashAmounts[1], Errors.TallySlashingProposer__InvalidSlashAmounts(_slashAmounts));
    require(_slashAmounts[1] <= _slashAmounts[2], Errors.TallySlashingProposer__InvalidSlashAmounts(_slashAmounts));
    require(
      LIFETIME_IN_ROUNDS > EXECUTION_DELAY_IN_ROUNDS,
      Errors.TallySlashingProposer__LifetimeMustBeGreaterThanExecutionDelay(
        LIFETIME_IN_ROUNDS, EXECUTION_DELAY_IN_ROUNDS
      )
    );
    require(
      LIFETIME_IN_ROUNDS < ROUNDABOUT_SIZE,
      Errors.TallySlashingProposer__LifetimeMustBeLessThanRoundabout(LIFETIME_IN_ROUNDS, ROUNDABOUT_SIZE)
    );
    require(
      ROUND_SIZE_IN_EPOCHS > 0,
      Errors.TallySlashingProposer__RoundSizeInEpochsMustBeGreaterThanZero(ROUND_SIZE_IN_EPOCHS)
    );
    require(ROUND_SIZE < MAX_ROUND_SIZE, Errors.TallySlashingProposer__RoundSizeTooLarge(ROUND_SIZE, MAX_ROUND_SIZE));
    require(COMMITTEE_SIZE > 0, Errors.TallySlashingProposer__CommitteeSizeMustBeGreaterThanZero(COMMITTEE_SIZE));

    // Validate that vote size doesn't exceed our fixed 4 bytes32 allocation
    // Each vote requires COMMITTEE_SIZE * ROUND_SIZE_IN_EPOCHS / 4 bytes
    // We have allocated 4 bytes32 slots = 128 bytes maximum
    uint256 voteSize = COMMITTEE_SIZE * ROUND_SIZE_IN_EPOCHS / 4;
    require(voteSize <= 128, Errors.TallySlashingProposer__VoteSizeTooBig(voteSize, 128));

    require(
      COMMITTEE_SIZE * ROUND_SIZE_IN_EPOCHS % 4 == 0,
      Errors.TallySlashingProposer__VotesMustBeMultipleOf4(COMMITTEE_SIZE * ROUND_SIZE_IN_EPOCHS)
    );
  }

  /**
   * @notice Submit a vote for slashing validators from SLASH_OFFSET_IN_ROUNDS rounds ago
   * @dev Only the current block proposer can submit votes, enforced via EIP-712 signature verification.
   *      Each byte in the votes encodes slash amounts for 4 validators using 2 bits each (0-3 units each).
   *      The vote includes the current slot number to prevent replay attacks.
   *
   * @param _votes Encoded voting data where each byte represents slash amounts for 4 validators.
   *               Bits 0-1 for first validator, bits 2-3 for second, bits 4-5 for third, bits 6-7 for fourth.
   *               Length must equal (COMMITTEE_SIZE * ROUND_SIZE_IN_EPOCHS) / 4 bytes.
   * @param _sig EIP-712 signature from the current proposer proving authorization to vote.
   *             Signature covers the vote data and current slot number.
   *
   * Emits:
   * - VoteCast: When the vote is successfully recorded
   *
   * Reverts with:
   * - TallySlashingProposer__VotingNotOpen: If current round is less than SLASH_OFFSET_IN_ROUNDS
   * - TallySlashingProposer__InvalidSignature: If signature verification fails
   * - TallySlashingProposer__InvalidVoteLength: If vote data length is incorrect
   * - TallySlashingProposer__VoteAlreadyCastInCurrentSlot: If proposer already voted in this slot
   */
  function vote(bytes calldata _votes, Signature calldata _sig) external {
    Slot slot = _getCurrentSlot();
    SlashRound round = _computeRound(slot);

    // We vote for slashing validators for epochs from SLASH_OFFSET_IN_ROUNDS ago, so in early rounds there is no one to
    // be slashed.
    require(round >= SlashRound.wrap(SLASH_OFFSET_IN_ROUNDS), Errors.TallySlashingProposer__VotingNotOpen(round));

    // Get the current proposer from the rollup - only they can submit votes
    address proposer = _getCurrentProposer();

    // Verify EIP-712 signature (which includes slot to prevent replay attacks)
    bytes32 digest = getVoteSignatureDigest(_votes, slot);
    require(_sig.verify(proposer, digest), Errors.TallySlashingProposer__InvalidSignature());

    // Each byte encodes 4 validators (2 bits each), so each validator is represented as 2 bits in the byte array.
    uint256 expectedLength = COMMITTEE_SIZE * ROUND_SIZE_IN_EPOCHS / 4;
    require(
      _votes.length == expectedLength, Errors.TallySlashingProposer__InvalidVoteLength(expectedLength, _votes.length)
    );

    // Get the round data for the current round
    RoundData memory roundData = _getRoundData(round, round);

    // Check if a vote has already been cast in the current slot
    require(roundData.lastVoteSlot < slot, Errors.TallySlashingProposer__VoteAlreadyCastInCurrentSlot(slot));

    // Store the vote for this round
    uint256 voteCount = roundData.voteCount;
    _storeVoteData(round, voteCount, _votes);

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
   *                   validators will have their commitments verified against onchain data.
   *
   * Emits:
   * - RoundExecuted: When the round execution completes, regardless of whether any slashing occurred
   *
   * Reverts with:
   * - TallySlashingProposer__RoundAlreadyExecuted: If the round has already been executed
   * - TallySlashingProposer__RoundNotComplete: If the round is not yet ready for execution or has expired
   * - TallySlashingProposer__InvalidCommitteeCommitment: If any committee commitment doesn't match onchain data
   * - TallySlashingProposer__InvalidNumberOfCommittees: If the number of committees doesn't match
   * ROUND_SIZE_IN_EPOCHS
   */
  function executeRound(SlashRound _round, address[][] calldata _committees) external {
    // Get round data to check if already executed
    SlashRound currentRound = getCurrentRound();
    RoundData memory roundData = _getRoundData(_round, currentRound);
    require(!roundData.executed, Errors.TallySlashingProposer__RoundAlreadyExecuted(_round));

    // Ensure enough time has passed (execution delay) but not too much (lifetime)
    require(_isRoundReadyToExecute(_round, currentRound), Errors.TallySlashingProposer__RoundNotComplete(_round));

    // Get the slash actions by tallying votes and which committees have slashes
    (SlashAction[] memory actions, bool[] memory committeesWithSlashes) = _tally(roundData, _committees);

    // Only verify committees that have slashed validators
    unchecked {
      uint256 length = committeesWithSlashes.length;
      for (uint256 i; i < length; ++i) {
        if (!committeesWithSlashes[i]) {
          continue;
        }

        // Check committee commitments against the stored onchain data
        bytes32 commitment = _computeCommitteeCommitment(_committees[i]);
        Epoch epochNumber = getSlashTargetEpoch(_round, i);
        require(
          commitment == _getCommitteeCommitment(epochNumber), Errors.TallySlashingProposer__InvalidCommitteeCommitment()
        );
      }
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
   * @notice Load committees for all epochs to be potentially slashed in a round from the rollup instance
   * @dev This is an expensive call. It is not marked as view since `getEpochCommittee` may modify rollup state.
   *      If `getEpochCommittee` throws (eg committee not yet formed), an empty committee is returned for that epoch.
   * @param _round The round number to load committees for
   * @return committees Array of committees, one for each epoch in the round (may contain empty arrays for early epochs)
   */
  function getSlashTargetCommittees(SlashRound _round) external returns (address[][] memory committees) {
    committees = new address[][](ROUND_SIZE_IN_EPOCHS);

    IValidatorSelection rollup = IValidatorSelection(INSTANCE);
    unchecked {
      for (uint256 epochIndex; epochIndex < ROUND_SIZE_IN_EPOCHS; ++epochIndex) {
        Epoch epoch = getSlashTargetEpoch(_round, epochIndex);
        try rollup.getEpochCommittee(epoch) returns (address[] memory committee) {
          committees[epochIndex] = committee;
        } catch {
          committees[epochIndex] = new address[](0);
        }
      }
    }

    return committees;
  }

  /**
   * @notice Get the tally results for a specific round, showing which validators would be slashed
   * @dev This function is intended for offchain querying and analysis of voting results.
   *      It uses transient storage when calling getEpochCommittee on the rollup contract.
   *      Returns the same slash actions that would be executed if executeRound() were called for this round.
   *
   * @param _round The round number to analyze and return tally results for
   * @param _committees The list of committees to consider for the tally (get them via `getSlashTargetCommittees`)
   * @return actions Array of SlashAction structs containing validator addresses and slash amounts
   *                for all validators that reached the quorum threshold in this round
   */
  function getTally(SlashRound _round, address[][] calldata _committees) external view returns (SlashAction[] memory) {
    // Get the round data for the specified round
    RoundData memory roundData = _getRoundData(_round, getCurrentRound());

    // Tally votes and return slash actions
    (SlashAction[] memory actions,) = _tally(roundData, _committees);
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
   * @notice Get the votes for a specific `_round` at a specific `_index`
   * @param _round The round number to retrieve votes for
   * @param _index The index to retrieve votes for
   * @return The votes retrieved
   */
  function getVotes(SlashRound _round, uint256 _index) external view returns (bytes memory) {
    uint256 expectedLength = COMMITTEE_SIZE * ROUND_SIZE_IN_EPOCHS / 4;
    bytes32[4] storage voteSlots = _getRoundVotes(_round).votes[_index];
    return _loadVoteDataFromStorage(voteSlots, expectedLength);
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
   * - TallySlashingProposer__VotingNotOpen: If the round is less than SLASH_OFFSET_IN_ROUNDS
   */
  function getSlashTargetEpoch(SlashRound _round, uint256 _epochIndex) public view returns (Epoch epochNumber) {
    require(_round >= SlashRound.wrap(SLASH_OFFSET_IN_ROUNDS), Errors.TallySlashingProposer__VotingNotOpen(_round));
    require(
      _epochIndex < ROUND_SIZE_IN_EPOCHS,
      Errors.TallySlashingProposer__InvalidEpochIndex(_epochIndex, ROUND_SIZE_IN_EPOCHS)
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

    // Deploy clone of SlashPayload using EIP-1167 minimal proxy with immutable args
    // Encode the immutable arguments for the clone
    bytes memory immutableArgs = SlashPayloadLib.encodeImmutableArgs(INSTANCE, validators, amounts);

    // Deploy the clone with deterministic address
    address clone = Clones.cloneDeterministicWithImmutableArgs(SLASH_PAYLOAD_IMPLEMENTATION, immutableArgs, salt);

    return IPayload(clone);
  }

  /**
   * @notice Store vote data in fixed-size format
   * @param roundNumber The round to store the vote for
   * @param voteIndex The index of the vote within the round
   * @param voteData The vote data to store
   */
  function _storeVoteData(SlashRound roundNumber, uint256 voteIndex, bytes calldata voteData) internal {
    bytes32[4] storage voteSlots = _getRoundVotes(roundNumber).votes[voteIndex];
    uint256 dataLength = voteData.length;

    // Ensure we don't exceed maximum size
    require(dataLength <= 128, Errors.TallySlashingProposer__VoteSizeTooBig(dataLength, 128));

    unchecked {
      assembly {
        let offset := voteData.offset

        // Store chunk 0 (bytes 0-31)
        if dataLength {
          let chunk := calldataload(offset)
          // For partial chunks, we need to keep data left-aligned in the slot
          // No masking needed since unused bytes are already zero in calldata
          sstore(voteSlots.slot, chunk)
        }

        // Store chunk 1 (bytes 32-63)
        if gt(dataLength, 32) {
          let chunk := calldataload(add(offset, 32))
          sstore(add(voteSlots.slot, 1), chunk)
        }

        // Store chunk 2 (bytes 64-95)
        if gt(dataLength, 64) {
          let chunk := calldataload(add(offset, 64))
          sstore(add(voteSlots.slot, 2), chunk)
        }

        // Store chunk 3 (bytes 96-127)
        if gt(dataLength, 96) {
          let chunk := calldataload(add(offset, 96))
          sstore(add(voteSlots.slot, 3), chunk)
        }
      }
    }
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
  function _tally(RoundData memory _roundData, address[][] calldata _committees)
    internal
    view
    returns (SlashAction[] memory slashActions, bool[] memory committeesWithSlashes)
  {
    // Must have one committee per epoch in the round
    require(
      _committees.length == ROUND_SIZE_IN_EPOCHS,
      Errors.TallySlashingProposer__InvalidNumberOfCommittees(ROUND_SIZE_IN_EPOCHS, _committees.length)
    );

    uint256 voteCount = _roundData.voteCount;

    // No votes cast, return empty array
    if (voteCount == 0) {
      return (new SlashAction[](0), new bool[](ROUND_SIZE_IN_EPOCHS));
    }

    // Pre-calculate total validators to optimize memory allocation
    uint256 totalValidators = COMMITTEE_SIZE * ROUND_SIZE_IN_EPOCHS;

    // Create a voting tally array where each uint256 packs all vote counts for a validator
    // Layout: [0-63: votes for 1 unit][64-127: votes for 2 units][128-191: votes for 3 units][192-255: unused]
    // Each 64-bit segment can store up to 2^64-1 votes
    // Overflow protection: With MAX_ROUND_SIZE=1024, maximum possible votes per validator is 1024,
    // which is well below 2^64-1, preventing any overflow in the packed counters
    uint256[] memory tallyMatrix = new uint256[](totalValidators);

    // Process all votes cast during this round to populate the tally matrix
    _processVotes(_roundData, tallyMatrix, voteCount);

    // Determine which validators reached quorum and return slash actions
    return _determineSlashActions(tallyMatrix, _committees, totalValidators);
  }

  /**
   * @notice Process all votes and populate the tally matrix
   */
  function _processVotes(RoundData memory _roundData, uint256[] memory tallyMatrix, uint256 voteCount) internal view {
    SlashRound roundNumber = _roundData.roundNumber;
    uint256 voteLength = COMMITTEE_SIZE * ROUND_SIZE_IN_EPOCHS / 4;

    // Cache the RoundVotes storage reference to avoid repeated calls
    RoundVotes storage targetRoundVotes = _getRoundVotes(roundNumber);

    unchecked {
      for (uint256 i; i < voteCount; ++i) {
        // Load the i-th votes from this round from storage into memory
        bytes memory currentVote = _loadVoteDataFromStorage(targetRoundVotes.votes[i], voteLength);

        // Process votes 32 bytes at a time
        uint256 j;
        for (; j + 31 < voteLength; j += 32) {
          // Process 32 bytes at once (128 validators)
          _process32BytesVotes(tallyMatrix, currentVote, j);
        }

        // Process remaining bytes one at a time (inlined)
        for (; j < voteLength; ++j) {
          uint256 baseIndex = j << 2; // j * 4 using bit shift
          uint8 currentByte;

          assembly {
            currentByte := byte(0, mload(add(add(currentVote, 0x20), j)))
          }

          // Next byte if this one is empty
          if (currentByte == 0) continue;

          // Extract 2 bits for each of the 4 validators in this byte,
          // and increment vote count for the given slash amount
          // Extract validator 0 vote: bits 0-1 (mask with 0x03 = 0b00000011)
          uint8 validatorSlash0 = currentByte & 0x03;
          if (validatorSlash0 != 0) {
            // Increment vote count at position (slashAmount-1) * 64 bits in packed uint256
            // Layout: [0-63: votes for 1 unit][64-127: votes for 2 units][128-191: votes for 3 units]
            tallyMatrix[baseIndex] += uint256(1) << ((validatorSlash0 - 1) << 6);
          }

          // Extract validator 1 vote: bits 2-3 (shift right 2, then mask with 0x03)
          uint8 validatorSlash1 = (currentByte >> 2) & 0x03;
          if (validatorSlash1 != 0) {
            tallyMatrix[baseIndex + 1] += uint256(1) << ((validatorSlash1 - 1) << 6);
          }

          // Extract validator 2 vote: bits 4-5 (shift right 4, then mask with 0x03)
          uint8 validatorSlash2 = (currentByte >> 4) & 0x03;
          if (validatorSlash2 != 0) {
            tallyMatrix[baseIndex + 2] += uint256(1) << ((validatorSlash2 - 1) << 6);
          }

          // Extract validator 3 vote: bits 6-7 (shift right 6, no mask needed as top 2 bits)
          uint8 validatorSlash3 = currentByte >> 6;
          if (validatorSlash3 != 0) {
            tallyMatrix[baseIndex + 3] += uint256(1) << ((validatorSlash3 - 1) << 6);
          }
        }
      }
    }
  }

  /**
   * @notice Determine which validators reached quorum and should be slashed
   */
  function _determineSlashActions(
    uint256[] memory tallyMatrix,
    address[][] calldata _committees,
    uint256 totalValidators
  ) internal view returns (SlashAction[] memory actions, bool[] memory committeesWithSlashes) {
    actions = new SlashAction[](totalValidators);
    uint256 actionCount;
    committeesWithSlashes = new bool[](ROUND_SIZE_IN_EPOCHS);

    unchecked {
      for (uint256 i; i < totalValidators; ++i) {
        uint256 packedVotes = tallyMatrix[i];

        // Skip if no votes for this validator
        if (packedVotes == 0) continue;

        uint256 voteCountForValidator;

        // Check slash amounts from highest (3 units) to lowest (1 unit)
        // Cumulative voting: votes for N units also count for N-1, N-2, etc.
        for (uint256 j = 3; j > 0;) {
          // Extract vote count for this slash amount from packed data
          // Shift right by (slashAmount-1) * 64 bits, then mask to get 64-bit segment
          // Layout: [0-63: votes for 1 unit][64-127: votes for 2 units][128-191: votes for 3 units]
          uint256 votesForAmount = (packedVotes >> ((j - 1) << 6)) & 0xFFFFFFFFFFFFFFFF;
          voteCountForValidator += votesForAmount;

          // Check if this slash amount has reached quorum
          if (voteCountForValidator >= QUORUM) {
            // Convert units to actual slash amount
            uint256 slashAmount;
            if (j == 1) {
              slashAmount = SLASH_AMOUNT_SMALL;
            } else if (j == 2) {
              slashAmount = SLASH_AMOUNT_MEDIUM;
            } else if (j == 3) {
              slashAmount = SLASH_AMOUNT_LARGE;
            }

            // Record the slashing action
            actions[actionCount] =
              SlashAction({validator: _committees[i / COMMITTEE_SIZE][i % COMMITTEE_SIZE], slashAmount: slashAmount});
            ++actionCount;

            // Mark this committee as having at least one slashed validator
            committeesWithSlashes[i / COMMITTEE_SIZE] = true;

            // Only slash each validator once at the highest amount that reached quorum
            break;
          }

          --j;
        }
      }
    }

    // Resize actions array to the actual number of actions using assembly
    assembly {
      mstore(actions, actionCount)
    }

    return (actions, committeesWithSlashes);
  }

  /**
   * @notice Load vote data from fixed-size format (optimized with unrolled loop)
   * @param voteSlots The storage reference to the vote slots
   * @param expectedLength The expected length of the vote data
   * @return voteData The reconstructed vote data as bytes
   */
  function _loadVoteDataFromStorage(bytes32[4] storage voteSlots, uint256 expectedLength)
    internal
    view
    returns (bytes memory voteData)
  {
    // Allocate memory for full chunks
    // This avoids complex masking by over-allocating slightly
    voteData = new bytes(4 * 32);

    unchecked {
      // Load full chunks without masking
      assembly {
        let dataPtr := add(voteData, 0x20)

        // Chunk 0 (bytes 0-31)
        if expectedLength {
          let chunk := sload(voteSlots.slot)
          mstore(dataPtr, chunk)
        }

        // Chunk 1 (bytes 32-63)
        if gt(expectedLength, 32) {
          let chunk := sload(add(voteSlots.slot, 1))
          mstore(add(dataPtr, 32), chunk)
        }

        // Chunk 2 (bytes 64-95)
        if gt(expectedLength, 64) {
          let chunk := sload(add(voteSlots.slot, 2))
          mstore(add(dataPtr, 64), chunk)
        }

        // Chunk 3 (bytes 96-127)
        if gt(expectedLength, 96) {
          let chunk := sload(add(voteSlots.slot, 3))
          mstore(add(dataPtr, 96), chunk)
        }

        // Adjust the array length to the expected length
        // This ensures the bytes array reports the correct length
        // even though we allocated extra memory
        mstore(voteData, expectedLength)
      }
    }
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
    unchecked {
      for (uint256 i; i < actionCount; ++i) {
        validators[i] = _actions[i].validator;
        // Convert uint256 to uint96, checking for overflow
        require(_actions[i].slashAmount <= type(uint96).max, Errors.TallySlashingProposer__SlashAmountTooLarge());
        amounts[i] = uint96(_actions[i].slashAmount);
      }
    }

    // Compute salt for CREATE2 deployment, including round number
    salt = keccak256(abi.encodePacked(SlashRound.unwrap(_round), validators, amounts));

    // Compute predicted address using clone deterministic address prediction
    bytes memory immutableArgs = SlashPayloadLib.encodeImmutableArgs(INSTANCE, validators, amounts);
    predictedAddress = Clones.predictDeterministicAddressWithImmutableArgs(
      SLASH_PAYLOAD_IMPLEMENTATION, immutableArgs, salt, address(this)
    );

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
      revert Errors.TallySlashingProposer__RoundOutOfRange((_round), (_currentRound));
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
   * @notice Process 32 bytes of vote data at once
   * @dev Processes a full word for maximum efficiency with early exit for zero words
   */
  function _process32BytesVotes(uint256[] memory tallyMatrix, bytes memory currentVote, uint256 startJ) internal pure {
    unchecked {
      // Load 32 bytes as a single word
      uint256 word;
      assembly {
        word := mload(add(add(currentVote, 0x20), startJ))
      }

      // Early exit if entire word is zero (no votes)
      if (word == 0) return;

      // Process the 32-byte word byte by byte, maintaining big-endian order
      uint256 baseIndex = startJ << 2; // Convert byte index to validator index: startJ * 4

      for (uint256 i; i < 32; ++i) {
        // Early exit if remaining word is zero
        if (word == 0) break;

        // Extract most significant byte from word (big-endian order)
        // Shift right 248 bits (31 bytes) to get the leftmost byte
        uint8 currentByte = uint8(word >> 248);

        // Shift word left by 8 bits for next iteration, removing processed byte
        word <<= 8;

        if (currentByte != 0) {
          uint256 idx = baseIndex + (i << 2); // Convert byte index to validator index: baseIndex + i * 4

          // Extract validator 0 vote: bits 0-1 (mask with 0x03 = 0b00000011)
          uint8 v0 = currentByte & 0x03;
          if (v0 != 0) tallyMatrix[idx] += uint256(1) << ((v0 - 1) << 6);

          // Extract validator 1 vote: bits 2-3 (shift right 2, then mask with 0x03)
          uint8 v1 = (currentByte >> 2) & 0x03;
          if (v1 != 0) tallyMatrix[idx + 1] += uint256(1) << ((v1 - 1) << 6);

          // Extract validator 2 vote: bits 4-5 (shift right 4, then mask with 0x03)
          uint8 v2 = (currentByte >> 4) & 0x03;
          if (v2 != 0) tallyMatrix[idx + 2] += uint256(1) << ((v2 - 1) << 6);

          // Extract validator 3 vote: bits 6-7 (shift right 6, no mask needed)
          uint8 v3 = currentByte >> 6;
          if (v3 != 0) tallyMatrix[idx + 3] += uint256(1) << ((v3 - 1) << 6);
        }
      }
    }
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
