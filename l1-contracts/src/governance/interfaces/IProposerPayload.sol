// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";

interface IProposerPayload is IPayload {
  function getOriginalPayload() external view returns (IPayload);

  function amIValid() external view returns (bool);
}
