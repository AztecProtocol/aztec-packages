// SPDX-License-Identifier: Apache-2.0
// Copyright 2023 Aztec Labs.
pragma solidity >=0.8.18;

import {HeaderDecoder} from "../../../src/core/libraries/decoders/HeaderDecoder.sol";

contract HeaderDecoderHelper {
  // A wrapper used such that we get "calldata" and not memory
  function decode(bytes calldata _header) public pure returns (HeaderDecoder.Header memory) {
    return HeaderDecoder.decode(_header);
  }
}
