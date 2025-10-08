// SPDX-License-Identifier: UNLICENSED
// solhint-disable imports-order
pragma solidity >=0.8.27;

import {Rollup} from "@aztec/core/Rollup.sol";
import {IValidatorSelection} from "@aztec/core/interfaces/IValidatorSelection.sol";
import {Slot, Epoch} from "@aztec/core/libraries/TimeLib.sol";
import {Slasher, IPayload} from "@aztec/core/slashing/Slasher.sol";
import {EmpireSlashingProposer} from "@aztec/core/slashing/EmpireSlashingProposer.sol";
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

import {EmpireSlashingProposer} from "@aztec/core/slashing/EmpireSlashingProposer.sol";

import {Slot, Epoch} from "@aztec/core/libraries/TimeLib.sol";
import {TimeCheater} from "../../../staking/TimeCheater.sol";
import {MultiAdder, CheatDepositArgs} from "@aztec/mock/MultiAdder.sol";
import {RollupBuilder} from "../../../builder/RollupBuilder.sol";
import {BN254Lib, G1Point, G2Point} from "@aztec/shared/libraries/BN254Lib.sol";

// solhint-disable comprehensive-interface
// solhint-disable func-name-mixedcase

contract SlashingTest is TestBase {
  TestERC20 internal testERC20;
  RewardDistributor internal rewardDistributor;
  Rollup internal rollup;
  Slasher internal slasher;
  SlashFactory internal slashFactory;
  EmpireSlashingProposer internal slashingProposer;
  TimeCheater internal timeCheater;

  function _createPayloadAndSignalForSlashing(address[] memory _attesters, uint96 _slashAmount, uint256 _howMany)
    internal
    returns (uint256, IPayload)
  {
    // Lets make a proposal to slash! For
    // We jump to perfectly land at the start of the next round
    uint256 desiredSlot = (slashingProposer.getCurrentRound() + 1) * slashingProposer.ROUND_SIZE();

    timeCheater.cheat__jumpToSlot(desiredSlot);
    uint256 round = slashingProposer.getCurrentRound();

    address[] memory offenders = new address[](_howMany);
    uint96[] memory amounts = new uint96[](_howMany);
    uint128[][] memory offenses = new uint128[][](_howMany);
    for (uint256 i = 0; i < _howMany; i++) {
      offenders[i] = _attesters[i];
      amounts[i] = _slashAmount;
      offenses[i] = new uint128[](0); // Empty array of offenses for each validator
    }

    IPayload payload = slashFactory.createSlashPayload(offenders, amounts, offenses);

    for (uint256 i = 0; i < 10; i++) {
      address proposer = rollup.getCurrentProposer();
      vm.prank(proposer);
      slashingProposer.signal(payload);
      timeCheater.cheat__progressSlot();
    }

    return (round, payload);
  }

  function _setupCommitteeForSlashing() internal {
    _setupCommitteeForSlashing(
      TestConstants.AZTEC_SLASHING_LIFETIME_IN_ROUNDS, TestConstants.AZTEC_SLASHING_EXECUTION_DELAY_IN_ROUNDS
    );
  }

  function _setupCommitteeForSlashing(uint256 _slashingLifetimeInRounds, uint256 _slashingExecutionDelayInRounds)
    internal
  {
    uint256 validatorCount = 4;

    CheatDepositArgs[] memory initialValidators = new CheatDepositArgs[](validatorCount);

    for (uint256 i = 1; i < validatorCount + 1; i++) {
      uint256 attesterPrivateKey = uint256(keccak256(abi.encode("attester", i)));
      address attester = vm.addr(attesterPrivateKey);

      initialValidators[i - 1] = CheatDepositArgs({
        attester: attester,
        withdrawer: address(this),
        publicKeyInG1: BN254Lib.g1Zero(),
        publicKeyInG2: BN254Lib.g2Zero(),
        proofOfPossession: BN254Lib.g1Zero()
      });
    }

    RollupBuilder builder = new RollupBuilder(address(this)).setValidators(initialValidators).setTargetCommitteeSize(4)
      .setSlashingLifetimeInRounds(_slashingLifetimeInRounds).setSlashingExecutionDelayInRounds(
      _slashingExecutionDelayInRounds
    );
    builder.deploy();

    rollup = builder.getConfig().rollup;
    testERC20 = builder.getConfig().testERC20;

    slasher = Slasher(rollup.getSlasher());
    slashingProposer = EmpireSlashingProposer(slasher.PROPOSER());
    slashFactory = new SlashFactory(IValidatorSelection(address(rollup)));

    timeCheater = new TimeCheater(
      address(rollup),
      block.timestamp,
      TestConstants.AZTEC_SLOT_DURATION,
      TestConstants.AZTEC_EPOCH_DURATION,
      TestConstants.AZTEC_PROOF_SUBMISSION_EPOCHS
    );

    // We jump forward 2 epochs because there is nothing interesting happening in the first epochs
    // as our sampling is delayed zzz.
    timeCheater.cheat__jumpForwardEpochs(2);

    assertEq(rollup.getActiveAttesterCount(), validatorCount, "Invalid attester count");
  }

  function test_CannotSlashBeforeDelay(uint256 _lifetimeInRounds, uint256 _executionDelayInRounds, uint256 _jumpToSlot)
    public
  {
    _executionDelayInRounds = bound(_executionDelayInRounds, 1, 1e3);
    _lifetimeInRounds = bound(_lifetimeInRounds, _executionDelayInRounds + 1, 1e4);

    _setupCommitteeForSlashing(_lifetimeInRounds, _executionDelayInRounds);
    address[] memory attesters = rollup.getEpochCommittee(Epoch.wrap(2));
    uint96 slashAmount = 10e18;
    (uint256 firstSlashingRound,) = _createPayloadAndSignalForSlashing(attesters, slashAmount, attesters.length);

    uint256 firstExecutableSlot = (firstSlashingRound + _executionDelayInRounds + 1) * slashingProposer.ROUND_SIZE();
    _jumpToSlot = bound(_jumpToSlot, timeCheater.currentSlot(), firstExecutableSlot - 1);

    timeCheater.cheat__jumpToSlot(_jumpToSlot);

    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.EmpireBase__RoundTooNew.selector, firstSlashingRound, slashingProposer.getCurrentRound()
      )
    );
    slashingProposer.submitRoundWinner(firstSlashingRound);
  }

  function test_CanSlashAfterDelay(uint256 _lifetimeInRounds, uint256 _executionDelayInRounds, uint256 _jumpToSlot)
    public
  {
    _executionDelayInRounds = bound(_executionDelayInRounds, 1, 1e3);
    _lifetimeInRounds = bound(_lifetimeInRounds, _executionDelayInRounds + 1, 1e4);

    _setupCommitteeForSlashing(_lifetimeInRounds, _executionDelayInRounds);
    address[] memory attesters = rollup.getEpochCommittee(Epoch.wrap(2));
    uint96 slashAmount = 10e18;
    (uint256 firstSlashingRound,) = _createPayloadAndSignalForSlashing(attesters, slashAmount, attesters.length);

    uint256 firstExecutableSlot = (firstSlashingRound + _executionDelayInRounds + 1) * slashingProposer.ROUND_SIZE();
    uint256 lastExecutableSlot = (firstSlashingRound + _lifetimeInRounds) * slashingProposer.ROUND_SIZE();
    _jumpToSlot = bound(_jumpToSlot, firstExecutableSlot, lastExecutableSlot);

    timeCheater.cheat__jumpToSlot(_jumpToSlot);
    uint256[] memory stakes = new uint256[](attesters.length);
    for (uint256 i = 0; i < attesters.length; i++) {
      AttesterView memory attesterView = rollup.getAttesterView(attesters[i]);
      stakes[i] = attesterView.effectiveBalance;
      assertTrue(attesterView.status == Status.VALIDATING, "Invalid status");
    }
    slashingProposer.submitRoundWinner(firstSlashingRound);

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
    _executionDelayInRounds = bound(_executionDelayInRounds, 1, 1e3);
    _lifetimeInRounds = bound(_lifetimeInRounds, _executionDelayInRounds + 1, 1e4);

    _setupCommitteeForSlashing(_lifetimeInRounds, _executionDelayInRounds);
    address[] memory attesters = rollup.getEpochCommittee(Epoch.wrap(2));
    uint96 slashAmount = 10e18;
    (uint256 firstSlashingRound, IPayload payload) =
      _createPayloadAndSignalForSlashing(attesters, slashAmount, attesters.length);

    vm.prank(address(slasher.VETOER()));
    slasher.vetoPayload(payload);

    uint256 firstExecutableSlot = (firstSlashingRound + _executionDelayInRounds + 1) * slashingProposer.ROUND_SIZE();
    uint256 lastExecutableSlot = (firstSlashingRound + _lifetimeInRounds) * slashingProposer.ROUND_SIZE();
    _jumpToSlot = bound(_jumpToSlot, firstExecutableSlot, lastExecutableSlot);

    timeCheater.cheat__jumpToSlot(_jumpToSlot);

    vm.expectRevert(abi.encodeWithSelector(Slasher.Slasher__PayloadVetoed.selector, address(payload)));
    slashingProposer.submitRoundWinner(firstSlashingRound);
  }

  function test_Slashing() public {
    _setupCommitteeForSlashing();
    uint256 howManyToSlash = 4;

    address[] memory attesters = rollup.getEpochCommittee(Epoch.wrap(2));
    uint256[] memory stakes = new uint256[](attesters.length);
    for (uint256 i = 0; i < attesters.length; i++) {
      AttesterView memory attesterView = rollup.getAttesterView(attesters[i]);
      stakes[i] = attesterView.effectiveBalance;
      assertTrue(attesterView.status == Status.VALIDATING, "Invalid status");
    }

    // We slash a small amount and see that they are all still validating, but less stake
    uint96 slashAmount1 = 10e18;
    (uint256 firstSlashingRound,) = _createPayloadAndSignalForSlashing(attesters, slashAmount1, howManyToSlash);
    slashingProposer.submitRoundWinner(firstSlashingRound);

    for (uint256 i = 0; i < howManyToSlash; i++) {
      AttesterView memory attesterView = rollup.getAttesterView(attesters[i]);
      assertEq(attesterView.effectiveBalance, stakes[i] - slashAmount1);
      assertEq(attesterView.exit.amount, 0, "Invalid stake");
      assertTrue(attesterView.status == Status.VALIDATING, "Invalid status");
    }

    // Now we do it all again, but this time enough to kick them out of the system!
    // Why we doing it in two steps explicitly here? To make sure that it is clear
    // that it works like this.
    uint96 slashAmount2 = 40e18 + 1;
    (uint256 secondSlashingRound,) = _createPayloadAndSignalForSlashing(attesters, slashAmount2, howManyToSlash);
    slashingProposer.submitRoundWinner(secondSlashingRound);

    for (uint256 i = 0; i < howManyToSlash; i++) {
      AttesterView memory attesterView = rollup.getAttesterView(attesters[i]);
      assertEq(attesterView.effectiveBalance, 0);
      assertEq(attesterView.exit.amount, stakes[i] - slashAmount1 - slashAmount2, "Invalid stake");
      assertTrue(attesterView.status == Status.ZOMBIE, "Invalid status");
    }
  }
}
