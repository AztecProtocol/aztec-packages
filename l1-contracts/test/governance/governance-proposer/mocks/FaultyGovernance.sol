// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

contract FaultyGovernance {
  error Faulty();

  function propose(address) external pure returns (bool) {
    require(false, Faulty());
    return true;
  }
}
