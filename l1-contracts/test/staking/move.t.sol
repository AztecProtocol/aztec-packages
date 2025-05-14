// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {StakingBase} from "./base.t.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {IERC20Errors} from "@oz/interfaces/draft-IERC6093.sol";
import {IStakingCore, Status, FullStatus} from "@aztec/core/interfaces/IStaking.sol";
import {GSE} from "@aztec/core/staking/GSE.sol";
import {Timestamp, Epoch, Slot} from "@aztec/core/libraries/TimeLib.sol";
import {RollupBuilder} from "../builder/RollupBuilder.sol";
import {IInstance} from "@aztec/core/interfaces/IInstance.sol";
import {Math} from "@oz/utils/math/Math.sol";

contract MoveTest is StakingBase {
  GSE internal gse;

  /// forge-config: default.isolate = true
  function test_MoveStakingSet() external {
    // This test "moves" the staking set for "canonical" as a new rollup is made canonical
    gse = staking.getGSE();

    RollupBuilder builder = new RollupBuilder(address(this)).setGSE(gse).setTestERC20(stakingAsset)
      .setRegistry(registry).setMakeCanonical(false).deploy();

    IInstance oldRollup = IInstance(address(staking));
    IInstance newRollup = IInstance(address(builder.getConfig().rollup));

    // We add n validators. n/2 to the specific and the rest to the canonical one
    // Should be MORE thank 2*48 to ensure that we will end up with enough to sample
    // on either rollup.
    uint256 n = 101;

    stakingAsset.mint(address(this), MINIMUM_STAKE * n);
    stakingAsset.approve(address(oldRollup), MINIMUM_STAKE * n);

    for (uint256 i = 0; i < n; i++) {
      bool onCanonical = i % 2 == 0;

      oldRollup.deposit({
        _attester: address(uint160(i + 1000)),
        _proposer: PROPOSER,
        _withdrawer: WITHDRAWER,
        _onCanonical: onCanonical
      });
    }

    Epoch epoch = Epoch.wrap(5);
    Timestamp ts =
      newRollup.getTimestampForSlot(Slot.wrap(Epoch.unwrap(epoch) * newRollup.getEpochDuration()));

    assertEq(gse.getAttesterCountAtTime(address(oldRollup), Timestamp.wrap(block.timestamp)), n);
    assertEq(gse.getAttesterCountAtTime(address(newRollup), Timestamp.wrap(block.timestamp)), 0);

    assertEq(
      oldRollup.getEpochCommittee(epoch).length, Math.min(n, oldRollup.getTargetCommitteeSize())
    );
    assertEq(newRollup.getEpochCommittee(epoch).length, 0);

    // Jump to epoch and add the rollup.
    vm.warp(Timestamp.unwrap(ts));
    gse.addRollup(address(newRollup));

    // Look at the data "right now", see that half have been moved
    assertEq(gse.getAttesterCountAtTime(address(oldRollup), Timestamp.wrap(block.timestamp)), n / 2);
    assertEq(
      gse.getAttesterCountAtTime(address(newRollup), Timestamp.wrap(block.timestamp)), n - n / 2
    );

    // When we look at the committee for that epoch, the setup "depends" on how far in the past we "lock-in"
    // the committee. So for good measure, we will first check at the epoch and then add another 100.
    // That should plenty for the lookup
    assertEq(
      oldRollup.getEpochCommittee(epoch).length, Math.min(n, oldRollup.getTargetCommitteeSize())
    );
    assertEq(newRollup.getEpochCommittee(epoch).length, 0);

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
  }
}
