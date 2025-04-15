// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

interface IForwarder {
  error ForwarderLengthMismatch(uint256 toLength, uint256 dataLength); // 3a2aeb4d

  function forward(address[] calldata _to, bytes[] calldata _data) external;
}
