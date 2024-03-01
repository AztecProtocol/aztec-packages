// SPDX-License-Identifier: Apache-2.0
// Copyright 2023 Aztec Labs.
pragma solidity >=0.8.18;

// Interfaces
import {IInbox} from "../interfaces/messagebridge/IInbox.sol";
import {IRegistry} from "../interfaces/messagebridge/IRegistry.sol";

// Libraries
import {Constants} from "../libraries/ConstantsGen.sol";
import {DataStructures} from "../libraries/DataStructures.sol";
import {Errors} from "../libraries/Errors.sol";
import {Hash} from "../libraries/Hash.sol";
import {MessageBox} from "../libraries/MessageBox.sol";

/**
 * @title Inbox
 * @author Aztec Labs
 * @notice Lives on L1 and is used to pass messages into the rollup, e.g., L1 -> L2 messages.
 */
// TODO: rename to Inbox once all the pieces of the new message model are in place.
contract NewInbox {
  IRegistry public immutable REGISTRY;

  event LeafInserted(uint256 indexed treeNumber, uint256 indexed index, bytes32 value);

  constructor(address _registry) {
    REGISTRY = IRegistry(_registry);
  }
}
