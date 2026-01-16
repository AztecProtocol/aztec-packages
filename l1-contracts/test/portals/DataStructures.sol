// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Epoch} from "@aztec/core/libraries/TimeLib.sol";

library DataStructures {
  struct OutboxMessageMetadata {
    Epoch _epoch;
    uint256 _leafIndex;
    bytes32[] _path;
  }
}
