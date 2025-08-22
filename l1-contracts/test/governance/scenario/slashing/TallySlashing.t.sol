// SPDX-License-Identifier: UNLICENSED
// solhint-disable imports-order
pragma solidity >=0.8.27;

import {Rollup} from "@aztec/core/Rollup.sol";
import {IValidatorSelection} from "@aztec/core/interfaces/IValidatorSelection.sol";
import {Slot, Epoch} from "@aztec/core/libraries/TimeLib.sol";
import {Slasher, IPayload} from "@aztec/core/slashing/Slasher.sol";
import {TallySlashingProposer} from "@aztec/core/slashing/TallySlashingProposer.sol";
import {RewardDistributor} from "@aztec/governance/RewardDistributor.sol";
import {MultiAdder, CheatDepositArgs} from "@aztec/mock/MultiAdder.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {SlashFactory} from "@aztec/periphery/SlashFactory.sol";
import {TestBase} from "@test/base/Base.sol";

import {TestConstants} from "../../../harnesses/TestConstants.sol";

import {RewardDistributor} from "@aztec/governance/RewardDistributor.sol";

import {SlashFactory} from "@aztec/periphery/SlashFactory.sol";
import {Slasher, IPayload} from "@aztec/core/slashing/Slasher.sol";
import {IValidatorSelection} from "@aztec/core/interfaces/IValidatorSelection.sol";
import {Status, AttesterView} from "@aztec/core/interfaces/IStaking.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";

import {TallySlashingProposer} from "@aztec/core/slashing/TallySlashingProposer.sol";

import {Slot, Epoch} from "@aztec/core/libraries/TimeLib.sol";
import {TimeCheater} from "../../../staking/TimeCheater.sol";
import {MultiAdder, CheatDepositArgs} from "@aztec/mock/MultiAdder.sol";
import {RollupBuilder} from "../../../builder/RollupBuilder.sol";
import {BN254Lib, G1Point, G2Point} from "@aztec/shared/libraries/BN254Lib.sol";
import {SignatureLib, Signature} from "@aztec/shared/libraries/SignatureLib.sol";
import {SlashRound} from "@aztec/core/libraries/SlashRoundLib.sol";
import {SlasherFlavor} from "@aztec/core/interfaces/ISlasher.sol";

// solhint-disable comprehensive-interface
// solhint-disable func-name-mixedcase

