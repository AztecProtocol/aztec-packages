// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

// solhint-disable func-name-mixedcase
// solhint-disable comprehensive-interface

import {Test} from "forge-std/Test.sol";
import {Rollup} from "@aztec/core/Rollup.sol";
import {IRollupCore} from "@aztec/core/interfaces/IRollup.sol";
import {RollupBuilder} from "@test/builder/RollupBuilder.sol";
import {Ownable} from "@oz/access/Ownable.sol";
import {TableCalculator, ListCalculator} from "@test/mock/SequencerRewardCalculatorMocks.sol";
import {RollupBase, IInstance} from "@test/base/RollupBase.sol";
import {DecoderBase} from "@test/base/DecoderBase.sol";
import {TestConstants} from "@test/harnesses/TestConstants.sol";
import {Inbox} from "@aztec/core/messagebridge/Inbox.sol";
import {MerkleTestUtil} from "@test/merkle/TestUtil.sol";
import {ISequencerRewardCalculator} from "@aztec/core/interfaces/ISequencerRewardCalculator.sol";
import {RewardConfig, BpsLib} from "@aztec/core/libraries/rollup/RewardLib.sol";
import {Timestamp, Slot, Epoch, TimeLib} from "@aztec/core/libraries/TimeLib.sol";

/// @notice The rollup's sequencer reward calculator configuration: constructor value, owner-only setter and getter.
contract SequencerRewardCalculatorConfigTest is Test {
  Rollup internal rollup;

  function setUp() public {
    rollup = new RollupBuilder(address(this)).deploy().getConfig().rollup;
  }

  function test_DefaultsToNoCalculator() external view {
    assertEq(rollup.getSequencerRewardCalculator(), address(0));
  }

  function test_ConstructorSetsTheInitialCalculator() external {
    address calculator = address(new TableCalculator());
    Rollup withCalculator =
    new RollupBuilder(address(this)).setSequencerRewardCalculator(calculator).deploy().getConfig().rollup;
    assertEq(withCalculator.getSequencerRewardCalculator(), calculator);
  }

  function test_RevertWhen_CallerIsNotTheOwner(address _caller, address _calculator) external {
    vm.assume(_caller != rollup.owner());
    vm.prank(_caller);
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, _caller));
    rollup.setSequencerRewardCalculator(_calculator);
    assertEq(rollup.getSequencerRewardCalculator(), address(0));
  }

  function test_OwnerSetsAndClearsTheCalculator() external {
    address owner = rollup.owner();
    address first = address(new TableCalculator());
    address second = makeAddr("second");

    vm.expectEmit(true, true, true, true, address(rollup));
    emit IRollupCore.SequencerRewardCalculatorUpdated(address(0), first);
    vm.prank(owner);
    rollup.setSequencerRewardCalculator(first);
    assertEq(rollup.getSequencerRewardCalculator(), first);

    vm.expectEmit(true, true, true, true, address(rollup));
    emit IRollupCore.SequencerRewardCalculatorUpdated(first, second);
    vm.prank(owner);
    rollup.setSequencerRewardCalculator(second);
    assertEq(rollup.getSequencerRewardCalculator(), second);

    // The zero address is accepted and disables the calculator.
    vm.expectEmit(true, true, true, true, address(rollup));
    emit IRollupCore.SequencerRewardCalculatorUpdated(second, address(0));
    vm.prank(owner);
    rollup.setSequencerRewardCalculator(address(0));
    assertEq(rollup.getSequencerRewardCalculator(), address(0));
  }

  function test_SetterHasNoCooldown() external {
    address owner = rollup.owner();
    for (uint256 i = 1; i <= 3; i++) {
      address calculator = address(uint160(i));
      vm.prank(owner);
      rollup.setSequencerRewardCalculator(calculator);
      assertEq(rollup.getSequencerRewardCalculator(), calculator);
    }
  }
}

