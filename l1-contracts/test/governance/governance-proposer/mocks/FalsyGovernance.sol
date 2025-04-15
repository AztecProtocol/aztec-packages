// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

contract FalsyGovernance {
  function propose(address) external pure returns (bool) {
    return false;
  }
}
