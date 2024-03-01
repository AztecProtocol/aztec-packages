// SPDX-License-Identifier: Apache-2.0
// Copyright 2023 Aztec Labs.
pragma solidity >=0.8.18;

// Interfaces
import {IFrontier} from "../interfaces/messagebridge/IFrontier.sol";
import {IRegistry} from "../interfaces/messagebridge/IRegistry.sol";

// Libraries
import {Constants} from "../libraries/ConstantsGen.sol";
import {DataStructures} from "../libraries/DataStructures.sol";
import {Errors} from "../libraries/Errors.sol";
import {Hash} from "../libraries/Hash.sol";

// Contracts
import {FrontierMerkle} from "./frontier_tree/Frontier.sol";

/**
 * @title Inbox
 * @author Aztec Labs
 * @notice Lives on L1 and is used to pass messages into the rollup, e.g., L1 -> L2 messages.
 */
// TODO: rename to Inbox once all the pieces of the new message model are in place.
contract NewInbox {
  using Hash for DataStructures.L1ToL2Msg;

  address public immutable ROLLUP;

  uint256 public immutable HEIGHT;
  uint256 public immutable SIZE;
  bytes32 private immutable ZERO;

  uint256 private toInclude = 0;
  uint256 private inProgress = 1;

  mapping(uint256 treeNumber => IFrontier tree) public frontier;

  event LeafInserted(uint256 treeNumber, uint256 index, bytes32 value);

  constructor(address _rollup, uint256 _height, bytes32 _zero) {
    ROLLUP = _rollup;

    HEIGHT = _height;
    SIZE = 2 ** _height;
    ZERO = _zero;

    // We deploy the first tree
    frontier[inProgress] = IFrontier(new FrontierMerkle(_height));
  }

  /**
   * @notice Inserts an entry into the Inbox
   * @dev Will emit `LeafInserted` with data for easy access by the sequencer
   * @param _recipient - The recipient of the entry
   * @param _content - The content of the entry (application specific)
   * @param _secretHash - The secret hash of the entry (make it possible to hide when a specific entry is consumed on L2)
   * @return The key of the entry in the set
   */
  function insert(DataStructures.L2Actor memory _recipient, bytes32 _content, bytes32 _secretHash)
    external
    returns (bytes32)
  {
    IFrontier currentTree = frontier[inProgress];
    if (currentTree.isFull()) {
      inProgress += 1;
      currentTree = IFrontier(new FrontierMerkle(HEIGHT));
      frontier[inProgress] = currentTree;
    }

    DataStructures.L1ToL2Msg memory message = DataStructures.L1ToL2Msg({
      sender: DataStructures.L1Actor(msg.sender, block.chainid),
      recipient: _recipient,
      content: _content,
      secretHash: _secretHash,
      // TODO: nuke the following 2 values from the struct once the new message model is in place
      deadline: 0,
      fee: 0
    });

    bytes32 leaf = message.sha256ToField();
    uint256 nextIndex = currentTree.insertLeaf(leaf);
    emit LeafInserted(inProgress, nextIndex, leaf);

    // TODO: do we really need to return this?
    return leaf;
  }

  /**
   * @notice Consumes the current tree, and starts a new one if needed
   * @dev Only callable by the rollup contract
   * @return The root of the consumed tree
   */
  function consume() external returns (bytes32) {
    if (msg.sender != ROLLUP) {
      revert Errors.Inbox__Unauthorized();
    }

    bytes32 root = ZERO;
    if (toInclude > 0) {
      root = frontier[toInclude].root();
    }

    // If we are "catching up" we can skip the creation as it is already there
    if (toInclude + 1 == inProgress) {
      inProgress += 1;
      frontier[inProgress] = IFrontier(new FrontierMerkle(HEIGHT));
    }

    toInclude += 1;

    return root;
  }
}
