// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {RegistryBase, FakeRollup} from "./Base.t.sol";

import {Ownable} from "@oz/access/Ownable.sol";

import {IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";

import {IRollup} from "@aztec/core/interfaces/IRollup.sol";

contract UpgradeTest is RegistryBase {
  function setUp() public override {
    super.setUp();
  }

  function test_RevertWhen_CallerIsNotOwner(address _caller) external {
    // it should revert
    vm.assume(_caller != address(this));
    vm.prank(_caller);
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, _caller));
    registry.addRollup(IRollup(address(uint160(uint256(bytes32("new instance"))))));
  }

  modifier whenCallerIsOwner() {
    _;
  }

  function test_RevertWhen_RollupAlreadyInSet() external whenCallerIsOwner {
    // it should revert

    registry.addRollup(IRollup(address(new FakeRollup())));
    address rollup = address(registry.getCanonicalRollup());

    vm.expectRevert(
      abi.encodeWithSelector(Errors.Registry__RollupAlreadyRegistered.selector, rollup)
    );
    registry.addRollup(IRollup(rollup));
  }

  function test_WhenRollupNotAlreadyInSet() external whenCallerIsOwner {
    // it should add the rollup to state
    // it should emit a {InstanceAdded} event

    IRollup newRollup = IRollup(address(new FakeRollup()));
    uint256 version = newRollup.getVersion();

    vm.expectRevert(abi.encodeWithSelector(Errors.Registry__RollupNotRegistered.selector, version));
    registry.getRollup(version);

    vm.expectEmit(true, true, false, false, address(registry));
    emit IRegistry.InstanceAdded(address(newRollup), version);
    registry.addRollup(newRollup);

    assertEq(registry.numberOfVersions(), 1);

    assertEq(address(registry.getRollup(version)), address(newRollup));
    assertEq(registry.getVersion(0), version);
  }
}
