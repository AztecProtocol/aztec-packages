// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {HeaderLib, Header} from "@aztec/core/libraries/RollupLibs/HeaderLib.sol";

contract HeaderLibHelper {
  // A wrapper used such that we get "calldata" and not memory
  function decode(bytes calldata _header) public pure returns (Header memory) {
    return HeaderLib.decode(_header);
  }
}
