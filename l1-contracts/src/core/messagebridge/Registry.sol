// SPDX-License-Identifier: Apache-2.0
// Copyright 2023 Aztec Labs.
pragma solidity >=0.8.18;

import {IRegistryReader} from "@aztec/interfaces/message_bridge/IRegistryReader.sol";

import {IRollup} from "@aztec/interfaces/IRollup.sol";
import {IInbox} from "@aztec/interfaces/message_bridge/IInbox.sol";
import {IOutbox} from "@aztec/interfaces/message_bridge/IOutbox.sol";

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

  function getRollupAddress() external view override returns (IRollup) {
    return IRollup(addresses.rollup);
  }

  function getInboxAddress() external view override returns (IInbox) {
    return IInbox(addresses.inbox);
  }

  function getOutboxAddress() external view override returns (IOutbox) {
    return IOutbox(addresses.outbox);
  }
}
