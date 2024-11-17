// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

contract FalsyApella {
  function propose(address) external pure returns (bool) {
    return false;
  }
}
