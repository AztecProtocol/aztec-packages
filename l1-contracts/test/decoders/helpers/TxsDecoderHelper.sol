// SPDX-License-Identifier: Apache-2.0
// Copyright 2023 Aztec Labs.
pragma solidity >=0.8.18;

import {TxsDecoder} from "../../../src/core/libraries/decoders/TxsDecoder.sol";

contract TxsDecoderHelper {
  // A wrapper used such that we get "calldata" and not memory
  function decode(bytes calldata _body) public pure returns (bytes32 txsHash) {
    return TxsDecoder.decode(_body);
  }
}
