// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IProofCommitmentEscrow} from "@aztec/core/interfaces/IProofCommitmentEscrow.sol";
import {Timestamp} from "@aztec/core/libraries/TimeMath.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";

contract MockProofCommitmentEscrow is IProofCommitmentEscrow {
  mapping(address => uint256) public deposits;

  IERC20 public immutable token;

  constructor() {
    token = new TestERC20();
  }

  function deposit(uint256 _amount) external override {
    deposits[msg.sender] += _amount;
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

  function minBalanceAtTime(Timestamp, address _who) external view override returns (uint256) {
    return deposits[_who];
  }
}
