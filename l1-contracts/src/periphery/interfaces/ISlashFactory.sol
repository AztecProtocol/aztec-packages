// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";

interface ISlashFactory {
  event SlashPayloadCreated(
    address payloadAddress, address[] validators, uint96[] amounts, uint256[] offenses
  );

  error SlashPayloadAmountsLengthMismatch(uint256 expected, uint256 actual);
  error SlashPayloadOffensesLengthMismatch(uint256 expected, uint256 actual);

  function createSlashPayload(
    address[] memory _validators,
    uint96[] memory _amounts,
    uint256[] memory _offenses
  ) external returns (IPayload);

  function getAddressAndIsDeployed(address[] memory _validators, uint96[] memory _amounts)
    external
    view
    returns (address, bytes32, bool);
}
