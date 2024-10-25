// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {SysstiaBase} from "./Base.t.sol";
import {Ownable} from "@oz/access/Ownable.sol";

import {Registry} from "@aztec/governance/Registry.sol";
import {IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";
import {ISysstia} from "@aztec/governance/interfaces/ISysstia.sol";

contract UpdateRegistryTest is SysstiaBase {
  address internal caller;

  function test_WhenCallerIsNotOwner(address _caller) external {
    // it reverts
    vm.assume(_caller != sysstia.owner());

    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, _caller));
    vm.prank(_caller);
    sysstia.updateRegistry(IRegistry(address(0xdead)));
  }

  function test_WhenCallerIsOwner() external {
    // it updates the registry
    // it emits a {RegistryUpdated} event

    Registry registry = new Registry(address(this));
    registry.upgrade(address(0xbeef));

    IRegistry oldRegistry = sysstia.registry();
    address oldCanonical = sysstia.canonicalRollup();

    vm.prank(sysstia.owner());
    vm.expectEmit(true, true, false, true, address(sysstia));
    emit ISysstia.RegistryUpdated(registry);
    sysstia.updateRegistry(registry);

    assertEq(address(sysstia.registry()), address(registry));
    assertNotEq(address(oldRegistry), address(registry));
    assertEq(sysstia.canonicalRollup(), address(0xbeef));
    assertNotEq(oldCanonical, address(0xbeef));
  }
}
