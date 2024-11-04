// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {RewardDistributorBase} from "./Base.t.sol";
import {Ownable} from "@oz/access/Ownable.sol";

import {Registry} from "@aztec/governance/Registry.sol";
import {IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";
import {IRewardDistributor} from "@aztec/governance/interfaces/IRewardDistributor.sol";

contract UpdateRegistryTest is RewardDistributorBase {
  address internal caller;

  function test_WhenCallerIsNotOwner(address _caller) external {
    // it reverts
    vm.assume(_caller != rewardDistributor.owner());

    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, _caller));
    vm.prank(_caller);
    rewardDistributor.updateRegistry(IRegistry(address(0xdead)));
  }

  function test_WhenCallerIsOwner() external {
    // it updates the registry
    // it emits a {RegistryUpdated} event

    Registry registry = new Registry(address(this));
    registry.upgrade(address(0xbeef));

    IRegistry oldRegistry = rewardDistributor.registry();
    address oldCanonical = rewardDistributor.canonicalRollup();

    vm.prank(rewardDistributor.owner());
    vm.expectEmit(true, true, false, true, address(rewardDistributor));
    emit IRewardDistributor.RegistryUpdated(registry);
    rewardDistributor.updateRegistry(registry);

    assertEq(address(rewardDistributor.registry()), address(registry));
    assertNotEq(address(oldRegistry), address(registry));
    assertEq(rewardDistributor.canonicalRollup(), address(0xbeef));
    assertNotEq(oldCanonical, address(0xbeef));
  }
}
