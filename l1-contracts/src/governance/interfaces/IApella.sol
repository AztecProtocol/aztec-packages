// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

interface IApella {
  function propose(address _proposal) external returns (bool);
}
