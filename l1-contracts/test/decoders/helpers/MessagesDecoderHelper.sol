// SPDX-License-Identifier: Apache-2.0
// Copyright 2023 Aztec Labs.
pragma solidity >=0.8.18;

import {MessagesDecoder} from "../../../src/core/libraries/decoders/MessagesDecoder.sol";

contract MessagesDecoderHelper {
  // A wrapper used such that we get "calldata" and not memory
  function decode(bytes calldata _body)
    public
    pure
    returns (bytes32 l2ToL1MsgsHash, bytes32[] memory l2ToL1Msgs)
  {
    return MessagesDecoder.decode(_body);
  }
}
