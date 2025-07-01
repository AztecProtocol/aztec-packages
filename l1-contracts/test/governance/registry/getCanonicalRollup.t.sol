// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {RegistryBase, FakeRollup} from "./Base.t.sol";
import {IRollup} from "@aztec/core/interfaces/IRollup.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";

contract GetRollupTest is RegistryBase {
  function test_GivenNoListedRollups() external {
    // it should revert
    vm.expectRevert(abi.encodeWithSelector(Errors.Registry__NoRollupsRegistered.selector));
    registry.getCanonicalRollup();
  }

  function test_GivenMultipleListedRollups() external {
    // it should return the newest

    address rollup = address(new FakeRollup());
    registry.addRollup(IRollup(rollup));
    assertEq(address(registry.getCanonicalRollup()), rollup);

    address rollup2 = address(new FakeRollup());
    registry.addRollup(IRollup(rollup2));
    assertEq(address(registry.getCanonicalRollup()), rollup2);
  }
}
