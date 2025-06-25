// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {DelegationLibWrapper} from "./DelegationLibWrapper.sol";

contract WithDelegationLib is Test {
  DelegationLibWrapper internal delegationLib = new DelegationLibWrapper();

  /**
   * @notice    A helper function to assert the number of writes performed
   *            When in coverage mode, all optimisations are turned off, so
   *            the storage packing that is usually done don't happen, therefore
   *            there is an extra write per snapshot, so if coverage, we have 3
   *            instead of 2. The two being 1 for the data + 1 for the array size increase
   */
  function assertNumWrites(uint256 _direct, uint256 _snapshots) internal {
    uint256 writesPerSnapshot = vm.envOr("FORGE_COVERAGE", false) ? 3 : 2;
    (, bytes32[] memory writeSlots) = vm.accesses(address(delegationLib));
    assertEq(writeSlots.length, _direct + _snapshots * writesPerSnapshot, "Number of writes");
  }
}
