// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.18;

import {SignatureLib} from "../libraries/SignatureLib.sol";

interface IProofCommitmentEscrow {
  function deposit(uint256 _amount) external;
  function withdraw(uint256 _amount) external;
  function stakeBond(uint256 _bondAmount, address _prover) external;
  function unstakeBond(uint256 _bondAmount, address _prover) external;
}
