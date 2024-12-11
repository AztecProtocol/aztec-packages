// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {RegistryBase} from "./Base.t.sol";

import {DataStructures} from "@aztec/governance/libraries/DataStructures.sol";

contract GetCurrentSnapshotTest is RegistryBase {
  function test_GivenOneListedRollup() external view {
    // it should return the newest
    DataStructures.RegistrySnapshot memory snapshot = registry.getCurrentSnapshot();
    assertEq(snapshot.blockNumber, block.number);
    assertEq(snapshot.rollup, address(0xdead));
    assertEq(registry.numberOfVersions(), 1);
  }

  function test_GivenMultipleListedRollups() external {
    // it should return the newest
    address rollup = address(uint160(uint256(bytes32("new instance"))));
    registry.upgrade(rollup);

    DataStructures.RegistrySnapshot memory snapshot = registry.getCurrentSnapshot();
    assertEq(snapshot.blockNumber, block.number);
    assertGt(snapshot.blockNumber, 0);
    assertEq(snapshot.rollup, rollup);
  }
}
