// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {IApella} from "@aztec/governance/interfaces/IApella.sol";

contract FalsyApella is IApella {
  function propose(address) external pure override(IApella) returns (bool) {
    return false;
  }
}
