// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";

interface ISlashFactory {
  struct Offender {
    address validator;
    uint96 amount;
  }

  event SlashPayloadCreated(
    address payloadAddress, address[] validators, uint96[] amounts, uint256[] offences
  );

  error SlashPayloadAmountsLengthMismatch(uint256 expected, uint256 actual);
  error SlashPayloadOffencesLengthMismatch(uint256 expected, uint256 actual);

  function createSlashPayload(
    address[] memory _validators,
    uint96[] memory _amounts,
    uint256[] memory _offences
  ) external returns (IPayload);

  function getAddressAndIsDeployed(address[] memory _validators, uint96[] memory _amounts)
    external
    view
    returns (address, bytes32, bool);
}
