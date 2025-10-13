// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

interface IDateGatedRelayer {
  function relay(address target, bytes calldata data) external returns (bytes memory);
}