/**
 * @notice A rollup with a zero-size target committee proves epochs without a committee, so it never consults the
 *         sequencer reward calculator and pays the default, even when the calculator would answer with well-formed
 *         non-default rewards.
 */
contract SequencerRewardCalculatorEmptyCommitteeTest is RollupBase {
  uint256 internal constant PREMIUM = 1234e18;

  ListCalculator internal calculator;

  constructor() {
    TimeLib.initialize(
      block.timestamp,
      TestConstants.AZTEC_SLOT_DURATION,
      TestConstants.AZTEC_EPOCH_DURATION,
      TestConstants.AZTEC_PROOF_SUBMISSION_EPOCHS,
      TestConstants.ETHEREUM_SLOT_DURATION
    );
  }

  function setUp() public {
    DecoderBase.Full memory full = load("mixed_checkpoint_1");
    uint256 slotNumber = Slot.unwrap(full.checkpoint.header.slotNumber);
    vm.warp(Timestamp.unwrap(full.checkpoint.header.timestamp) - slotNumber * TestConstants.AZTEC_SLOT_DURATION);

    RollupBuilder builder = new RollupBuilder(address(this)).setTargetCommitteeSize(0);
    builder.deploy();
    rollup = IInstance(address(builder.getConfig().rollup));
    inbox = Inbox(address(rollup.getInbox()));
    merkleTestUtil = new MerkleTestUtil();

    uint256[] memory values = new uint256[](2);
    values[0] = PREMIUM;
    values[1] = PREMIUM / 3;
    calculator = new ListCalculator(values);
  }

  function test_EmptyCommitteeNeverCallsTheCalculatorAndPaysTheDefaults() external {
    assertEq(rollup.getTargetCommitteeSize(), 0);

    _proposeCheckpoint("mixed_checkpoint_1", 1);
    _proposeCheckpoint("mixed_checkpoint_2", 2);
    address coinbase1 = proposedHeaders[1].coinbase;
    address coinbase2 = proposedHeaders[2].coinbase;

    RewardConfig memory config = rollup.getRewardConfig();
    uint256 defaultReward = BpsLib.mul(config.checkpointReward, config.sequencerBps);
    assertGt(defaultReward, 0, "default reward must be non-zero");

    // The calculator would be accepted and pay non-default values if the rollup consulted it.
    uint256[] memory answer = calculator.getSequencerRewards(Epoch.wrap(0), new address[](2), defaultReward, 0);
    assertEq(answer.length, 2);
    assertTrue(answer[0] != defaultReward && answer[1] != defaultReward, "calculator must pay non-default values");

    uint256 snapshot = vm.snapshotState();
    _proveCheckpoints("mixed_checkpoint_", 1, 2, address(this));
    uint256 withoutCalculator1 = rollup.getSequencerRewards(coinbase1);
    uint256 withoutCalculator2 = rollup.getSequencerRewards(coinbase2);
    uint256 proverWithoutCalculator = rollup.getCollectiveProverRewardsForEpoch(Epoch.wrap(0));
    vm.revertToState(snapshot);

    vm.prank(Ownable(address(rollup)).owner());
    rollup.setSequencerRewardCalculator(address(calculator));

    vm.expectCall(
      address(calculator), abi.encodeWithSelector(ISequencerRewardCalculator.getSequencerRewards.selector), 0
    );
    _proveCheckpoints("mixed_checkpoint_", 1, 2, address(this));

    assertEq(rollup.getProvenCheckpointNumber(), 2);
    assertEq(rollup.getSequencerRewards(coinbase1), withoutCalculator1, "default not paid to the first coinbase");
    assertEq(rollup.getSequencerRewards(coinbase2), withoutCalculator2, "default not paid to the second coinbase");
    assertEq(rollup.getCollectiveProverRewardsForEpoch(Epoch.wrap(0)), proverWithoutCalculator, "prover share moved");
    assertGe(withoutCalculator1, defaultReward, "first coinbase missing its default");
  }
}
