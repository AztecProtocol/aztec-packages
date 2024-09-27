// SPDX-License-Identifier: Apache-2.0
// Copyright 2023 Aztec Labs.
pragma solidity >=0.8.18;

/**
 * @title Errors Library
 * @author Aztec Labs
 * @notice Library that contains errors used throughout the Aztec governance
 * Errors are prefixed with the contract name to make it easy to identify where the error originated
 * when there are multiple contracts that could have thrown the error.
 */
library Errors {
  // Registry
  error Registry__RollupNotRegistered(address rollup); // 0xa1fee4cf
  error Registry__RollupAlreadyRegistered(address rollup); // 0x3c34eabf
}