contract SlashingTest is TestBase {
  TestERC20 internal testERC20;
  RewardDistributor internal rewardDistributor;
  Rollup internal rollup;
  Slasher internal slasher;
  SlashFactory internal slashFactory;
  TallySlashingProposer internal slashingProposer;
  TimeCheater internal timeCheater;

  // Test validator keys for signing
  uint256[] internal validatorKeys;
  address[] internal validatorAddresses;

  uint256 constant VALIDATOR_COUNT = 4;
  uint256 constant COMMITTEE_SIZE = 4;
  uint256 constant HOW_MANY_SLASHED = 4;
  uint256 constant ROUND_SIZE_IN_EPOCHS = 1;
  uint256 constant INITIAL_EPOCH = 6 + ROUND_SIZE_IN_EPOCHS;

  function _getProposerKey() internal returns (uint256) {
    // Returns the private key of the current proposer
    address proposer = rollup.getCurrentProposer();
    uint256 proposerKey = 0;
    for (uint256 i = 0; i < validatorAddresses.length; i++) {
      if (validatorAddresses[i] == proposer) {
        proposerKey = validatorKeys[i];
        break;
      }
    }

    require(proposerKey != 0, "Proposer not found");
    return proposerKey;
  }

  function _createSignature(uint256 privateKey, Slot slot, bytes memory votes) internal view returns (Signature memory) {
    // Get the EIP-712 signature digest from the contract
    bytes32 digest = slashingProposer.getVoteSignatureDigest(votes, slot);

    (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
    return Signature({v: v, r: r, s: s});
  }

  function _createSlashingVotes(uint256 _slashAmount, uint256 _howMany) internal returns (SlashRound) {
    // Jump to start of next round for voting
    SlashRound currentRound = slashingProposer.getCurrentRound();
    uint256 desiredSlot = (SlashRound.unwrap(currentRound) + 1) * slashingProposer.ROUND_SIZE();

    timeCheater.cheat__jumpToSlot(desiredSlot);
    SlashRound votingRound = slashingProposer.getCurrentRound();

    // Create votes - for tally slashing we need to encode votes as bytes
    // Each validator gets a slash amount between 1-15 units
    // For simplicity, we'll vote to slash all validators by the same amount
    uint256 slashUnits = _slashAmount / slashingProposer.SLASHING_UNIT();
    if (slashUnits == 0) slashUnits = 1; // Minimum 1 unit
    if (slashUnits > 15) slashUnits = 15; // Maximum 15 units

    // Calculate expected vote length: (COMMITTEE_SIZE * ROUND_SIZE_IN_EPOCHS) / 2
    uint256 totalValidators = slashingProposer.COMMITTEE_SIZE() * slashingProposer.ROUND_SIZE_IN_EPOCHS();
    uint256 voteLength = totalValidators / 2;
    bytes memory votes = new bytes(voteLength);

    // Encode votes: each byte contains 2 validator votes (4 bits each)
    for (uint256 i = 0; i < voteLength; i++) {
      uint8 vote1 = (i * 2 < _howMany) ? uint8(slashUnits) : 0;
      uint8 vote2 = (i * 2 + 1 < _howMany) ? uint8(slashUnits) : 0;
      votes[i] = bytes1((vote2 << 4) | vote1);
    }

    // Cast votes in multiple slots to reach quorum
    uint256 quorum = slashingProposer.QUORUM();
    for (uint256 i = 0; i < quorum; i++) {
      address proposer = rollup.getCurrentProposer();
      uint256 proposerKey = _getProposerKey();

      // Create signature for vote
      Signature memory sig = _createSignature(proposerKey, Slot.wrap(timeCheater.currentSlot()), votes);

      vm.prank(proposer);
      slashingProposer.vote(votes, sig);
      timeCheater.cheat__progressSlot();
    }

    return votingRound;
  }

  function _setupCommitteeForSlashing() internal {
    _setupCommitteeForSlashing(
      TestConstants.AZTEC_SLASHING_LIFETIME_IN_ROUNDS, TestConstants.AZTEC_SLASHING_EXECUTION_DELAY_IN_ROUNDS
    );
  }

  function _setupCommitteeForSlashing(uint256 _slashingLifetimeInRounds, uint256 _slashingExecutionDelayInRounds)
    internal
  {
    uint256 validatorCount = VALIDATOR_COUNT;
    validatorKeys = new uint256[](validatorCount);
    validatorAddresses = new address[](validatorCount);

    CheatDepositArgs[] memory initialValidators = new CheatDepositArgs[](validatorCount);

    for (uint256 i = 1; i < validatorCount + 1; i++) {
      uint256 attesterPrivateKey = uint256(keccak256(abi.encode("attester", i)));
      address attester = vm.addr(attesterPrivateKey);

      validatorKeys[i - 1] = attesterPrivateKey;
      validatorAddresses[i - 1] = attester;

      initialValidators[i - 1] = CheatDepositArgs({
        attester: attester,
        withdrawer: address(this),
        publicKeyInG1: BN254Lib.g1Zero(),
        publicKeyInG2: BN254Lib.g2Zero(),
        proofOfPossession: BN254Lib.g1Zero()
      });
    }

    uint256 roundSize = ROUND_SIZE_IN_EPOCHS * TestConstants.AZTEC_EPOCH_DURATION;
    RollupBuilder builder = new RollupBuilder(address(this)).setValidators(initialValidators).setTargetCommitteeSize(
      COMMITTEE_SIZE
    ).setSlashingLifetimeInRounds(_slashingLifetimeInRounds).setSlashingExecutionDelayInRounds(
      _slashingExecutionDelayInRounds
    ).setSlasherFlavor(SlasherFlavor.TALLY).setSlashingRoundSize(roundSize).setSlashingQuorum(roundSize / 2 + 1)
      .setSlashingOffsetInRounds(2);
    builder.deploy();

    rollup = builder.getConfig().rollup;
    testERC20 = builder.getConfig().testERC20;

    slasher = Slasher(rollup.getSlasher());
    slashingProposer = TallySlashingProposer(slasher.PROPOSER());
    slashFactory = new SlashFactory(IValidatorSelection(address(rollup)));

    timeCheater = new TimeCheater(
      address(rollup),
      block.timestamp,
      TestConstants.AZTEC_SLOT_DURATION,
      TestConstants.AZTEC_EPOCH_DURATION,
      TestConstants.AZTEC_PROOF_SUBMISSION_EPOCHS
    );

    // We jump forward enough epochs so that when we vote for slashing epochs from the past,
    // those epochs actually have validators in them. With SLASH_OFFSET_IN_ROUNDS = 2,
    // we need to be far enough ahead that the epochs we're slashing had validators.
    timeCheater.cheat__jumpForwardEpochs(INITIAL_EPOCH);

    assertEq(rollup.getActiveAttesterCount(), validatorCount, "Invalid attester count");
  }

  function test_CannotSlashBeforeDelay(uint256 _lifetimeInRounds, uint256 _executionDelayInRounds, uint256 _jumpToSlot)
    public
  {
    _executionDelayInRounds = bound(_executionDelayInRounds, 1, 50);
    _lifetimeInRounds = bound(_lifetimeInRounds, _executionDelayInRounds + 1, 127); // Must be < ROUNDABOUT_SIZE

    _setupCommitteeForSlashing(_lifetimeInRounds, _executionDelayInRounds);
    address[] memory attesters = rollup.getEpochCommittee(Epoch.wrap(INITIAL_EPOCH));
    uint96 slashAmount = 10e18;
    SlashRound firstSlashingRound = _createSlashingVotes(slashAmount, attesters.length);

    uint256 firstExecutableSlot =
      (SlashRound.unwrap(firstSlashingRound) + _executionDelayInRounds + 1) * slashingProposer.ROUND_SIZE();
    _jumpToSlot = bound(_jumpToSlot, timeCheater.currentSlot(), firstExecutableSlot - 1);

    timeCheater.cheat__jumpToSlot(_jumpToSlot);

    // For tally slashing, we need to prepare committees for execution
    address[][] memory committees = new address[][](slashingProposer.ROUND_SIZE_IN_EPOCHS());
    for (uint256 i = 0; i < committees.length; i++) {
      Epoch epochSlashed = slashingProposer.getSlashTargetEpoch(firstSlashingRound, i);
      committees[i] = rollup.getEpochCommittee(epochSlashed);
    }

    vm.expectRevert(); // Should revert because round is not ready to execute yet
    slashingProposer.executeRound(firstSlashingRound, committees);
  }

  function test_CanSlashAfterDelay(uint256 _lifetimeInRounds, uint256 _executionDelayInRounds, uint256 _jumpToSlot)
    public
  {
    _executionDelayInRounds = bound(_executionDelayInRounds, 1, 50);
    _lifetimeInRounds = bound(_lifetimeInRounds, _executionDelayInRounds + 1, 127); // Must be < ROUNDABOUT_SIZE

    _setupCommitteeForSlashing(_lifetimeInRounds, _executionDelayInRounds);
    address[] memory attesters = rollup.getEpochCommittee(Epoch.wrap(INITIAL_EPOCH));
    uint96 slashAmount = 10e18;
    SlashRound firstSlashingRound = _createSlashingVotes(slashAmount, attesters.length);

    uint256 firstExecutableSlot =
      (SlashRound.unwrap(firstSlashingRound) + _executionDelayInRounds + 1) * slashingProposer.ROUND_SIZE();
    uint256 lastExecutableSlot =
      (SlashRound.unwrap(firstSlashingRound) + _lifetimeInRounds) * slashingProposer.ROUND_SIZE();
    _jumpToSlot = bound(_jumpToSlot, firstExecutableSlot, lastExecutableSlot);

    timeCheater.cheat__jumpToSlot(_jumpToSlot);
    uint256[] memory stakes = new uint256[](attesters.length);
    for (uint256 i = 0; i < attesters.length; i++) {
      AttesterView memory attesterView = rollup.getAttesterView(attesters[i]);
      stakes[i] = attesterView.effectiveBalance;
      assertTrue(attesterView.status == Status.VALIDATING, "Invalid status");
    }

    // For tally slashing, we need to prepare committees for execution
    address[][] memory committees = new address[][](slashingProposer.ROUND_SIZE_IN_EPOCHS());
    for (uint256 i = 0; i < committees.length; i++) {
      Epoch epochSlashed = slashingProposer.getSlashTargetEpoch(firstSlashingRound, i);
      committees[i] = rollup.getEpochCommittee(epochSlashed);
    }

    slashingProposer.executeRound(firstSlashingRound, committees);

    for (uint256 i = 0; i < attesters.length; i++) {
      AttesterView memory attesterView = rollup.getAttesterView(attesters[i]);
      assertEq(attesterView.effectiveBalance, stakes[i] - slashAmount);
      assertEq(attesterView.exit.amount, 0, "Invalid stake");
      assertTrue(attesterView.status == Status.VALIDATING, "Invalid status");
    }
  }

  function test_CannotSlashIfVetoed(uint256 _lifetimeInRounds, uint256 _executionDelayInRounds, uint256 _jumpToSlot)
    public
  {
    _executionDelayInRounds = bound(_executionDelayInRounds, 1, 50);
    _lifetimeInRounds = bound(_lifetimeInRounds, _executionDelayInRounds + 1, 127); // Must be < ROUNDABOUT_SIZE

    _setupCommitteeForSlashing(_lifetimeInRounds, _executionDelayInRounds);
    address[] memory attesters = rollup.getEpochCommittee(Epoch.wrap(INITIAL_EPOCH));
    uint96 slashAmount = 10e18;
    SlashRound firstSlashingRound = _createSlashingVotes(slashAmount, attesters.length);

    // For tally slashing, we need to predict the payload address and veto it
    // Get the actual slash actions that will be created by calling getTally
    TallySlashingProposer.SlashAction[] memory actions = slashingProposer.getTally(firstSlashingRound);
    address payloadAddress = slashingProposer.getPayloadAddress(firstSlashingRound, actions);

    // Veto the predicted payload
    vm.prank(address(slasher.VETOER()));
    slasher.vetoPayload(IPayload(payloadAddress));

    uint256 firstExecutableSlot =
      (SlashRound.unwrap(firstSlashingRound) + _executionDelayInRounds + 1) * slashingProposer.ROUND_SIZE();
    uint256 lastExecutableSlot =
      (SlashRound.unwrap(firstSlashingRound) + _lifetimeInRounds) * slashingProposer.ROUND_SIZE();
    _jumpToSlot = bound(_jumpToSlot, firstExecutableSlot, lastExecutableSlot);

    timeCheater.cheat__jumpToSlot(_jumpToSlot);

    // For tally slashing, we need to prepare committees for execution
    address[][] memory committees = new address[][](slashingProposer.ROUND_SIZE_IN_EPOCHS());
    for (uint256 i = 0; i < committees.length; i++) {
      Epoch epochSlashed = slashingProposer.getSlashTargetEpoch(firstSlashingRound, i);
      committees[i] = rollup.getEpochCommittee(epochSlashed);
    }

    vm.expectRevert(abi.encodeWithSelector(Slasher.Slasher__PayloadVetoed.selector, payloadAddress));
    slashingProposer.executeRound(firstSlashingRound, committees);
  }

  function test_SlashingSmallAmount() public {
    _setupCommitteeForSlashing();
    uint256 howManyToSlash = HOW_MANY_SLASHED;

    // We slash a small amount and see that they are all still validating, but less stake
    uint96 slashAmount1 = 10e18;
    SlashRound firstSlashingRound = _createSlashingVotes(slashAmount1, howManyToSlash);

    // Grab the attesters and their initial stakes
    address[][] memory committees = new address[][](slashingProposer.ROUND_SIZE_IN_EPOCHS());
    address[] memory attesters = new address[](slashingProposer.ROUND_SIZE_IN_EPOCHS() * COMMITTEE_SIZE);
    uint256[] memory stakes = new uint256[](attesters.length);
    for (uint256 i = 0; i < slashingProposer.ROUND_SIZE_IN_EPOCHS(); i++) {
      Epoch epochSlashed = slashingProposer.getSlashTargetEpoch(firstSlashingRound, i);
      address[] memory committee = rollup.getEpochCommittee(epochSlashed);
      committees[i] = committee;
      for (uint256 j = 0; j < committee.length; j++) {
        address attester = committee[j];
        attesters[i * COMMITTEE_SIZE + j] = attester;
        AttesterView memory attesterView = rollup.getAttesterView(attester);
        stakes[i * COMMITTEE_SIZE + j] = attesterView.effectiveBalance;
        assertTrue(attesterView.status == Status.VALIDATING, "Invalid status");
      }
    }

    // Wait for execution delay and execute - need to be in the next round for execution
    uint256 roundsToWait = slashingProposer.EXECUTION_DELAY_IN_ROUNDS() + 1;
    timeCheater.cheat__jumpForwardSlots(roundsToWait * slashingProposer.ROUND_SIZE());

    // Execute the slash
    slashingProposer.executeRound(firstSlashingRound, committees);

    // Check balances
    for (uint256 i = 0; i < howManyToSlash; i++) {
      AttesterView memory attesterView = rollup.getAttesterView(attesters[i]);
      assertEq(attesterView.effectiveBalance, stakes[i] - slashAmount1);
      assertEq(attesterView.exit.amount, 0, "Invalid stake");
      assertTrue(attesterView.status == Status.VALIDATING, "Invalid status");
    }

    // Verify that slashing was successful and validators are still active
    assertEq(rollup.getActiveAttesterCount(), VALIDATOR_COUNT, "All validators should remain active after small slash");
  }

  function test_SlashingLargeAmount() public {
    _setupCommitteeForSlashing();
    uint256 howManyToSlash = HOW_MANY_SLASHED;

    // We slash a small amount and see that they are all still validating, but less stake
    uint96 slashAmount1 = 60e18;
    SlashRound firstSlashingRound = _createSlashingVotes(slashAmount1, howManyToSlash);

    // Grab the attesters and their initial stakes
    address[][] memory committees = new address[][](slashingProposer.ROUND_SIZE_IN_EPOCHS());
    address[] memory attesters = new address[](slashingProposer.ROUND_SIZE_IN_EPOCHS() * COMMITTEE_SIZE);
    uint256[] memory stakes = new uint256[](attesters.length);
    for (uint256 i = 0; i < slashingProposer.ROUND_SIZE_IN_EPOCHS(); i++) {
      Epoch epochSlashed = slashingProposer.getSlashTargetEpoch(firstSlashingRound, i);
      address[] memory committee = rollup.getEpochCommittee(epochSlashed);
      committees[i] = committee;
      for (uint256 j = 0; j < committee.length; j++) {
        address attester = committee[j];
        attesters[i * COMMITTEE_SIZE + j] = attester;
        AttesterView memory attesterView = rollup.getAttesterView(attester);
        stakes[i * COMMITTEE_SIZE + j] = attesterView.effectiveBalance;
        assertTrue(attesterView.status == Status.VALIDATING, "Invalid status");
      }
    }

    // Wait for execution delay and execute - need to be in the next round for execution
    uint256 roundsToWait = slashingProposer.EXECUTION_DELAY_IN_ROUNDS() + 1;
    timeCheater.cheat__jumpForwardSlots(roundsToWait * slashingProposer.ROUND_SIZE());

    // Execute the slash
    slashingProposer.executeRound(firstSlashingRound, committees);

    // Verify that slashing was successful and validators are kicked out
    assertEq(
      rollup.getActiveAttesterCount(),
      VALIDATOR_COUNT - howManyToSlash,
      "Validators should no longer be active after large slash"
    );
  }
}
