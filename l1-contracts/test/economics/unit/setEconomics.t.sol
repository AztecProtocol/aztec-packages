// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

import {DecoderBase} from "../../base/DecoderBase.sol";
import {RollupBase, IInstance} from "../../base/RollupBase.sol";
import {RollupBuilder} from "../../builder/RollupBuilder.sol";
import {IEconomicsCore} from "@aztec/core/interfaces/IEconomicsCore.sol";
import {IRollupCore} from "@aztec/core/interfaces/IRollup.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {TestConstants} from "../../harnesses/TestConstants.sol";
import {DummyEconomics} from "./harnesses/DummyEconomics.sol";
import {Ownable} from "@oz/access/Ownable.sol";
import {Epoch, Slot, TimeLib, Timestamp} from "@aztec/core/libraries/TimeLib.sol";

contract SetEconomicsTest is RollupBase {
  using TimeLib for Timestamp;

  uint256 internal constant SLOT_DURATION = TestConstants.AZTEC_SLOT_DURATION;

  TestERC20 internal testERC20;
  IEconomicsCore internal oldEconomics;
  IEconomicsCore internal replacementEconomics;
  address internal owner;
  Epoch internal currentEpoch;
  Epoch internal activationEpoch;
  DummyEconomics.TimingConfig internal timingConfig;

  function setUp() public {
    _setUpFor("empty_checkpoint_1");
    owner = Ownable(address(rollup)).owner();
    oldEconomics = rollup.getEconomics();
    currentEpoch = rollup.getCurrentEpoch();
    activationEpoch = currentEpoch + Epoch.wrap(1);
  }

  function test_WhenEconomicsIsAddressZero() external {
    vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__InvalidEconomics.selector, address(0)));

    vm.prank(owner);
    rollup.setEconomics(IEconomicsCore(address(0)));
  }

  modifier whenEconomicsIsNotAddressZero() {
    timingConfig = _timeConfig(rollup);
    replacementEconomics = new DummyEconomics(address(rollup), testERC20, timingConfig);
    _;
  }

  function test_WhenEconomicsRollupDiffersFromTheRollup() external whenEconomicsIsNotAddressZero {
    replacementEconomics = new DummyEconomics(address(0xdead), testERC20, timingConfig);

    vm.expectRevert(
      abi.encodeWithSelector(Errors.Rollup__InvalidEconomicsRollup.selector, address(rollup), address(0xdead))
    );

    vm.prank(owner);
    rollup.setEconomics(replacementEconomics);
  }

  modifier whenEconomicsRollupMatchesTheRollup() {
    _;
  }

  function test_WhenEconomicsFeeAssetDiffersFromTheRollupFeeAsset()
    external
    whenEconomicsIsNotAddressZero
    whenEconomicsRollupMatchesTheRollup
  {
    TestERC20 otherAsset = new TestERC20("Other Fee Asset", "OFEE", address(this));
    replacementEconomics = new DummyEconomics(address(rollup), otherAsset, timingConfig);

    vm.expectRevert(
      abi.encodeWithSelector(Errors.Rollup__InvalidEconomicsFeeAsset.selector, address(testERC20), address(otherAsset))
    );

    vm.prank(owner);
    rollup.setEconomics(replacementEconomics);
  }

  modifier whenEconomicsFeeAssetMatchesTheRollupFeeAsset() {
    _;
  }

  function test_WhenEconomicsGenesisTimeDiffersFromTheRollupGenesisTime()
    external
    whenEconomicsIsNotAddressZero
    whenEconomicsRollupMatchesTheRollup
    whenEconomicsFeeAssetMatchesTheRollupFeeAsset
  {
    timingConfig.genesisTime = Timestamp.wrap(Timestamp.unwrap(timingConfig.genesisTime) + 1);
    replacementEconomics = new DummyEconomics(address(rollup), testERC20, timingConfig);

    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.Rollup__InvalidEconomicsGenesisTime.selector, rollup.getGenesisTime(), timingConfig.genesisTime
      )
    );

    vm.prank(owner);
    rollup.setEconomics(replacementEconomics);
  }

  modifier whenEconomicsGenesisTimeMatchesTheRollupGenesisTime() {
    _;
  }

  function test_WhenEconomicsSlotDurationDiffersFromTheRollupSlotDuration()
    external
    whenEconomicsIsNotAddressZero
    whenEconomicsRollupMatchesTheRollup
    whenEconomicsFeeAssetMatchesTheRollupFeeAsset
    whenEconomicsGenesisTimeMatchesTheRollupGenesisTime
  {
    timingConfig.slotDuration += 1;
    replacementEconomics = new DummyEconomics(address(rollup), testERC20, timingConfig);

    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.Rollup__InvalidEconomicsSlotDuration.selector, rollup.getSlotDuration(), timingConfig.slotDuration
      )
    );

    vm.prank(owner);
    rollup.setEconomics(replacementEconomics);
  }

  modifier whenEconomicsSlotDurationMatchesTheRollupSlotDuration() {
    _;
  }

  function test_WhenEconomicsEpochDurationDiffersFromTheRollupEpochDuration()
    external
    whenEconomicsIsNotAddressZero
    whenEconomicsRollupMatchesTheRollup
    whenEconomicsFeeAssetMatchesTheRollupFeeAsset
    whenEconomicsGenesisTimeMatchesTheRollupGenesisTime
    whenEconomicsSlotDurationMatchesTheRollupSlotDuration
  {
    timingConfig.epochDuration += 1;
    replacementEconomics = new DummyEconomics(address(rollup), testERC20, timingConfig);

    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.Rollup__InvalidEconomicsEpochDuration.selector, rollup.getEpochDuration(), timingConfig.epochDuration
      )
    );

    vm.prank(owner);
    rollup.setEconomics(replacementEconomics);
  }

  modifier whenEconomicsEpochDurationMatchesTheRollupEpochDuration() {
    _;
  }

  function test_WhenEconomicsProofSubmissionEpochsDifferFromTheRollup()
    external
    whenEconomicsIsNotAddressZero
    whenEconomicsRollupMatchesTheRollup
    whenEconomicsFeeAssetMatchesTheRollupFeeAsset
    whenEconomicsGenesisTimeMatchesTheRollupGenesisTime
    whenEconomicsSlotDurationMatchesTheRollupSlotDuration
    whenEconomicsEpochDurationMatchesTheRollupEpochDuration
  {
    timingConfig.proofSubmissionEpochs += 1;
    replacementEconomics = new DummyEconomics(address(rollup), testERC20, timingConfig);

    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.Rollup__InvalidEconomicsProofSubmissionEpochs.selector,
        rollup.getProofSubmissionEpochs(),
        timingConfig.proofSubmissionEpochs
      )
    );

    vm.prank(owner);
    rollup.setEconomics(replacementEconomics);
  }

  modifier whenEconomicsProofSubmissionEpochsMatchTheRollup() {
    _;
  }

  function test_WhenSchedulingAValidReplacement()
    external
    whenEconomicsIsNotAddressZero
    whenEconomicsRollupMatchesTheRollup
    whenEconomicsFeeAssetMatchesTheRollupFeeAsset
    whenEconomicsGenesisTimeMatchesTheRollupGenesisTime
    whenEconomicsSlotDurationMatchesTheRollupSlotDuration
    whenEconomicsEpochDurationMatchesTheRollupEpochDuration
    whenEconomicsProofSubmissionEpochsMatchTheRollup
  {
    vm.expectEmit(true, true, true, true, address(rollup));
    emit IRollupCore.EconomicsUpdated(address(oldEconomics), address(replacementEconomics), activationEpoch);

    vm.prank(owner);
    rollup.setEconomics(replacementEconomics);

    assertEq(address(rollup.getEconomics()), address(replacementEconomics), "latest scheduled economics");
    assertEq(address(rollup.getEconomicsForEpoch(currentEpoch)), address(oldEconomics), "current epoch economics");
    assertEq(
      address(rollup.getEconomicsForEpoch(activationEpoch)), address(replacementEconomics), "activation epoch economics"
    );
  }

  modifier whenThePendingChainIsStillUnproven() {
    _proposeCheckpoint("empty_checkpoint_1", 1);
    _;
  }

  function test_WhenThePendingChainIsStillUnproven()
    external
    whenEconomicsIsNotAddressZero
    whenEconomicsRollupMatchesTheRollup
    whenEconomicsFeeAssetMatchesTheRollupFeeAsset
    whenEconomicsGenesisTimeMatchesTheRollupGenesisTime
    whenEconomicsSlotDurationMatchesTheRollupSlotDuration
    whenEconomicsEpochDurationMatchesTheRollupEpochDuration
    whenEconomicsProofSubmissionEpochsMatchTheRollup
    whenThePendingChainIsStillUnproven
  {
    vm.prank(owner);
    rollup.setEconomics(replacementEconomics);

    assertEq(address(rollup.getEconomicsForEpoch(currentEpoch)), address(oldEconomics), "current epoch unchanged");
    assertEq(
      address(rollup.getEconomicsForEpoch(activationEpoch)), address(replacementEconomics), "scheduled economics"
    );
  }

  function test_WhenCalledMultipleTimesForTheSameActivationEpoch()
    external
    whenEconomicsIsNotAddressZero
    whenEconomicsRollupMatchesTheRollup
    whenEconomicsFeeAssetMatchesTheRollupFeeAsset
    whenEconomicsGenesisTimeMatchesTheRollupGenesisTime
    whenEconomicsSlotDurationMatchesTheRollupSlotDuration
    whenEconomicsEpochDurationMatchesTheRollupEpochDuration
    whenEconomicsProofSubmissionEpochsMatchTheRollup
  {
    IEconomicsCore firstReplacement = replacementEconomics;
    IEconomicsCore secondReplacement = new DummyEconomics(address(rollup), testERC20, timingConfig);

    vm.prank(owner);
    rollup.setEconomics(firstReplacement);
    vm.prank(owner);
    rollup.setEconomics(secondReplacement);

    assertEq(address(rollup.getEconomics()), address(secondReplacement), "latest scheduled economics");
    assertEq(address(rollup.getEconomicsForEpoch(currentEpoch)), address(oldEconomics), "current epoch unchanged");
    assertEq(address(rollup.getEconomicsForEpoch(activationEpoch)), address(secondReplacement), "overwritten schedule");
  }

  function _setUpFor(string memory _name) internal {
    DecoderBase.Full memory full = load(_name);
    uint256 slotNumber = Slot.unwrap(full.checkpoint.header.slotNumber);
    uint256 initialTime = Timestamp.unwrap(full.checkpoint.header.timestamp) - slotNumber * SLOT_DURATION;
    vm.warp(initialTime);

    TimeLib.initialize(
      block.timestamp,
      TestConstants.AZTEC_SLOT_DURATION,
      TestConstants.AZTEC_EPOCH_DURATION,
      TestConstants.AZTEC_PROOF_SUBMISSION_EPOCHS
    );

    RollupBuilder builder = new RollupBuilder(address(this)).setTargetCommitteeSize(0);
    builder.deploy();

    rollup = IInstance(address(builder.getConfig().rollup));
    testERC20 = builder.getConfig().testERC20;
  }

  function _timeConfig(IInstance _rollup) internal view returns (DummyEconomics.TimingConfig memory) {
    return DummyEconomics.TimingConfig({
      genesisTime: _rollup.getGenesisTime(),
      slotDuration: _rollup.getSlotDuration(),
      epochDuration: _rollup.getEpochDuration(),
      proofSubmissionEpochs: _rollup.getProofSubmissionEpochs()
    });
  }
}
