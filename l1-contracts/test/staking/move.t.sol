// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {StakingBase} from "./base.t.sol";
import {IStakingCore, Status, AttesterView} from "@aztec/core/interfaces/IStaking.sol";
import {GSE} from "@aztec/governance/GSE.sol";
import {Timestamp, Epoch, Slot} from "@aztec/core/libraries/TimeLib.sol";
import {RollupBuilder} from "../builder/RollupBuilder.sol";
import {IInstance} from "@aztec/core/interfaces/IInstance.sol";
import {Math} from "@oz/utils/math/Math.sol";
import {RollupConfigInput} from "@aztec/core/interfaces/IRollup.sol";
import {IStaking} from "@aztec/core/interfaces/IStaking.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {console} from "forge-std/console.sol";
import {StakingQueueConfig} from "@aztec/core/libraries/StakingQueue.sol";
import {TestConstants} from "../harnesses/TestConstants.sol";

contract MoveTest is StakingBase {
  GSE internal gse;

  uint256 internal n;

  // override the setUp to set the entry queue flush size to n
  function setUp() public override {
    // We add n validators. n/2 to the specific and the rest to the canonical one
    // Should be MORE than 2*48 to ensure that we will end up with enough to sample
    // on either rollup.
    n = 101;

    StakingQueueConfig memory stakingQueueConfig = TestConstants.getStakingQueueConfig();
    stakingQueueConfig.normalFlushSizeMin = n;

    RollupBuilder builder = new RollupBuilder(address(this)).setSlashingQuorum(1)
      .setSlashingRoundSize(1).setStakingQueueConfig(stakingQueueConfig);
    builder.deploy();

    registry = builder.getConfig().registry;

    RollupConfigInput memory rollupConfig = builder.getConfig().rollupConfigInput;

    EPOCH_DURATION_SECONDS = rollupConfig.aztecEpochDuration * rollupConfig.aztecSlotDuration;

    staking = IStaking(address(builder.getConfig().rollup));
    stakingAsset = builder.getConfig().testERC20;

    DEPOSIT_AMOUNT = staking.getDepositAmount();
    MINIMUM_STAKE = staking.getMinimumStake();
    SLASHER = staking.getSlasher();
  }

  function test_MoveStakingSet() external {
    // This test "moves" the staking set for "canonical" as a new rollup is made canonical
    gse = staking.getGSE();

    StakingQueueConfig memory stakingQueueConfig = TestConstants.getStakingQueueConfig();
    stakingQueueConfig.normalFlushSizeMin = n;

    RollupBuilder builder = new RollupBuilder(address(this)).setGSE(gse).setTestERC20(stakingAsset)
      .setRegistry(registry).setMakeCanonical(false).setMakeGovernance(false).setUpdateOwnerships(
      false
    ).setStakingQueueConfig(stakingQueueConfig).deploy();

    IInstance oldRollup = IInstance(address(staking));
    IInstance newRollup = IInstance(address(builder.getConfig().rollup));

    stakingAsset.mint(address(this), DEPOSIT_AMOUNT * n);
    stakingAsset.approve(address(oldRollup), DEPOSIT_AMOUNT * n);

    for (uint256 i = 0; i < n; i++) {
      bool onCanonical = i % 2 == 0;

      oldRollup.deposit({
        _attester: address(uint160(i + 1000)),
        _withdrawer: WITHDRAWER,
        _onCanonical: onCanonical
      });
    }
    oldRollup.flushEntryQueue();

    Epoch epoch = Epoch.wrap(5);
    Timestamp ts =
      newRollup.getTimestampForSlot(Slot.wrap(Epoch.unwrap(epoch) * newRollup.getEpochDuration()));

    assertEq(gse.getAttesterCountAtTime(address(oldRollup), Timestamp.wrap(block.timestamp)), n);
    assertEq(gse.getAttesterCountAtTime(address(newRollup), Timestamp.wrap(block.timestamp)), 0);

    assertEq(oldRollup.getEpochCommittee(epoch).length, oldRollup.getTargetCommitteeSize());
    console.log("oldRollup.getTargetCommitteeSize()", oldRollup.getTargetCommitteeSize());

    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.ValidatorSelection__InsufficientCommitteeSize.selector,
        0,
        newRollup.getTargetCommitteeSize()
      )
    );
    newRollup.getEpochCommittee(epoch);

    // Jump to epoch and add the rollup.
    vm.warp(Timestamp.unwrap(ts));
    vm.prank(gse.owner());
    gse.addRollup(address(newRollup));

    // Look at the data "right now", see that half have been moved
    assertEq(gse.getAttesterCountAtTime(address(oldRollup), Timestamp.wrap(block.timestamp)), n / 2);
    assertEq(
      gse.getAttesterCountAtTime(address(newRollup), Timestamp.wrap(block.timestamp)), n - n / 2
    );

    // When we look at the committee for that epoch, the setup "depends" on how far in the past we "lock-in"
    // the committee. So for good measure, we will first check at the epoch and then add another 100.
    // That should plenty for the lookup
    assertEq(oldRollup.getEpochCommittee(epoch).length, oldRollup.getTargetCommitteeSize());
    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.ValidatorSelection__InsufficientCommitteeSize.selector,
        0,
        newRollup.getTargetCommitteeSize()
      )
    );
    newRollup.getEpochCommittee(epoch);

    Epoch epoch2 = epoch + Epoch.wrap(100);

    {
      address[] memory committee = oldRollup.getEpochCommittee(epoch2);
      assertEq(committee.length, Math.min(n / 2, oldRollup.getTargetCommitteeSize()));
      for (uint256 i = 0; i < committee.length; i++) {
        require(uint160(committee[i]) % 2 == 1, "wrong attester old");
      }
    }

    {
      address[] memory committee = newRollup.getEpochCommittee(epoch2);
      assertEq(committee.length, Math.min(n - n / 2, newRollup.getTargetCommitteeSize()));
      for (uint256 i = 0; i < committee.length; i++) {
        require(uint160(committee[i]) % 2 == 0, "wrong attester");
      }
    }

    // Check that non-moved are still validating on the old and none on the new.
    assertEq(uint256(Status.VALIDATING), uint256(oldRollup.getStatus(address(uint160(1001)))));
    assertEq(uint256(Status.NONE), uint256(newRollup.getStatus(address(uint160(1001)))));

    // Check that withdrawer of a moved attester can exit from the new rollup.
    address attesterToExit = address(uint160(1000));

    AttesterView memory attesterView = newRollup.getAttesterView(attesterToExit);
    assertEq(uint256(attesterView.status), uint256(Status.VALIDATING), "wrong status");
    assertEq(attesterView.exit.exitableAt, Timestamp.wrap(0));
    assertEq(attesterView.exit.exists, false);
    assertEq(attesterView.exit.isRecipient, false);
    assertEq(attesterView.exit.amount, 0);
    assertEq(attesterView.exit.recipientOrWithdrawer, address(0));

    vm.prank(WITHDRAWER);
    newRollup.initiateWithdraw(attesterToExit, RECIPIENT);

    attesterView = newRollup.getAttesterView(attesterToExit);
    assertEq(attesterView.exit.exists, true);
    assertEq(attesterView.exit.isRecipient, true);
    assertEq(
      attesterView.exit.exitableAt, Timestamp.wrap(block.timestamp) + newRollup.getExitDelay()
    );
    assertEq(attesterView.exit.recipientOrWithdrawer, RECIPIENT);
    assertTrue(attesterView.status == Status.EXITING);

    vm.warp(Timestamp.unwrap(attesterView.exit.exitableAt));

    vm.expectEmit(true, true, true, true, address(newRollup));
    emit IStakingCore.WithdrawFinalised(attesterToExit, RECIPIENT, DEPOSIT_AMOUNT);
    newRollup.finaliseWithdraw(attesterToExit);

    attesterView = newRollup.getAttesterView(attesterToExit);
    assertEq(attesterView.exit.recipientOrWithdrawer, address(0));
    assertEq(attesterView.exit.exitableAt, Timestamp.wrap(0));
    assertTrue(attesterView.status == Status.NONE);

    assertEq(stakingAsset.balanceOf(address(newRollup)), 0);
    assertEq(stakingAsset.balanceOf(RECIPIENT), DEPOSIT_AMOUNT);
  }
}
