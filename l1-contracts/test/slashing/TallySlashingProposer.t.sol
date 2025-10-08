// SPDX-License-Identifier: UNLICENSED
// solhint-disable imports-order
pragma solidity >=0.8.27;

/**
 * @title TallySlashingProposer Test Suite
 */
import {Rollup} from "@aztec/core/Rollup.sol";
import {IValidatorSelection} from "@aztec/core/interfaces/IValidatorSelection.sol";
import {Slot, Epoch} from "@aztec/core/libraries/TimeLib.sol";
import {TimeLib} from "@aztec/core/libraries/TimeLib.sol";
import {Slasher} from "@aztec/core/slashing/Slasher.sol";
import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {SlasherFlavor} from "@aztec/core/interfaces/ISlasher.sol";
import {TallySlashingProposer} from "@aztec/core/slashing/TallySlashingProposer.sol";
import {SlashRound} from "@aztec/core/libraries/SlashRoundLib.sol";
import {MultiAdder, CheatDepositArgs} from "@aztec/mock/MultiAdder.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {TestBase} from "@test/base/Base.sol";
import {TestConstants} from "@test/harnesses/TestConstants.sol";
import {Status, AttesterView} from "@aztec/core/interfaces/IStaking.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {TimeCheater} from "@test/staking/TimeCheater.sol";
import {RollupBuilder} from "@test/builder/RollupBuilder.sol";
import {BN254Lib, G1Point, G2Point} from "@aztec/shared/libraries/BN254Lib.sol";
import {SignatureLib, Signature} from "@aztec/shared/libraries/SignatureLib.sol";
import {SlashPayload} from "@aztec/periphery/SlashPayload.sol";

// solhint-disable comprehensive-interface
// solhint-disable func-name-mixedcase

