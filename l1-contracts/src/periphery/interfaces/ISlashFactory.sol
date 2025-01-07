// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Epoch} from "@aztec/core/libraries/TimeMath.sol";
import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";

interface ISlashFactory {
  event SlashPayloadCreated(
    address indexed payloadAddress, Epoch indexed epoch, uint256 indexed amount
  );

  function createSlashPayload(Epoch _epoch, uint256 _amount) external returns (IPayload);
  function getAddressAndIsDeployed(Epoch _epoch, uint256 _amount)
    external
    view
    returns (address, bool);
}
