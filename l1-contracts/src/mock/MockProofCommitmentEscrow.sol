// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IProofCommitmentEscrow} from "@aztec/core/interfaces/IProofCommitmentEscrow.sol";
import {Timestamp} from "@aztec/core/libraries/TimeMath.sol";

contract MockProofCommitmentEscrow is IProofCommitmentEscrow {
  function deposit(uint256 _amount) external override {
    // do nothing
  }

  function startWithdraw(uint256 _amount) external override {
    // do nothing
  }

  function executeWithdraw() external override {
    // do nothing
  }

  function unstakeBond(address _prover, uint256 _amount) external override {
    // do nothing
  }

  function stakeBond(address _prover, uint256 _amount) external override {
    // do nothing
  }

  function minBalanceAtTime(Timestamp, address) external pure override returns (uint256) {
    return 0;
  }
}
