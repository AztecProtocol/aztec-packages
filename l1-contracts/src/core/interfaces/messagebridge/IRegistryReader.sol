// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.18;

import {IRollup} from "@aztec/interfaces/IRollup.sol";
import {IInbox} from "@aztec/interfaces/messagebridge/IInbox.sol";
import {IOutbox} from "@aztec/interfaces/messagebridge/IOutbox.sol";

interface IRegistryReader {
  struct L1L2Addresses {
    address rollup;
    address inbox;
    address outbox;
  }

  function getL1L2Addresses() external view returns (L1L2Addresses memory);

  function getRollupAddress() external view returns (IRollup);

  function getInboxAddress() external view returns (IInbox);

  function getOutboxAddress() external view returns (IOutbox);
}
