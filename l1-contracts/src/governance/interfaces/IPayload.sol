// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

interface IPayload {
  struct Action {
    address target;
    bytes data;
  }

  function getActions() external view returns (Action[] memory);
}
