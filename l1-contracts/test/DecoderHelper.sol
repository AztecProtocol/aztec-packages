// SPDX-License-Identifier: Apache-2.0
// Copyright 2023 Aztec Labs.
pragma solidity >=0.8.18;

import {Decoder} from "@aztec3/core/Decoder.sol";
import {Rollup} from "@aztec3/core/Rollup.sol";

contract DecoderHelper is Decoder {
  function decode(Block calldata _l2Block)
    external
    view
    returns (uint256, bytes32, bytes32, bytes32)
  {
    return _decode(_l2Block);
  }

  function computeDiffRootAndMessagesHash(Block calldata _l2Block)
    external
    view
    returns (bytes32, bytes32)
  {
    (bytes32 diffRoot, bytes32 l1ToL2MessagesHash) = _computeDiffRootAndMessagesHash(_l2Block);
    return (diffRoot, l1ToL2MessagesHash);
  }
}
