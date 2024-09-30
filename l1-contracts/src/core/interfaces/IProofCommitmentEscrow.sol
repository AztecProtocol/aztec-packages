// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

interface IProofCommitmentEscrow {
  function deposit(uint256 _amount) external;

  function startWithdraw(uint256 _amount) external;

  function executeWithdraw() external;

  function stakeBond(uint256 _bondAmount, address _prover) external;

  function unstakeBond() external;

  function minBalanceAtTime(uint256 _timestamp, address _prover) external view returns (uint256);
}
