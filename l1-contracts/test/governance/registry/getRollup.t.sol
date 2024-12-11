// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {RegistryBase} from "./Base.t.sol";

contract GetRollupTest is RegistryBase {
  function test_GivenOneListedRollup() external view {
    // it should return the newest
    assertEq(registry.getRollup(), address(0xdead));
  }

  function test_GivenMultipleListedRollups() external {
    // it should return the newest
    address rollup = address(uint160(uint256(bytes32("new instance"))));
    registry.upgrade(rollup);
    assertEq(registry.getRollup(), rollup);
  }
}
