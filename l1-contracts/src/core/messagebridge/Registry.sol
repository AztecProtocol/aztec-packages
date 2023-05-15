// SPDX-License-Identifier: Apache-2.0
// Copyright 2023 Aztec Labs.
pragma solidity >=0.8.18;

import {IRegistryReader} from "./IRegistryReader.sol";

/**
 * @title Registry
 * @author Aztec Labs
 * @notice Keeps track of important information for L1<>L2 communication.
 */
contract Registry is IRegistryReader {
  // TODO(rahul) - https://github.com/AztecProtocol/aztec-packages/issues/523
  // Need to create a snashot of addresses per version!

  L1L2Addresses addresses;

  // set the addresses in a setter function:
  function setAddresses(address _rollup, address _inbox, address _outbox) public {
    addresses = L1L2Addresses(_rollup, _inbox, _outbox);
  }

  // get the addresses in a getter function:
  function getL1L2Addresses() external view override returns (L1L2Addresses memory) {
    return addresses;
  }
}