contract TallySlashingProposerTest is TestBase {
  TestERC20 internal testERC20;
  Rollup internal rollup;
  Slasher internal slasher;
  TallySlashingProposer internal slashingProposer;
  TimeCheater internal timeCheater;

  // Test parameters
  uint256 internal constant SLASHING_UNIT = 1e18;
  uint256 internal constant QUORUM = 3;
  uint256 internal constant ROUND_SIZE = 4;
  uint256 internal constant COMMITTEE_SIZE = 4;
  uint256 internal constant EPOCH_DURATION = 2;
  uint256 internal constant ROUND_SIZE_IN_EPOCHS = 2;
  uint256 internal constant LIFETIME_IN_ROUNDS = 5;
  uint256 internal constant EXECUTION_DELAY_IN_ROUNDS = 1;
  uint256 internal constant SLASH_OFFSET_IN_ROUNDS = 2;
  uint256 internal constant FIRST_SLASH_ROUND = SLASH_OFFSET_IN_ROUNDS;

  // Test validator keys
  uint256[] internal validatorKeys;
  address[] internal validators;

  event VoteCast(SlashRound indexed round, address indexed proposer);
  event SlashRoundExecuted(SlashRound indexed round, uint256 slashCount);

  function setUp() public {
    _setupCommitteeForSlashing();
  }

  function _setupCommitteeForSlashing() internal {
    vm.warp(1 days);
    uint256 validatorCount = 4;
    validatorKeys = new uint256[](validatorCount);
    validators = new address[](validatorCount);

    CheatDepositArgs[] memory initialValidators = new CheatDepositArgs[](validatorCount);

    for (uint256 i = 1; i < validatorCount + 1; i++) {
      uint256 attesterPrivateKey = uint256(keccak256(abi.encode("attester", i)));
      address attester = vm.addr(attesterPrivateKey);

      validatorKeys[i - 1] = attesterPrivateKey;
      validators[i - 1] = attester;

      initialValidators[i - 1] = CheatDepositArgs({
        attester: attester,
        withdrawer: address(this),
        publicKeyInG1: BN254Lib.g1Zero(),
        publicKeyInG2: BN254Lib.g2Zero(),
        proofOfPossession: BN254Lib.g1Zero()
      });
    }

    RollupBuilder builder = new RollupBuilder(address(this)).setValidators(initialValidators).setTargetCommitteeSize(
      COMMITTEE_SIZE
    ).setSlashingQuorum(QUORUM).setSlashingRoundSize(ROUND_SIZE).setSlashingLifetimeInRounds(LIFETIME_IN_ROUNDS)
      .setSlashingExecutionDelayInRounds(EXECUTION_DELAY_IN_ROUNDS).setEpochDuration(EPOCH_DURATION).setSlashAmountSmall(
      SLASHING_UNIT
    ).setSlashAmountMedium(SLASHING_UNIT * 2).setSlashAmountLarge(SLASHING_UNIT * 3).setSlasherFlavor(
      SlasherFlavor.TALLY
    );
    builder.deploy();

    rollup = builder.getConfig().rollup;
    testERC20 = builder.getConfig().testERC20;
    slasher = Slasher(rollup.getSlasher());
    slashingProposer = TallySlashingProposer(slasher.PROPOSER());

    timeCheater = new TimeCheater(
      address(rollup),
      block.timestamp,
      TestConstants.AZTEC_SLOT_DURATION,
      EPOCH_DURATION,
      TestConstants.AZTEC_PROOF_SUBMISSION_EPOCHS
    );

    // Jump forward 2 epochs for sampling delay
    timeCheater.cheat__jumpForwardEpochs(2);

    assertEq(rollup.getActiveAttesterCount(), validatorCount, "Invalid attester count");
  }

  function _createVoteData(uint8[] memory slashAmounts) internal pure returns (bytes memory) {
    require(slashAmounts.length % 4 == 0, "Vote data must have multiple of 4 validators");

    bytes memory voteData = new bytes(slashAmounts.length / 4);

    for (uint256 i = 0; i < slashAmounts.length; i += 4) {
      uint8 validator0 = slashAmounts[i] & 0x03; // 2 bits
      uint8 validator1 = slashAmounts[i + 1] & 0x03; // 2 bits
      uint8 validator2 = slashAmounts[i + 2] & 0x03; // 2 bits
      uint8 validator3 = slashAmounts[i + 3] & 0x03; // 2 bits
      voteData[i / 4] = bytes1((validator3 << 6) | (validator2 << 4) | (validator1 << 2) | validator0);
    }

    return voteData;
  }

  function _createSignature(uint256 privateKey, Slot slot, bytes memory votes) internal view returns (Signature memory) {
    // Get the EIP-712 signature digest from the contract
    bytes32 digest = slashingProposer.getVoteSignatureDigest(votes, slot);

    (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
    return Signature({v: v, r: r, s: s});
  }

  function _getProposerKey() internal returns (uint256) {
    // Returns the private key of the current proposer
    address proposer = rollup.getCurrentProposer();
    uint256 proposerKey = 0;
    for (uint256 i = 0; i < validators.length; i++) {
      if (validators[i] == proposer) {
        proposerKey = validatorKeys[i];
        break;
      }
    }

    require(proposerKey != 0, "Proposer not found");
    return proposerKey;
  }

  function _castVote() internal {
    // Cast a vote in this round as the current proposer with empty slash amounts
    _castVote(new uint8[](COMMITTEE_SIZE * ROUND_SIZE_IN_EPOCHS), bytes4(0));
  }

  function _castVote(bytes4 errorSelector) internal {
    // Cast a vote in this round as the current proposer with empty slash amounts and expect a revert
    _castVote(new uint8[](COMMITTEE_SIZE * ROUND_SIZE_IN_EPOCHS), errorSelector);
  }

  function _castVote(uint8[] memory slashAmounts) internal {
    // Cast a vote in this round as the current proposer
    _castVote(slashAmounts, bytes4(0));
  }

  function _castVote(uint8[] memory slashAmounts, bytes4 errorSelector) internal {
    // Cast a vote in this round as the current proposer with the expected error selector
    Slot currentSlot = rollup.getCurrentSlot();
    address proposer = rollup.getCurrentProposer();
    uint256 proposerKey = _getProposerKey();

    bytes memory voteData = _createVoteData(slashAmounts);
    Signature memory sig = _createSignature(proposerKey, currentSlot, voteData);

    vm.prank(proposer);
    if (errorSelector != bytes4(0)) {
      vm.expectPartialRevert(errorSelector);
    }
    slashingProposer.vote(voteData, sig);
  }

  function _assertVoteCount(uint256 expectedCount) internal view {
    SlashRound slashRound = slashingProposer.getCurrentRound();
    (,, uint256 voteCount) = slashingProposer.getRound(slashRound);
    assertEq(voteCount, expectedCount, "Unexpected vote count");
  }

  function _assertVoteCount(SlashRound slashRound, uint256 expectedCount) internal view {
    (,, uint256 voteCount) = slashingProposer.getRound(slashRound);
    assertEq(voteCount, expectedCount, "Unexpected vote count");
  }

  function _jumpToSlashRound(uint256 targetSlashRound) internal {
    // Get current round first to ensure we don't go backwards
    SlashRound currentSlashRound = slashingProposer.getCurrentRound();
    require(targetSlashRound >= SlashRound.unwrap(currentSlashRound), "Target slash round must be greater than current");
    if (targetSlashRound == SlashRound.unwrap(currentSlashRound)) {
      return; // Already at target round
    }
    uint256 targetSlot = targetSlashRound * ROUND_SIZE;
    timeCheater.cheat__jumpToSlot(targetSlot);
  }

  // Vote Function Tests

  function test_voteAsProposer() public {
    _jumpToSlashRound(FIRST_SLASH_ROUND);

    uint8[] memory slashAmounts = new uint8[](COMMITTEE_SIZE * ROUND_SIZE_IN_EPOCHS);
    slashAmounts[0] = 1; // Slash first validator with 1 unit
    _castVote(slashAmounts);

    // Verify round data was updated
    SlashRound currentSlashRound = slashingProposer.getCurrentRound();
    assertEq(SlashRound.unwrap(currentSlashRound), FIRST_SLASH_ROUND, "Unexpected current slash round");
    (bool isExecuted, bool readyToExecute, uint256 voteCount) = slashingProposer.getRound(currentSlashRound);
    assertFalse(isExecuted, "Round should not be executed yet");
    assertFalse(readyToExecute, "Should not be ready to execute until after execution delay");
    assertEq(voteCount, 1, "Unexpected vote count after casting vote");
  }

  function test_voteRevertAsNonProposer() public {
    _jumpToSlashRound(FIRST_SLASH_ROUND);

    Slot currentSlot = rollup.getCurrentSlot();
    address proposer = rollup.getCurrentProposer();

    // Use a validator that is not the current proposer
    address nonProposer = validators[0];
    uint256 nonProposerKey = validatorKeys[0];
    if (nonProposer == proposer) {
      nonProposer = validators[1];
      nonProposerKey = validatorKeys[1];
    }

    uint8[] memory slashAmounts = new uint8[](COMMITTEE_SIZE * ROUND_SIZE_IN_EPOCHS);
    bytes memory voteData = _createVoteData(slashAmounts);

    Signature memory sig = _createSignature(nonProposerKey, currentSlot, voteData);

    vm.expectRevert(); // Don't specify exact selector since SignatureLib throws its own error
    vm.prank(nonProposer);
    slashingProposer.vote(voteData, sig);
  }

  function test_voteRevertWithInvalidSignature() public {
    _jumpToSlashRound(FIRST_SLASH_ROUND);

    Slot currentSlot = rollup.getCurrentSlot();
    address proposer = rollup.getCurrentProposer();

    uint8[] memory slashAmounts = new uint8[](COMMITTEE_SIZE * ROUND_SIZE_IN_EPOCHS);
    bytes memory voteData = _createVoteData(slashAmounts);

    // Create signature with wrong private key
    uint256 wrongKey = uint256(keccak256("wrong_key"));
    Signature memory sig = _createSignature(wrongKey, currentSlot, voteData);

    vm.expectRevert(); // Don't specify exact selector since SignatureLib throws its own error
    vm.prank(proposer);
    slashingProposer.vote(voteData, sig);
  }

  function test_voteRevertWithWrongVoteLength() public {
    _jumpToSlashRound(FIRST_SLASH_ROUND);

    Slot currentSlot = rollup.getCurrentSlot();
    address proposer = rollup.getCurrentProposer();
    uint256 proposerKey = _getProposerKey();

    // Wrong length vote data
    bytes memory voteData = new bytes(1); // Should be COMMITTEE_SIZE * ROUND_SIZE_IN_EPOCHS / 4
    Signature memory sig = _createSignature(proposerKey, currentSlot, voteData);

    uint256 expectedLength = COMMITTEE_SIZE * ROUND_SIZE_IN_EPOCHS / 4;
    vm.expectRevert(abi.encodeWithSelector(Errors.TallySlashingProposer__InvalidVoteLength.selector, expectedLength, 1));
    vm.prank(proposer);
    slashingProposer.vote(voteData, sig);
  }

  function test_voteOncePerSlot() public {
    _jumpToSlashRound(FIRST_SLASH_ROUND);

    // First vote should succeed
    _castVote();

    // Second vote in same slot should fail
    _castVote(Errors.TallySlashingProposer__VoteAlreadyCastInCurrentSlot.selector);
  }

  function test_voteAccumulatesAcrossSlots() public {
    _jumpToSlashRound(FIRST_SLASH_ROUND);

    // Vote in first slot
    _castVote();

    // Progress to next slot in same round
    timeCheater.cheat__progressSlot();

    // Vote in next slot
    _castVote();

    // Verify vote count increased
    _assertVoteCount(2);
  }

  function test_votesResetAcrossRounds() public {
    _jumpToSlashRound(FIRST_SLASH_ROUND);

    // Vote in first round
    _castVote();
    _assertVoteCount(1);

    // Progress to next round and check vote count has reset
    _jumpToSlashRound(FIRST_SLASH_ROUND + 1);
    _assertVoteCount(0);
    _castVote();
    _assertVoteCount(1);
  }

  function test_votesNotOpen() public {
    // Try to vote before votes are open
    _jumpToSlashRound(1);
    _castVote(Errors.TallySlashingProposer__VotingNotOpen.selector);
  }

  // ExecuteSlashRound Tests

  function _getCommitteesForRound(SlashRound targetSlashRound) internal returns (address[][] memory committees) {
    // Get the first slot of the target slash round
    uint256 firstSlotOfSlashRound = SlashRound.unwrap(targetSlashRound) * ROUND_SIZE;
    uint256 slotsPerEpoch = ROUND_SIZE / ROUND_SIZE_IN_EPOCHS;

    // Load committees for each epoch in the round
    committees = new address[][](ROUND_SIZE_IN_EPOCHS);
    for (uint256 i = 0; i < ROUND_SIZE_IN_EPOCHS; i++) {
      uint256 slotOfEpoch = firstSlotOfSlashRound + (i * slotsPerEpoch);
      uint256 epochNumber = slotOfEpoch / EPOCH_DURATION;
      // Do not try loading committees for the first two epochs in the rollup
      if (epochNumber > 1) {
        committees[i] = rollup.getEpochCommittee(Epoch.wrap(epochNumber));
      }
    }
  }

  function _executeRound(SlashRound targetSlashRound, address[][] memory committees) internal {
    address currentProposer = rollup.getCurrentProposer();
    vm.prank(currentProposer);
    slashingProposer.executeRound(targetSlashRound, committees);
  }

  function test_executeSlashRoundWithQuorum() public {
    SlashRound targetSlashRound = SlashRound.wrap(FIRST_SLASH_ROUND + 2);
    _jumpToSlashRound(SlashRound.unwrap(targetSlashRound));

    // Cast enough votes to reach quorum for slashing validator 0
    for (uint256 i = 0; i < QUORUM; i++) {
      uint8[] memory slashAmounts = new uint8[](COMMITTEE_SIZE * ROUND_SIZE_IN_EPOCHS);
      slashAmounts[0] = 3; // Slash first validator with 3 units (max for 2-bit encoding)
      _castVote(slashAmounts);

      if (i < QUORUM - 1) {
        timeCheater.cheat__progressSlot();
      }
    }

    // Jump past execution delay
    uint256 targetSlot = (SlashRound.unwrap(targetSlashRound) + EXECUTION_DELAY_IN_ROUNDS + 1) * ROUND_SIZE;
    timeCheater.cheat__jumpToSlot(targetSlot);

    // Record initial balance of slashed validator
    address[][] memory committees = _getCommitteesForRound(targetSlashRound);
    address targetValidator = committees[0][0];
    AttesterView memory initialView = rollup.getAttesterView(targetValidator);
    uint256 initialBalance = initialView.effectiveBalance;

    // Execute the round as the current proposer
    // Note that we do not need to pass in all committees, just the first one, since others dont get slashes
    address[][] memory requiredCommittees = new address[][](ROUND_SIZE_IN_EPOCHS);
    requiredCommittees[0] = committees[0];
    _executeRound(targetSlashRound, requiredCommittees);

    // And check that the slash was applied
    AttesterView memory finalView = rollup.getAttesterView(targetValidator);
    assertEq(finalView.effectiveBalance, initialBalance - (3 * SLASHING_UNIT));

    // Verify round is marked as executed
    (bool isExecuted,,) = slashingProposer.getRound(targetSlashRound);
    assertTrue(isExecuted);
  }

  function test_executeSlashRoundWithMultipleSlashAmounts() public {
    // Similar to the test above, but we play with different slash amounts and votes for each
    // validator to ensure the slashing logic works correctly with varying amounts.
    SlashRound targetSlashRound = SlashRound.wrap(FIRST_SLASH_ROUND + 2);
    _jumpToSlashRound(SlashRound.unwrap(targetSlashRound));

    // Expected slash amounts for each validator based on votes below
    uint256[] memory expectedSlashAmounts = new uint256[](COMMITTEE_SIZE);
    expectedSlashAmounts[0] = 3; // Validator 0 slashed by 3 (max for 2-bit)
    expectedSlashAmounts[1] = 2; // Validator 1 slashed by 2
    expectedSlashAmounts[2] = 0; // Validator 2 not slashed
    expectedSlashAmounts[3] = 2; // Validator 3 slashed by 2

    // Cast votes for each validator
    for (uint256 i = 0; i < ROUND_SIZE; i++) {
      uint8[] memory slashAmounts = new uint8[](COMMITTEE_SIZE * ROUND_SIZE_IN_EPOCHS);
      // Validator 0 will get slashed 3 units by all voters
      slashAmounts[0] = 3;
      // Validator 1 will get slashed 2 units by QUORUM voters
      if (i < QUORUM) {
        slashAmounts[1] = 2;
      }
      // Validator 2 will be voted for 2 units by QUORUM-1 voters (no slash)
      if (i < QUORUM - 1) {
        slashAmounts[2] = 2;
      }
      // Validator 3 will be voted for 3 units by QUORUM-1 and 2 units by 1 voter (so slash 2 units)
      if (i < QUORUM - 1) {
        slashAmounts[3] = 3;
      } else if (i == QUORUM - 1) {
        slashAmounts[3] = 2;
      }
      _castVote(slashAmounts);
      timeCheater.cheat__progressSlot();
    }

    // Jump past execution delay
    uint256 targetSlot = (SlashRound.unwrap(targetSlashRound) + EXECUTION_DELAY_IN_ROUNDS + 1) * ROUND_SIZE;
    timeCheater.cheat__jumpToSlot(targetSlot);

    // Record initial balance of each validator
    address[][] memory committees = _getCommitteesForRound(targetSlashRound);
    uint256[] memory initialBalances = new uint256[](COMMITTEE_SIZE);
    for (uint256 i = 0; i < COMMITTEE_SIZE; i++) {
      address validator = committees[0][i];
      AttesterView memory initialView = rollup.getAttesterView(validator);
      initialBalances[i] = initialView.effectiveBalance;
    }

    // Execute the round as the current proposer
    _executeRound(targetSlashRound, committees);

    // And check that the slashes were applied
    for (uint256 i = 0; i < COMMITTEE_SIZE; i++) {
      address validator = committees[0][i];
      AttesterView memory finalView = rollup.getAttesterView(validator);
      assertEq(finalView.effectiveBalance, initialBalances[i] - (expectedSlashAmounts[i] * SLASHING_UNIT));
    }

    // Verify round is marked as executed
    (bool isExecuted,,) = slashingProposer.getRound(targetSlashRound);
    assertTrue(isExecuted);
  }

  function test_executeSlashRoundRevertBeforeDelay() public {
    _jumpToSlashRound(FIRST_SLASH_ROUND);
    SlashRound targetSlashRound = slashingProposer.getCurrentRound();

    // Cast a vote
    uint8[] memory slashAmounts = new uint8[](COMMITTEE_SIZE * ROUND_SIZE_IN_EPOCHS);
    slashAmounts[0] = 3;
    _castVote(slashAmounts);

    // Try to execute before delay - should revert
    address[][] memory committees = new address[][](ROUND_SIZE_IN_EPOCHS);
    uint256 firstSlotOfSlashRound = SlashRound.unwrap(targetSlashRound) * ROUND_SIZE;
    uint256 slotsPerEpoch = ROUND_SIZE / ROUND_SIZE_IN_EPOCHS;
    for (uint256 i = 0; i < ROUND_SIZE_IN_EPOCHS; i++) {
      uint256 slotOfEpoch = firstSlotOfSlashRound + (i * slotsPerEpoch);
      uint256 epochNumber = slotOfEpoch / EPOCH_DURATION;
      committees[i] = rollup.getEpochCommittee(Epoch.wrap(epochNumber));
    }

    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.TallySlashingProposer__RoundNotComplete.selector, SlashRound.unwrap(targetSlashRound)
      )
    );
    slashingProposer.executeRound(targetSlashRound, committees);
  }

  // View Function Tests

  function test_getSlashRound() public {
    _jumpToSlashRound(FIRST_SLASH_ROUND);
    SlashRound targetSlashRound = slashingProposer.getCurrentRound();

    // Initially no votes, not ready to execute
    (bool isExecuted, bool readyToExecute, uint256 voteCount) = slashingProposer.getRound(targetSlashRound);
    assertFalse(isExecuted);
    assertFalse(readyToExecute);
    assertEq(voteCount, 0);

    // Cast a vote
    _castVote();

    // After vote, should have vote count
    (isExecuted, readyToExecute, voteCount) = slashingProposer.getRound(targetSlashRound);
    assertFalse(isExecuted);
    assertFalse(readyToExecute); // Still not ready due to execution delay
    assertEq(voteCount, 1);

    // Jump past execution delay
    uint256 targetSlot = (SlashRound.unwrap(targetSlashRound) + EXECUTION_DELAY_IN_ROUNDS + 1) * ROUND_SIZE;
    timeCheater.cheat__jumpToSlot(targetSlot);

    // Now should be ready to execute
    (isExecuted, readyToExecute, voteCount) = slashingProposer.getRound(targetSlashRound);
    assertFalse(isExecuted);
    assertTrue(readyToExecute);
    assertEq(voteCount, 1);
  }

  function test_getPayloadAddress() public view {
    TallySlashingProposer.SlashAction[] memory actions = new TallySlashingProposer.SlashAction[](2);
    actions[0] = TallySlashingProposer.SlashAction({validator: validators[0], slashAmount: 5 * SLASHING_UNIT});
    actions[1] = TallySlashingProposer.SlashAction({validator: validators[1], slashAmount: 3 * SLASHING_UNIT});

    SlashRound testSlashRound = SlashRound.wrap(1);
    address predictedAddress = slashingProposer.getPayloadAddress(testSlashRound, actions);

    // Address should not be zero
    assertTrue(predictedAddress != address(0));

    // Same actions should give same address
    address predictedAddress2 = slashingProposer.getPayloadAddress(testSlashRound, actions);
    assertEq(predictedAddress, predictedAddress2);

    // Different round should give different address
    address predictedAddress3 = slashingProposer.getPayloadAddress(SlashRound.wrap(2), actions);
    assertTrue(predictedAddress != predictedAddress3);

    // Empty actions should return zero address
    TallySlashingProposer.SlashAction[] memory emptyActions = new TallySlashingProposer.SlashAction[](0);
    address zeroAddress = slashingProposer.getPayloadAddress(testSlashRound, emptyActions);
    assertEq(zeroAddress, address(0));
  }

  function test_getCurrentSlashRound() public {
    // SlashRound should increase as we progress through slots
    _jumpToSlashRound(5);

    SlashRound currentSlashRound = slashingProposer.getCurrentRound();
    assertTrue(SlashRound.unwrap(currentSlashRound) >= 5);

    uint256 startSlashRound = SlashRound.unwrap(currentSlashRound);

    // Progress by ROUND_SIZE slots should increment round by 1
    timeCheater.cheat__jumpToSlot(Slot.unwrap(rollup.getCurrentSlot()) + ROUND_SIZE);

    SlashRound newSlashRound = slashingProposer.getCurrentRound();
    assertEq(SlashRound.unwrap(newSlashRound), startSlashRound + 1);
  }

  // Circular Storage Tests

  function test_circularStorageOverwrite() public {
    // Test the circular storage behavior - when we jump far enough ahead,
    // old round data should be detected as stale and return empty data
    _jumpToSlashRound(10);
    SlashRound baseSlashRound = slashingProposer.getCurrentRound(); // Get the actual round we're in

    // Cast a vote in this round
    _castVote();

    // Verify vote was recorded
    _assertVoteCount(baseSlashRound, 1);

    // Jump to a round that would overwrite in circular storage
    uint256 ROUNDABOUT_SIZE = slashingProposer.ROUNDABOUT_SIZE();
    SlashRound newSlashRound = SlashRound.wrap(SlashRound.unwrap(baseSlashRound) + ROUNDABOUT_SIZE);
    _jumpToSlashRound(SlashRound.unwrap(newSlashRound));

    // When we check the new round, it should return empty data
    _assertVoteCount(newSlashRound, 0);

    // And when we check the old one, it should revert
    vm.expectPartialRevert(Errors.TallySlashingProposer__RoundOutOfRange.selector);
    slashingProposer.getRound(baseSlashRound);
  }

  function test_futureRoundOutOfRange() public {
    SlashRound currentSlashRound = slashingProposer.getCurrentRound();

    // Test accessing a round too far in the future
    SlashRound futureSlashRound = SlashRound.wrap(SlashRound.unwrap(currentSlashRound) + 1);
    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.TallySlashingProposer__RoundOutOfRange.selector,
        SlashRound.unwrap(futureSlashRound),
        SlashRound.unwrap(currentSlashRound)
      )
    );
    slashingProposer.getRound(futureSlashRound);
  }

  function test_voteStorageAndLoadingRoundTrip() public {
    // Test that vote data is correctly stored and loaded without corruption
    _jumpToSlashRound(FIRST_SLASH_ROUND);

    // Create specific vote pattern to verify byte ordering
    uint8[] memory slashAmounts = new uint8[](COMMITTEE_SIZE * ROUND_SIZE_IN_EPOCHS);
    // Set specific patterns that would reveal byte order issues
    slashAmounts[0] = 1; // First validator, 1 unit
    slashAmounts[1] = 2; // Second validator, 2 units
    slashAmounts[2] = 3; // Third validator, 3 units
    slashAmounts[3] = 0; // Fourth validator, no slash
    slashAmounts[4] = 1; // Fifth validator, 1 unit
    slashAmounts[5] = 2; // Sixth validator, 2 units
    slashAmounts[6] = 3; // Seventh validator, 3 units
    slashAmounts[7] = 0; // Eighth validator, no slash

    _castVote(slashAmounts);

    // Retrieve the stored vote data
    SlashRound currentRound = slashingProposer.getCurrentRound();
    bytes memory storedVote = slashingProposer.getVotes(currentRound, 0);

    // Verify the vote data matches what we sent
    bytes memory expectedVote = _createVoteData(slashAmounts);
    assertEq(storedVote.length, expectedVote.length, "Vote data length mismatch");

    // Verify byte-by-byte to ensure no corruption
    for (uint256 i = 0; i < expectedVote.length; i++) {
      assertEq(uint8(storedVote[i]), uint8(expectedVote[i]), string.concat("Byte mismatch at index ", vm.toString(i)));
    }
  }

  function test_partialChunkVoteStorage() public {
    // Test storage of vote data that doesn't align to 32-byte boundaries
    _jumpToSlashRound(FIRST_SLASH_ROUND);

    // For a smaller committee that doesn't fill all chunks evenly
    // COMMITTEE_SIZE=4, ROUND_SIZE_IN_EPOCHS=2, so we have 8 validators = 2 bytes of vote data
    uint8[] memory slashAmounts = new uint8[](COMMITTEE_SIZE * ROUND_SIZE_IN_EPOCHS);
    for (uint256 i = 0; i < slashAmounts.length; i++) {
      slashAmounts[i] = uint8((i % 3) + 1); // Pattern: 1,2,3,1,2,3,1,2
    }

    _castVote(slashAmounts);

    // Verify stored data
    SlashRound currentRound = slashingProposer.getCurrentRound();
    bytes memory storedVote = slashingProposer.getVotes(currentRound, 0);
    bytes memory expectedVote = _createVoteData(slashAmounts);

    assertEq(storedVote.length, expectedVote.length, "Stored vote length incorrect");
    assertEq(storedVote, expectedVote, "Stored vote data incorrect");

    // Verify no memory corruption: check that extra bytes beyond expectedLength are not included
    // Even though we allocate rounded-up memory, the returned array should have correct length
    assertTrue(storedVote.length == 2, "Vote data should be exactly 2 bytes");

    // Verify the actual content byte-by-byte
    for (uint256 i = 0; i < expectedVote.length; i++) {
      assertEq(uint8(storedVote[i]), uint8(expectedVote[i]), string.concat("Byte mismatch at index ", vm.toString(i)));
    }
  }

  function test_validatorIndexMapping() public {
    // Test that validator indices map correctly to committees and epochs
    // Jump far enough so committees are available for the target epochs
    _jumpToSlashRound(10);

    // Create a vote where only specific validators are slashed
    uint8[] memory slashAmounts = new uint8[](COMMITTEE_SIZE * ROUND_SIZE_IN_EPOCHS);

    // Slash validators at specific indices to verify mapping
    // Validator 0 (first validator of first epoch): 3 units
    slashAmounts[0] = 3;
    // Validator 4 (first validator of second epoch): 2 units
    slashAmounts[4] = 2;
    // Validator 7 (last validator of second epoch): 1 unit
    slashAmounts[7] = 1;

    // Cast QUORUM votes to execute slashing
    for (uint256 i = 0; i < QUORUM; i++) {
      _castVote(slashAmounts);
      if (i < QUORUM - 1) {
        timeCheater.cheat__progressSlot();
      }
    }

    // Jump to execution time
    SlashRound targetRound = slashingProposer.getCurrentRound();
    uint256 executionSlot = (SlashRound.unwrap(targetRound) + EXECUTION_DELAY_IN_ROUNDS + 1) * ROUND_SIZE;
    timeCheater.cheat__jumpToSlot(executionSlot);

    // Get committees for verification
    address[][] memory committees = slashingProposer.getSlashTargetCommittees(targetRound);

    // Execute and check the tally
    TallySlashingProposer.SlashAction[] memory actions = slashingProposer.getTally(targetRound, committees);

    // Verify correct validators were identified for slashing
    assertEq(actions.length, 3, "Should have 3 validators to slash");

    // Check that the right validators are slashed with correct amounts
    bool foundValidator0 = false;
    bool foundValidator4 = false;
    bool foundValidator7 = false;

    for (uint256 i = 0; i < actions.length; i++) {
      if (actions[i].validator == committees[0][0]) {
        foundValidator0 = true;
        assertEq(actions[i].slashAmount, 3 * SLASHING_UNIT, "Validator 0 slash amount incorrect");
      } else if (actions[i].validator == committees[1][0]) {
        foundValidator4 = true;
        assertEq(actions[i].slashAmount, 2 * SLASHING_UNIT, "Validator 4 slash amount incorrect");
      } else if (actions[i].validator == committees[1][3]) {
        foundValidator7 = true;
        assertEq(actions[i].slashAmount, 1 * SLASHING_UNIT, "Validator 7 slash amount incorrect");
      }
    }

    assertTrue(foundValidator0, "Validator 0 not found in slash actions");
    assertTrue(foundValidator4, "Validator 4 not found in slash actions");
    assertTrue(foundValidator7, "Validator 7 not found in slash actions");
  }

  function test_32ByteChunkProcessing() public {
    // Test processing of full 32-byte chunks for vote data
    // This would require a large committee size, so we'll test the pattern
    _jumpToSlashRound(FIRST_SLASH_ROUND);

    // Create a repeating pattern across all validators
    uint8[] memory slashAmounts = new uint8[](COMMITTEE_SIZE * ROUND_SIZE_IN_EPOCHS);
    for (uint256 i = 0; i < slashAmounts.length; i++) {
      // Create pattern: 0,1,2,3,0,1,2,3...
      slashAmounts[i] = uint8(i % 4);
    }

    // Cast vote and verify it was stored
    _castVote(slashAmounts);

    SlashRound currentRound = slashingProposer.getCurrentRound();
    bytes memory storedVote = slashingProposer.getVotes(currentRound, 0);

    // Verify the pattern is preserved
    bytes memory expectedVote = _createVoteData(slashAmounts);
    assertEq(storedVote, expectedVote, "32-byte chunk processing failed");
  }

  function test_tallyMatrixPackingOverflow() public {
    // Test that the tally matrix doesn't overflow with maximum votes
    // With MAX_ROUND_SIZE=1024, we should be safe from overflow
    _jumpToSlashRound(10);

    uint8[] memory slashAmounts = new uint8[](COMMITTEE_SIZE * ROUND_SIZE_IN_EPOCHS);
    slashAmounts[0] = 3; // Slash first validator with maximum units

    // Cast maximum number of votes (up to ROUND_SIZE)
    // In practice, limited by ROUND_SIZE slots
    uint256 maxVotes = ROUND_SIZE < 100 ? ROUND_SIZE : 100; // Cap at reasonable number for test
    for (uint256 i = 0; i < maxVotes; i++) {
      _castVote(slashAmounts);
      if (i < maxVotes - 1) {
        timeCheater.cheat__progressSlot();
      }
    }

    // Verify vote count
    SlashRound currentRound = slashingProposer.getCurrentRound();
    (,, uint256 voteCount) = slashingProposer.getRound(currentRound);
    assertEq(voteCount, maxVotes, "Vote count incorrect");

    // Jump to execution time
    uint256 executionSlot = (SlashRound.unwrap(currentRound) + EXECUTION_DELAY_IN_ROUNDS + 1) * ROUND_SIZE;
    timeCheater.cheat__jumpToSlot(executionSlot);

    // Get tally - should not overflow
    address[][] memory committees = slashingProposer.getSlashTargetCommittees(currentRound);
    TallySlashingProposer.SlashAction[] memory actions = slashingProposer.getTally(currentRound, committees);

    // Should have slashed the first validator
    assertEq(actions.length, 1, "Should slash exactly one validator");
    assertEq(actions[0].slashAmount, 3 * SLASHING_UNIT, "Slash amount incorrect");
  }

  function test_emptyVoteProcessing() public {
    // Test that empty votes (all zeros) are handled correctly
    _jumpToSlashRound(10);

    uint8[] memory slashAmounts = new uint8[](COMMITTEE_SIZE * ROUND_SIZE_IN_EPOCHS);
    // All zeros - no one should be slashed

    // Cast QUORUM empty votes
    for (uint256 i = 0; i < QUORUM; i++) {
      _castVote(slashAmounts);
      if (i < QUORUM - 1) {
        timeCheater.cheat__progressSlot();
      }
    }

    // Jump to execution time
    SlashRound currentRound = slashingProposer.getCurrentRound();
    uint256 executionSlot = (SlashRound.unwrap(currentRound) + EXECUTION_DELAY_IN_ROUNDS + 1) * ROUND_SIZE;
    timeCheater.cheat__jumpToSlot(executionSlot);

    // Get tally - should be empty
    address[][] memory committees = slashingProposer.getSlashTargetCommittees(currentRound);
    TallySlashingProposer.SlashAction[] memory actions = slashingProposer.getTally(currentRound, committees);

    assertEq(actions.length, 0, "No validators should be slashed with empty votes");
  }

  function test_cumulativeVotingLogic() public {
    // Test cumulative voting: vote for 3 units counts as votes for 2 and 1 unit as well
    _jumpToSlashRound(10);

    uint8[] memory slashAmounts = new uint8[](COMMITTEE_SIZE * ROUND_SIZE_IN_EPOCHS);

    // Vote patterns to test cumulative logic:
    // Cumulative voting means: a vote for N units also counts toward quorum for amounts < N
    // Validator 0: 3 votes for 3 units (reaches quorum for 3 units since 3 >= QUORUM)
    // Validator 1: 2 votes for 2 units, 1 vote for 1 unit (reaches quorum for 1 unit with cumulative: 2+1=3)
    // Validator 2: 3 votes for 1 unit (reaches quorum for 1 unit)

    // Vote 1: 3 units for validator 0, 2 units for validator 1, 1 unit for validator 2
    slashAmounts[0] = 3;
    slashAmounts[1] = 2;
    slashAmounts[2] = 1;
    _castVote(slashAmounts);
    timeCheater.cheat__progressSlot();

    // Vote 2: 3 units for validator 0, 2 units for validator 1, 1 unit for validator 2
    _castVote(slashAmounts);
    timeCheater.cheat__progressSlot();

    // Vote 3: 3 units for validator 0, 1 unit for validators 1 and 2
    slashAmounts[0] = 3;
    slashAmounts[1] = 1;
    slashAmounts[2] = 1;
    _castVote(slashAmounts);

    // Jump to execution time
    SlashRound currentRound = slashingProposer.getCurrentRound();
    uint256 executionSlot = (SlashRound.unwrap(currentRound) + EXECUTION_DELAY_IN_ROUNDS + 1) * ROUND_SIZE;
    timeCheater.cheat__jumpToSlot(executionSlot);

    // Get tally
    address[][] memory committees = slashingProposer.getSlashTargetCommittees(currentRound);
    TallySlashingProposer.SlashAction[] memory actions = slashingProposer.getTally(currentRound, committees);

    // All three validators should be slashed
    assertEq(actions.length, 3, "Should slash three validators");

    // Verify slash amounts match cumulative voting logic
    // With cumulative voting: votes for N units count toward quorum for all amounts <= N
    for (uint256 i = 0; i < actions.length; i++) {
      if (actions[i].validator == committees[0][0]) {
        // 3 votes for 3 units -> reaches quorum at 3 units
        assertEq(actions[i].slashAmount, 3 * SLASHING_UNIT, "Validator 0 should be slashed for 3 units");
      } else if (actions[i].validator == committees[0][1]) {
        // 2 votes for 2 units + 1 vote for 1 unit -> with cumulative, reaches quorum at 1 unit
        assertEq(actions[i].slashAmount, 1 * SLASHING_UNIT, "Validator 1 should be slashed for 1 unit");
      } else if (actions[i].validator == committees[0][2]) {
        // 3 votes for 1 unit -> reaches quorum at 1 unit
        assertEq(actions[i].slashAmount, 1 * SLASHING_UNIT, "Validator 2 should be slashed for 1 unit");
      }
    }
  }

  function test_getSlashTargetCommitteesEarlyEpochs() public {
    // Test that getSlashTargetCommittees handles epochs 0 and 1 without throwing
    // when ValidatorSelection__InsufficientValidatorSetSize is thrown

    // Use a very early slash round that would target epochs 0 and 1
    // With SLASH_OFFSET_IN_ROUNDS = 2, round 2 targets epochs starting from (2-2)*ROUND_SIZE_IN_EPOCHS = 0
    SlashRound earlyRound = SlashRound.wrap(SLASH_OFFSET_IN_ROUNDS);

    // This should not revert and should return empty committees for early epochs
    address[][] memory committees = slashingProposer.getSlashTargetCommittees(earlyRound);

    // Verify we get the expected number of committees
    assertEq(committees.length, ROUND_SIZE_IN_EPOCHS, "Should return correct number of committees");

    // For very early rounds, we expect empty committees for epochs 0 and 1
    // Since ROUND_SIZE_IN_EPOCHS = 2, both epochs should be empty
    for (uint256 i = 0; i < ROUND_SIZE_IN_EPOCHS; i++) {
      Epoch targetEpoch = slashingProposer.getSlashTargetEpoch(earlyRound, i);
      if (Epoch.unwrap(targetEpoch) <= 1) {
        assertEq(committees[i].length, 0, "Committee for early epochs should be empty");
      }
      // For epochs > 1, we might get actual committees, but that depends on the test setup
    }
  }
}
