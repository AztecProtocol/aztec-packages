// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {Ownable} from "@oz/access/Ownable.sol";
import {Address} from "@oz/utils/Address.sol";
import {IDateGatedRelayer} from "./interfaces/IDateGatedRelayer.sol";

contract DateGatedRelayer is Ownable, IDateGatedRelayer {
  uint256 public immutable GATED_UNTIL;

  error GateIsClosed();

  constructor(address owner, uint256 _gatedUntil) Ownable(owner) {
    GATED_UNTIL = _gatedUntil;
  }

  function relay(address target, bytes calldata data)
    external
    override(IDateGatedRelayer)
    onlyOwner
    returns (bytes memory)
  {
    require(block.timestamp >= GATED_UNTIL, GateIsClosed());
    return Address.functionCall(target, data);
  }
}
