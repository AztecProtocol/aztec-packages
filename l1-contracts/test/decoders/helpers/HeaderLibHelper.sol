// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {HeaderLib} from "@aztec/core/libraries/HeaderLib.sol";

contract HeaderLibHelper {
  // A wrapper used such that we get "calldata" and not memory
  function decode(bytes calldata _header) public pure returns (HeaderLib.Header memory) {
    return HeaderLib.decode(_header);
  }
}
