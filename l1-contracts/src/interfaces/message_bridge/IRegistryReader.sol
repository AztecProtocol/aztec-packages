// interface that reads getter functions for Registry.sol:

// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.18;

import {IRollup} from "@aztec/interfaces/IRollup.sol";
import {IInbox} from "@aztec/interfaces/message_bridge/IInbox.sol";
import {IOutbox} from "@aztec/interfaces/message_bridge/IOutbox.sol";

interface IRegistryReader {
  struct L1L2Addresses {
    address rollup;
    address inbox;
    address outbox;
  }

  function getL1L2Addresses() external view returns (L1L2Addresses memory);

  function getRollup() external view returns (IRollup);

  function getInbox() external view returns (IInbox);

  function getOutbox() external view returns (IOutbox);
}
