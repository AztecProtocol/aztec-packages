// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";

enum SlasherFlavor {
  EMPIRE,
  CONSENSUS
}

interface ISlasher {
  event VetoedPayload(address indexed payload);

  function slash(IPayload _payload) external returns (bool);
  function vetoPayload(IPayload _payload) external returns (bool);
}
