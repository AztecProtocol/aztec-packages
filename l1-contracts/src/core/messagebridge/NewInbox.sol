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

  uint256 public immutable HEIGHT;
  uint256 public immutable SIZE;
  bytes32 private immutable ZERO;

  uint256 private toInclude = 0;
  uint256 private inProgress = 1;

  mapping(uint256 treeNumber => address tree) public frontier;

  event LeafInserted(uint256 indexed treeNumber, uint256 indexed index, bytes32 value);

  constructor(address _registry, uint256 _height, bytes32 _zero) {
    REGISTRY = IRegistry(_registry);

    HEIGHT = _height;
    SIZE = 2**_height;
    ZERO = _zero;
  }
}

// class Inbox:
//   STATE_TRANSITIONER: immutable(address)
//   ZERO: immutable(bytes32)

//   HEIGHT: immutable(uint256)
//   SIZE: immutable(uint256)

//   trees: HashMap[uint256, FrontierTree]

//   to_include: uint256 = 0
//   in_progress: uint256 = 1

//   def __init__(self, _height: uint256, _zero: bytes32, _state_transitioner: address):
//     self.HEIGHT = _height
//     self.SIZE = 2**_height
//     self.ZERO = _zero
//     self.STATE_TRANSITIONER = _state_transitioner

//     self.trees[1] = FrontierTree(self.HEIGHT)
 
//   def insert(self, message: L1ToL2Message) -> bytes32:
//     '''
//     Insert into the next FrontierTree. If the tree is full, creates a new one
//     '''
//     if self.trees[self.in_progress].next_index == 2**self.HEIGHT:
//       self.in_progress += 1
//       self.trees[self.in_progress] = FrontierTree(self.HEIGHT)

//     message.sender.actor = msg.sender
//     message.sender.chain_id = block.chainid

//     leaf = message.hash_to_field()
//     self.trees[self.in_progress].insert(leaf)
//     return leaf

//   def consume(self) -> bytes32:
//     '''
//     Consumes the current tree, and starts a new one if needed
//     '''
//     assert msg.sender == self.STATE_TRANSITIONER

//     root = self.ZERO
//     if self.to_include > 0:
//       root = self.trees[self.to_include].root()

//     # If we are "catching up" we can skip the creation as it is already there
//     if self.to_include + 1 == self.in_progress:
//       self.in_progress += 1
//       self.trees[self.in_progress] = FrontierTree(self.HEIGHT)

//     self.to_include += 1

//     return root