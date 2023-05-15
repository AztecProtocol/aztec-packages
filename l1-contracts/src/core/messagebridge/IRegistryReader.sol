// interface that reads getter functions for Registry.sol:

// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.18;

interface IRegistryReader {
  struct L1L2Addresses {
    address rollup;
    address inbox;
    address outbox;
  }

  function getL1L2Addresses() external view returns (L1L2Addresses memory);
}
