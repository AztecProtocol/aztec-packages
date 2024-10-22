// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {IApella} from "@aztec/governance/interfaces/IApella.sol";

contract FaultyApella is IApella {
  error Faulty();

  function propose(address) external pure override(IApella) returns (bool) {
    require(false, Faulty());
    return true;
  }
}
