// SPDX-License-Identifier: Apache-2.0
// Copyright 2023 Aztec Labs.
pragma solidity >=0.8.18;

/**
 * @title Data Structures Library
 * @author Aztec Labs
 * @notice Library that contains data structures used throughout the Aztec protocol
 */
library DataStructures {
  // docs:start:registry_snapshot
  /**
   * @notice Struct for storing address of cross communication components and the block number when it was updated
   * @param rollup - The address of the rollup contract
   * @param blockNumber - The block number of the snapshot
   */
  struct RegistrySnapshot {
    address rollup;
    uint256 blockNumber;
  }
  // docs:end:registry_snapshot
}
