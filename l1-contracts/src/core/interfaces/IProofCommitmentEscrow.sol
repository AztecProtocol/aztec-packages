// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.18;

import {DataStructures} from "../libraries/DataStructures.sol";

interface IProofCommitmentEscrow {
  function deposit(uint256 _amount) external;
  function withdraw(uint256 _amount) external;
  // returns the address of the bond provider
  function stakeBond(DataStructures.EpochProofQuote calldata _quote) external returns (address);
  function unstakeBond(uint256 _amount) external;
}
