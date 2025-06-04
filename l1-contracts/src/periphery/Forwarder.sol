// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Address} from "@oz/utils/Address.sol";
import {IForwarder} from "./interfaces/IForwarder.sol";

contract Forwarder is IForwarder {
  using Address for address;

  function forward(address[] calldata _to, bytes[] calldata _data) external override(IForwarder) {
    require(
      _to.length == _data.length, IForwarder.ForwarderLengthMismatch(_to.length, _data.length)
    );
    for (uint256 i = 0; i < _to.length; i++) {
      _to[i].functionCall(_data[i]);
    }
  }
}
