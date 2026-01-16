// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

interface ICoinIssuer {
  event BudgetReset(uint256 indexed newYear, uint256 newBudget);

  function mint(address _to, uint256 _amount) external;
  function acceptTokenOwnership() external;
  function mintAvailable() external view returns (uint256);
}
