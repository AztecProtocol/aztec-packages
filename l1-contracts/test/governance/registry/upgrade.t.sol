// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {RegistryBase} from "./Base.t.sol";

import {Ownable} from "@oz/access/Ownable.sol";

import {IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {DataStructures} from "@aztec/governance/libraries/DataStructures.sol";

contract UpgradeTest is RegistryBase {
  function test_RevertWhen_CallerIsNotOwner(address _caller) external {
    // it should revert
    vm.assume(_caller != address(this));
    vm.prank(_caller);
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, _caller));
    registry.upgrade(address(uint160(uint256(bytes32("new instance")))));
  }

  modifier whenCallerIsOwner() {
    _;
  }

  function test_RevertWhen_RollupAlreadyInSet() external whenCallerIsOwner {
    // it should revert
    address rollup = registry.getRollup();

    vm.expectRevert(
      abi.encodeWithSelector(Errors.Registry__RollupAlreadyRegistered.selector, rollup)
    );
    registry.upgrade(rollup);
  }

  function test_WhenRollupNotAlreadyInSet(address _rollup) external whenCallerIsOwner {
    // it should add the rollup to state
    // it should emit a {InstanceAdded} event
    vm.assume(_rollup != address(0xdead));

    {
      DataStructures.RegistrySnapshot memory snapshotBefore = registry.getCurrentSnapshot();
      assertEq(snapshotBefore.blockNumber, block.number);
      assertEq(snapshotBefore.rollup, address(0xdead));
      assertEq(registry.numberOfVersions(), 1);
    }

    vm.expectEmit(true, true, false, false, address(registry));
    emit IRegistry.InstanceAdded(_rollup, 1);
    registry.upgrade(_rollup);

    assertEq(registry.numberOfVersions(), 2);

    DataStructures.RegistrySnapshot memory snapshot = registry.getCurrentSnapshot();
    assertEq(snapshot.blockNumber, block.number);
    assertGt(snapshot.blockNumber, 0);
    assertEq(snapshot.rollup, _rollup);
  }
}
