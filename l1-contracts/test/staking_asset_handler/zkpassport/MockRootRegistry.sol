// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IRootRegistry} from "@zkpassport/IRootRegistry.sol";

contract MockRootRegistry is IRootRegistry {
  function latestRoot(bytes32) external pure returns (bytes32) {
    return bytes32(0);
  }

  function isRootValid(bytes32, bytes32) external pure returns (bool) {
    return true;
  }

  function isRootValidAtTimestamp(bytes32, bytes32, uint256) external pure returns (bool) {
    return true;
  }
}
