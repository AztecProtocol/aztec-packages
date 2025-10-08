// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";

enum SlasherFlavor {
  NONE,
  TALLY,
  EMPIRE
}

interface ISlasher {
  event VetoedPayload(address indexed payload);
  event SlashingDisabled(uint256 disabledUntil);

  function slash(IPayload _payload) external returns (bool);
  function vetoPayload(IPayload _payload) external returns (bool);
  function setSlashingEnabled(bool _enabled) external;
  function isSlashingEnabled() external view returns (bool);
}
