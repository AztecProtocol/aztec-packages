// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {RegistryBase, FakeRollup} from "./Base.t.sol";
import {IRollup} from "@aztec/core/interfaces/IRollup.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {Ownable} from "@oz/access/Ownable.sol";

contract UpdateRewardDistributorTest is RegistryBase {
  function test_CallerNeqOwner(address _caller) external {
    vm.assume(_caller != address(this));
    vm.prank(_caller);
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, _caller));
    registry.updateRewardDistributor(address(0x3));
  }

  function test_CallerEqOwner() external {
    vm.prank(registry.owner());
    registry.updateRewardDistributor(address(0x3));
    assertEq(address(registry.getRewardDistributor()), address(0x3));
  }
}
