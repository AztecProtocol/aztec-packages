// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Timestamp} from "@aztec/core/libraries/TimeMath.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";

interface IProofCommitmentEscrow {
  event Deposit(address indexed depositor, uint256 amount);
  event StartWithdraw(address indexed withdrawer, uint256 amount, Timestamp executableAt);
  event ExecuteWithdraw(address indexed withdrawer, uint256 amount);
  event StakeBond(address indexed prover, uint256 amount);
  event UnstakeBond(address indexed prover, uint256 amount);

  function deposit(uint256 _amount) external;
  function startWithdraw(uint256 _amount) external;
  function executeWithdraw() external;
  function stakeBond(address _prover, uint256 _amount) external;
  function unstakeBond(address _prover, uint256 _amount) external;
  function minBalanceAtTime(Timestamp _timestamp, address _prover) external view returns (uint256);
  function deposits(address) external view returns (uint256);
  function token() external view returns (IERC20);
}
