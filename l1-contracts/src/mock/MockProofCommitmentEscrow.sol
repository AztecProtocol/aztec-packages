// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.18;

import {DataStructures} from "../core/libraries/DataStructures.sol";
import {IProofCommitmentEscrow} from "../core/interfaces/IProofCommitmentEscrow.sol";

contract MockProofCommitmentEscrow is IProofCommitmentEscrow {
  function deposit(uint256 _amount) external override {
    // do nothing
  }

  function withdraw(uint256 _amount) external override {
    // do nothing
  }

  function unstakeBond(uint256 _amount) external override {
    // do nothing
  }

  function stakeBond(DataStructures.EpochProofQuote calldata)
    external
    pure
    override
    returns (address)
  {
    return address(0);
  }
}
