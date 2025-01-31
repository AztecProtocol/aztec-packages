// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {RegistryBase} from "./Base.t.sol";

import {DataStructures} from "@aztec/governance/libraries/DataStructures.sol";

contract GetSnapshotTest is RegistryBase {
  modifier givenMultipleListedRollups() {
    _;
  }

  function test_When_versionExists() external view givenMultipleListedRollups {
    // it should return the snapshot

    DataStructures.RegistrySnapshot memory snapshot = registry.getSnapshot(0);
    assertEq(snapshot.blockNumber, block.number);
    assertEq(snapshot.rollup, address(0xdead));
    assertEq(registry.numberOfVersions(), 1);
  }

  function test_When_versionDoesNotExists(uint256 _version)
    external
    view
    givenMultipleListedRollups
  {
    // it should return empty snapshot

    uint256 version = bound(_version, 1, type(uint256).max);

    DataStructures.RegistrySnapshot memory snapshot = registry.getSnapshot(version);
    assertEq(snapshot.blockNumber, 0);
    assertEq(snapshot.rollup, address(0));
    assertEq(registry.numberOfVersions(), 1);
  }
}
