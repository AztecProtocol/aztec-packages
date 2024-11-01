// SPDX-License-Identifier: Apache-2.0
// Copyright 2023 Aztec Labs.
pragma solidity >=0.8.27;

interface INomismatokopio {
  function mint(address _to, uint256 _amount) external;
  function mintAvailable() external view returns (uint256);
}
