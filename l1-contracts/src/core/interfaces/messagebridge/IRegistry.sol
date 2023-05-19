// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.18;

import {DataStructures} from "../../libraries/DataStructures.sol";
import {IRollup} from "../IRollup.sol";
import {IInbox} from "./IInbox.sol";
import {IOutbox} from "./IOutbox.sol";

interface IRegistry {
  function getLatestRollup() external view returns (IRollup);

  function getLatestInbox() external view returns (IInbox);

  function getLatestOutbox() external view returns (IOutbox);
}
