// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {SafeCast} from "@oz/utils/math/SafeCast.sol";
import {ISlasher} from "@aztec/core/interfaces/ISlasher.sol";
import {IEmperor} from "@aztec/governance/interfaces/IEmpire.sol";
import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {SignatureLib, Signature} from "@aztec/shared/libraries/SignatureLib.sol";
import {Slot, Timestamp, Epoch, SlashRound} from "@aztec/shared/libraries/TimeMath.sol";
import {
  CompressedSlot, CompressedSlashRound, CompressedTimeMath
} from "@aztec/shared/libraries/CompressedTimeMath.sol";
import {TimeLib} from "@aztec/core/libraries/TimeLib.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {IValidatorSelection} from "@aztec/core/interfaces/IValidatorSelection.sol";
import {SlashPayload} from "@aztec/periphery/SlashPayload.sol";

/**
 * @notice A SlashingProposer implementation based on consensus voting
 */
contract ConsensusSlashingProposer {
  using SignatureLib for Signature;
  using TimeLib for Slot;
  using TimeLib for Epoch;
  using TimeLib for SlashRound;
  using CompressedTimeMath for CompressedSlot;
  using CompressedTimeMath for CompressedSlashRound;
  using CompressedTimeMath for Slot;
  using CompressedTimeMath for SlashRound;

  struct RoundData {
    SlashRound roundNumber; // The actual round number (for staleness check)
    uint256 voteCount; // Number of votes collected so far
    Slot lastVoteSlot; // Last slot for which a vote was received
    bool executed; // Whether this round has been executed
  }

  struct CompressedRoundData {
    CompressedSlashRound roundNumber;
    CompressedSlot lastVoteSlot;
    uint16 voteCount; // Must fit MAX_ROUND_SIZE
    bool executed;
  }

  struct RoundVotes {
    // TODO: Replace with a bytes32[1024/32]
    bytes[1024] votes;
  }

  // Size of the circular storage buffer (rounds to keep in memory)
  uint256 constant ROUNDABOUT_SIZE = 128;

  // Hard cap on the number of votes (or slots) per round
  uint256 constant MAX_ROUND_SIZE = 1024;

  // Circular mappings of round number to round data and votes
  CompressedRoundData[ROUNDABOUT_SIZE] private roundDatas;
  RoundVotes[ROUNDABOUT_SIZE] private roundVotes;

  struct SlashAction {
    address validator;
    uint256 slashAmount;
  }

  address public immutable INSTANCE;
  ISlasher public immutable SLASHER;

  uint256 public immutable SLASHING_UNIT;
  uint256 public immutable QUORUM;
  uint256 public immutable ROUND_SIZE;
  uint256 public immutable COMMITTEE_SIZE;
  uint256 public immutable ROUND_SIZE_IN_EPOCHS;
  uint256 public immutable LIFETIME_IN_ROUNDS;
  uint256 public immutable EXECUTION_DELAY_IN_ROUNDS;

  event VoteCast(SlashRound indexed round, address indexed proposer);
  event RoundExecuted(SlashRound indexed round, uint256 slashCount);

  constructor(
    address _instance,
    ISlasher _slasher,
    uint256 _slashingUnit,
    uint256 _quorum,
    uint256 _roundSize,
    uint256 _committeeSize,
    uint256 _roundSizeInEpochs,
    uint256 _lifetimeInRounds,
    uint256 _executionDelayInRounds
  ) {
    INSTANCE = _instance;
    SLASHER = _slasher;
    SLASHING_UNIT = _slashingUnit;
    QUORUM = _quorum;
    ROUND_SIZE = _roundSize;
    ROUND_SIZE_IN_EPOCHS = _roundSizeInEpochs;
    COMMITTEE_SIZE = _committeeSize;
    LIFETIME_IN_ROUNDS = _lifetimeInRounds;
    EXECUTION_DELAY_IN_ROUNDS = _executionDelayInRounds;

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
   * @notice Vote for slashing proposals
   * @param _votes The encoded votes for slashing
   * @param _sig Signature from the current proposer
   */
  function vote(bytes calldata _votes, Signature calldata _sig) external {
    Slot slot = getCurrentSlot();
    SlashRound round = computeRound(slot);

    // Get the current proposer from the rollup - only they can submit votes
    address proposer = getCurrentProposer();

    // Verify signature includes slot to prevent replay attacks across slots and rounds
    // The proposer must sign the specific combination of slot + votes
    bytes32 voteHash = keccak256(abi.encodePacked(Slot.unwrap(slot), _votes));
    require(_sig.verify(proposer, voteHash), Errors.ConsensusSlashingProposer__InvalidSignature());

    // Each byte encodes 2 validators (4 bits each), so we need half the total validators in bytes
    uint256 expectedLength = COMMITTEE_SIZE * ROUND_SIZE_IN_EPOCHS / 2;
    require(
      _votes.length == expectedLength,
      Errors.ConsensusSlashingProposer__InvalidVoteLength(expectedLength, _votes.length)
    );

    // Get the round data for the current round
    RoundData memory roundData = getRoundData(round, round);

    // Check if a vote has already been cast in the current slot
    require(roundData.lastVoteSlot < slot, Errors.ConsensusSlashingProposer__VoteAlreadyCastInCurrentSlot(slot));

    // Store the vote for this round and update round data
    uint256 voteCount = roundData.voteCount;
    getRoundVotes(round).votes[voteCount] = _votes;
    setRoundData(round, slot, voteCount + 1, roundData.executed);

    emit VoteCast(round, proposer);
  }

  /**
   * @notice Execute the slashing round by tallying votes and executing slashes
   * @param _round The round number to execute
   * @param _committees The committees for each epoch in the round (used to minimize storage loads)
   */
  function executeRound(SlashRound _round, address[][] calldata _committees) external {
    // Get round data to check if already executed
    SlashRound currentRound = getCurrentRound();
    RoundData memory roundData = getRoundData(_round, currentRound);
    require(!roundData.executed, Errors.ConsensusSlashingProposer__RoundAlreadyExecuted(_round));

    // Ensure enough time has passed (execution delay) but not too much (lifetime)
    require(isRoundReadyToExecute(_round, currentRound), Errors.ConsensusSlashingProposer__RoundNotComplete(_round));

    // Get the slash actions by tallying votes and which committees have slashes
    (SlashAction[] memory actions, bool[] memory committeesWithSlashes) = tally(roundData, _committees);

    // Only verify committees that have slashed validators
    for (uint256 i = 0; i < committeesWithSlashes.length; i++) {
      if (!committeesWithSlashes[i]) {
        continue;
      }
      // Check committee commitments against the stored on-chain data
      bytes32 commitment = computeCommitteeCommitment(_committees[i]);
      require(
        commitment == getCommitteeCommitment(_round, i), Errors.ConsensusSlashingProposer__InvalidCommitteeCommitment()
      );
    }

    // Execute slashes if any were determined
    if (actions.length > 0) {
      // Deploy payload contract and execute slashes
      IPayload slashPayload = deploySlashPayload(_round, actions);
      SLASHER.slash(slashPayload);
    }

    // Mark round as executed to prevent re-execution
    setRoundData(_round, roundData.lastVoteSlot, roundData.voteCount, true);
    emit RoundExecuted(_round, actions.length);
  }

  /**
   * @notice Get the tally for a specific round
   * @dev Expected to be called off-chain as if it were a view function, but it uses transient storage when calling
   * `getEpochCommittee` on the rollup contract.
   * @param _round The round number to get the tally for
   * @return actions Array of slash actions that reached quorum
   */
  function getTally(SlashRound _round) external returns (SlashAction[] memory) {
    // Get the round data for the specified round
    RoundData memory roundData = getRoundData(_round, getCurrentRound());

    // Load the committees for this round
    address[][] memory committees = getCommitteesForRound(_round);

    // Tally votes and return slash actions
    (SlashAction[] memory actions,) = tally(roundData, committees);
    return actions;
  }

  /**
   * @notice Get the address where a slash payload would be deployed
   * @param _round The round number (mixed into the salt)
   * @param _actions Array of slash actions for the payload
   * @return The predicted address of the payload
   */
  function getPayloadAddress(SlashRound _round, SlashAction[] memory _actions) external view returns (address) {
    // Return zero address if no actions
    if (_actions.length == 0) {
      return address(0);
    }
    (,,, address predictedAddress) = preparePayloadDataAndAddress(_round, _actions);
    return predictedAddress;
  }

  /**
   * @notice Get round info for a specific round
   * @param _round The round number to retrieve data for
   * @return isExecuted Whether the round has been executed
   * @return readyToExecute Whether the round is ready to be executed
   * @return voteCount The number of votes collected in this round
   */
  function getRound(SlashRound _round) external view returns (bool isExecuted, bool readyToExecute, uint256 voteCount) {
    SlashRound currentRound = getCurrentRound();

    // Load round data from the circular storage
    RoundData memory roundData = getRoundData(_round, currentRound);

    // Check if the round is ready to execute based on current round number
    bool isReady = isRoundReadyToExecute(_round, currentRound);

    // If we have not written to this round yet, return fresh round data
    if (roundData.roundNumber != _round) {
      return (false, isReady, 0);
    }

    return (roundData.executed, isReady, roundData.voteCount);
  }

  /**
   * @notice Tally votes for a specific round and return the slash actions to execute
   * @param _roundData The round data containing votes to tally
   * @param _committees The committees for each epoch in the round
   * @return slashActions Array of slash actions that reached quorum
   * @return committeesWithSlashes Boolean array indicating which committees have at least one slashed validator
   */
  function tally(RoundData memory _roundData, address[][] memory _committees)
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
    SlashRound roundNumber = _roundData.roundNumber;

    // No votes cast, return empty array
    if (voteCount == 0) {
      return (new SlashAction[](0), new bool[](ROUND_SIZE_IN_EPOCHS));
    }

    // Create a 2D array to track votes: [validator_index][slash_amount_in_units]
    // Each validator can be voted to be slashed by 1-16 units
    uint256[16][] memory tallyMatrix = new uint256[16][](COMMITTEE_SIZE * ROUND_SIZE_IN_EPOCHS);

    // Count votes for each validator and slash amount
    // Each byte encodes 2 validators: lower 4 bits for first, upper 4 bits for second
    for (uint256 i = 0; i < voteCount; i++) {
      // Load the i-th votes from this round from storage into memory
      bytes memory currentVote = getRoundVotes(roundNumber).votes[i];
      for (uint256 j = 0; j < currentVote.length; j++) {
        // Extract lower 4 bits for first validator in the byte
        uint8 validatorSlash = uint8(currentVote[j]) & 0x0F;
        tallyMatrix[j * 2][validatorSlash]++;

        // Extract upper 4 bits for second validator in the byte
        validatorSlash = (uint8(currentVote[j]) >> 4) & 0x0F;
        tallyMatrix[j * 2 + 1][validatorSlash]++;
      }
    }

    // Prepare arrays to collect slash actions and track committees with slashes
    SlashAction[] memory actions = new SlashAction[](COMMITTEE_SIZE * ROUND_SIZE_IN_EPOCHS);
    uint256 actionCount = 0;
    committeesWithSlashes = new bool[](ROUND_SIZE_IN_EPOCHS);

    // Check if any validator reached quorum for slashing
    for (uint256 i = 0; i < tallyMatrix.length; i++) {
      uint256 voteCountForValidator = 0;
      // Walk backwards from max slash (15 units) to min (1 unit)
      // A vote for N units also counts as a vote for N-1, N-2, etc.
      for (uint256 j = 15; j > 0; j--) {
        voteCountForValidator += tallyMatrix[i][j];
        if (voteCountForValidator >= QUORUM) {
          // Quorum reached - determine which validator and how much to slash
          uint256 committeeIndex = i / COMMITTEE_SIZE;
          uint256 validatorIndex = i % COMMITTEE_SIZE;
          address validator = _committees[committeeIndex][validatorIndex];
          uint256 slashAmount = SLASHING_UNIT * (j + 1); // j is 0-indexed, so +1 gives 1-16 units

          actions[actionCount] = SlashAction({validator: validator, slashAmount: slashAmount});
          actionCount++;

          // Mark this committee as having slashes
          committeesWithSlashes[committeeIndex] = true;

          break; // Only slash once per validator at the highest quorum-reached amount
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
   * @notice Get the current round number
   */
  function getCurrentRound() public view returns (SlashRound) {
    // Get current slot from the rollup instance
    IValidatorSelection rollup = IValidatorSelection(INSTANCE);
    Slot currentSlot = rollup.getCurrentSlot();
    // Divide slot by round size to get round number
    return SlashRound.wrap(Slot.unwrap(currentSlot) / ROUND_SIZE);
  }

  /**
   * @notice Internal function to get the current proposer
   */
  function getCurrentProposer() internal returns (address) {
    // Query the rollup for who is allowed to propose in the current slot
    IValidatorSelection rollup = IValidatorSelection(INSTANCE);
    return rollup.getCurrentProposer();
  }

  /**
   * @notice Internal function to get the current slot
   */
  function getCurrentSlot() internal view returns (Slot) {
    IValidatorSelection rollup = IValidatorSelection(INSTANCE);
    return rollup.getCurrentSlot();
  }

  /**
   * @notice Check if a round is complete
   */
  function isRoundReadyToExecute(SlashRound _round, SlashRound _currentRound) internal view returns (bool) {
    // Round must have passed execution delay but not exceeded lifetime
    // This gives time for review before execution and prevents stale executions
    return SlashRound.unwrap(_currentRound) > SlashRound.unwrap(_round) + EXECUTION_DELAY_IN_ROUNDS
      && SlashRound.unwrap(_currentRound) <= SlashRound.unwrap(_round) + LIFETIME_IN_ROUNDS;
  }

  /**
   * @notice Get committee commitment from the Rollup for a specific epoch within a round
   * @param _round The round number
   * @param _epochIndex The index of the epoch within the round (0 to ROUND_SIZE_IN_EPOCHS-1)
   */
  function getCommitteeCommitment(SlashRound _round, uint256 _epochIndex) internal returns (bytes32) {
    IValidatorSelection rollup = IValidatorSelection(INSTANCE);
    Timestamp timestamp = Epoch.wrap(SlashRound.unwrap(_round) * ROUND_SIZE_IN_EPOCHS + _epochIndex).toTimestamp();
    (bytes32 commitment,) = rollup.getCommitteeCommitmentAt(timestamp);

    return commitment;
  }

  /**
   * @notice Deploy a slash payload contract with the given actions
   * @dev Deploys a SlashPayload contract using CREATE2 for deterministic addresses
   * @param _round The round number (mixed into the salt)
   * @param _actions Array of slash actions to encode in the payload
   */
  function deploySlashPayload(SlashRound _round, SlashAction[] memory _actions) internal returns (IPayload) {
    // Prepare arrays for the SlashPayload constructor and get the predicted address
    (address[] memory validators, uint96[] memory amounts, bytes32 salt, address predictedAddress) =
      preparePayloadDataAndAddress(_round, _actions);

    // Return existing payload if already deployed
    if (predictedAddress.code.length > 0) {
      return IPayload(predictedAddress);
    }

    // Deploy new SlashPayload contract
    SlashPayload payload = new SlashPayload{salt: salt}(validators, amounts, IValidatorSelection(INSTANCE));

    return IPayload(address(payload));
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
  function preparePayloadDataAndAddress(SlashRound _round, SlashAction[] memory _actions)
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
   * @notice Load committees for all epochs in a round from the rollup
   * @dev This is an expensive call, use only from external view functions
   * @param _round The round number to load committees for
   * @return committees Array of committees, one for each epoch in the round
   */
  function getCommitteesForRound(SlashRound _round) internal returns (address[][] memory committees) {
    committees = new address[][](ROUND_SIZE_IN_EPOCHS);

    // Calculate the first slot of the round
    uint256 firstSlotOfRound = SlashRound.unwrap(_round) * ROUND_SIZE;

    // Calculate slots per epoch (ROUND_SIZE divided by ROUND_SIZE_IN_EPOCHS)
    uint256 slotsPerEpoch = ROUND_SIZE / ROUND_SIZE_IN_EPOCHS;

    // Load committee for each epoch in the round
    for (uint256 epochIndex = 0; epochIndex < ROUND_SIZE_IN_EPOCHS; epochIndex++) {
      // Calculate the first slot of this epoch within the round
      uint256 slotOfEpoch = firstSlotOfRound + (epochIndex * slotsPerEpoch);

      // Convert slot to epoch
      Slot slot = Slot.wrap(slotOfEpoch);
      Epoch epoch = slot.epochFromSlot();

      // Get the committee for this epoch from the rollup
      IValidatorSelection rollup = IValidatorSelection(INSTANCE);
      committees[epochIndex] = rollup.getEpochCommittee(epoch);
    }

    return committees;
  }

  /**
   * @notice Returns a storage reference to the round votes for a specific round from the circular storage.
   * This DOES NOT check for roundabout validity or range. Must be used after calling `getRoundData` with the same
   * round.
   */
  function getRoundVotes(SlashRound _round) internal view returns (RoundVotes storage) {
    // Get the round votes from the circular storage
    return roundVotes[SlashRound.unwrap(_round) % ROUNDABOUT_SIZE];
  }

  /**
   * @notice Get round data for a specific round, loading from circular storage and decompressing it
   * @param _round The round number to retrieve data for
   * @param _currentRound The current round number (so we dont try loading data outside the valid roundabout range)
   * @return RoundData struct containing the round's data
   */
  function getRoundData(SlashRound _round, SlashRound _currentRound) internal view returns (RoundData memory) {
    // Check if the requested round is within the valid roundabout range
    if (
      SlashRound.unwrap(_round) > SlashRound.unwrap(_currentRound)
        || SlashRound.unwrap(_round) + ROUNDABOUT_SIZE < SlashRound.unwrap(_currentRound)
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
   * @notice Set round data in the circular storage
   * This function DOES NOT check for round validity or range within the roundabout
   * @param roundNumber The round number to set
   * @param lastVoteSlot The last slot for which a vote was received
   * @param voteCount The number of votes collected so far in this round
   * @param executed Whether this round has been executed
   * @dev This is an internal function that should only be called after verifying the round is valid and within range
   * @dev It updates the round data in the circular storage buffer
   */
  function setRoundData(SlashRound roundNumber, Slot lastVoteSlot, uint256 voteCount, bool executed) internal {
    roundDatas[SlashRound.unwrap(roundNumber) % ROUNDABOUT_SIZE] = CompressedRoundData({
      roundNumber: roundNumber.compress(),
      lastVoteSlot: lastVoteSlot.compress(),
      voteCount: SafeCast.toUint16(voteCount), // Ensure voteCount fits in uint16
      executed: executed
    });
  }

  /**
   * @notice Computes the round at the given slot
   * @param _slot - The slot to compute round for
   * @return The round number
   */
  function computeRound(Slot _slot) internal view returns (SlashRound) {
    return SlashRound.wrap(Slot.unwrap(_slot) / ROUND_SIZE);
  }

  /**
   * @notice Reconstruct committee commitment from addresses
   */
  function computeCommitteeCommitment(address[] calldata _committee) internal pure returns (bytes32) {
    // Hash the committee addresses to create a commitment for verification
    // Duplicated from ValidatorSelectionLib.sol
    return keccak256(abi.encode(_committee));
  }
}
