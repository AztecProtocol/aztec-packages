// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IRollup} from "@aztec/core/interfaces/IRollup.sol";
import {IInbox} from "@aztec/core/interfaces/messagebridge/IInbox.sol";
import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {FrontierLib} from "@aztec/core/libraries/crypto/FrontierLib.sol";
import {Hash} from "@aztec/core/libraries/crypto/Hash.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {FeeJuicePortal} from "@aztec/core/messagebridge/FeeJuicePortal.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";

// This entire file needs a giant block comment with diagrams that explain the lifecycle of these trees. When / under what circumstances is a new subtree created? When is it consumed into the L2? When are the messages available to be consumed by txs in the L2?
// Edit: I made a diagram: https://miro.com/app/board/uXjVJdDJb1c=/?share_link_id=336002069212

/**
 * @title Inbox
 * @author Aztec Labs
 * @notice Lives on L1 and is used to pass messages into the rollup, e.g., L1 -> L2 messages.
 */
contract Inbox is IInbox {
  using Hash for DataStructures.L1ToL2Msg;
  using FrontierLib for FrontierLib.Forest;
  using FrontierLib for FrontierLib.Tree;

  address public immutable ROLLUP;
  uint256 public immutable VERSION;
  address public immutable FEE_ASSET_PORTAL;

  uint256 internal immutable HEIGHT;
  uint256 internal immutable SIZE;
  bytes32 internal immutable EMPTY_ROOT; // The root of an empty frontier tree

  // Practically immutable value as we only set it in the constructor.
  FrontierLib.Forest internal forest;

  mapping(uint256 blockNumber => FrontierLib.Tree tree) public trees;

  InboxState internal state;

  constructor(address _rollup, IERC20 _feeAsset, uint256 _version, uint256 _height) {
    ROLLUP = _rollup;
    VERSION = _version;

    HEIGHT = _height;
    SIZE = 2 ** _height;

    state = InboxState({
      rollingHash: 0,
      totalMessagesInserted: 0,
      inProgress: uint64(Constants.INITIAL_L2_BLOCK_NUM) + 1
    });

    forest.initialize(_height);
    EMPTY_ROOT = trees[uint64(Constants.INITIAL_L2_BLOCK_NUM) + 1].root(forest, HEIGHT, SIZE);

    FEE_ASSET_PORTAL =
      address(new FeeJuicePortal(IRollup(_rollup), _feeAsset, IInbox(this), VERSION));
  }

  /**
   * @notice Inserts a new message into the Inbox
   *
   * @dev Emits `MessageSent` with data for easy access by the sequencer
   *
   * @param _recipient - The recipient of the message
   * @param _content - The content of the message (application specific)
   * @param _secretHash - The secret hash of the message (make it possible to hide when a specific message is consumed on L2)
   *
   * @return Hash of the sent message and its leaf index in the tree.
   */
  function sendL2Message(
    DataStructures.L2Actor memory _recipient,
    bytes32 _content,
    bytes32 _secretHash
  ) external override(IInbox) returns (bytes32, uint256) {
    require(
      uint256(_recipient.actor) <= Constants.MAX_FIELD_VALUE,
      Errors.Inbox__ActorTooLarge(_recipient.actor)
    );
    require(
      _recipient.version == VERSION, Errors.Inbox__VersionMismatch(_recipient.version, VERSION)
    );
    require(uint256(_content) <= Constants.MAX_FIELD_VALUE, Errors.Inbox__ContentTooLarge(_content));
    require(
      uint256(_secretHash) <= Constants.MAX_FIELD_VALUE,
      Errors.Inbox__SecretHashTooLarge(_secretHash)
    );

    // Is this the best way to read a packed struct into local variables in a single SLOAD
    // without having to use assembly and manual unpacking?
    InboxState memory _state = state;
    bytes16 rollingHash = _state.rollingHash;
    uint64 totalMessagesInserted = _state.totalMessagesInserted;
    uint64 inProgress = _state.inProgress;

    // To save storage costs, we can probably roll back around and overwrite old trees, once enough time has passed.
    FrontierLib.Tree storage currentTree = trees[inProgress];

    // Why doesn't a tree already know its size, to tell you if it's full? Why do we have to pass SIZE as a param?
    // If we can create new trees to meet the user demand for new L1->L2 messages, but we can only consume one tree root per proposal, then block numbers could fall behind tree numbers, and we could have an ever-growing queue of L2 messages that can't be consumed by the rollup fast enough. Explain why this is not a concern, or why we will never get in the case where blocks fall miles behind the pending queue of messages. (If it can be explained?)
    if (currentTree.isFull(SIZE)) {
      inProgress += 1;
      currentTree = trees[inProgress];
    }

    // this is the global leaf index and not index in the l2Block subtree
    // such that users can simply use it and don't need access to a node if they are to consume it in public.
    // trees are constant size so global index = tree number * size + subtree index
    uint256 index = (inProgress - Constants.INITIAL_L2_BLOCK_NUM) * SIZE + currentTree.nextIndex;

    // If the sender is the fee asset portal, we use a magic address to simpler have it initialized at genesis.
    // We assume that no-one will know the private key for this address and that the precompile won't change to
    // make calls into arbitrary contracts.
    // Why does the fee asset portal have special privileges? Why is it treated differently by this Inbox? Explain all.
    address senderAddress =
      msg.sender == FEE_ASSET_PORTAL ? address(uint160(Constants.FEE_JUICE_ADDRESS)) : msg.sender;

    DataStructures.L1ToL2Msg memory message = DataStructures.L1ToL2Msg({
      sender: DataStructures.L1Actor(senderAddress, block.chainid),
      recipient: _recipient,
      content: _content,
      secretHash: _secretHash,
      index: index
    });

    bytes32 leaf = message.sha256ToField();
    currentTree.insertLeaf(leaf);

    bytes16 updatedRollingHash = bytes16(keccak256(abi.encodePacked(rollingHash, leaf)));
    state = InboxState({
      rollingHash: bytes16(updatedRollingHash),
      totalMessagesInserted: totalMessagesInserted + 1,
      inProgress: inProgress
    });

    emit MessageSent(inProgress, index, leaf, updatedRollingHash);

    return (leaf, index);
  }

  /**
   * @notice Consumes the current tree, and starts a new one if needed
   * // Under what circumstances is a new tree not needed? "`consume`" suggests the current tree cannot be consumed again, and hence that a new tree will always be needed. If that's not the case, rename or refactor the function.
   *
   * @dev Only callable by the rollup contract
   * @dev In the first iteration we return empty tree root because first block's messages tree is always
   * empty because there has to be a 1 block lag to prevent sequencer DOS attacks
   * Q: What DOS attacks? Please provide a link to the explanation.
   * Q: Why does a 1-block lag resolve whatever this DOS attack is?
   *
   * @param _toConsume - The block number to consume
   *
   * @return The root of the consumed tree
   */
  // Rename: _toConsume - doesn't convey that it represents a block number. And actually, it represents a numerical identifier for an L1->L2 subtree (which at the moment just so happens to correspond to a block number).
  function consume(uint256 _toConsume) external override(IInbox) returns (bytes32) {
    require(msg.sender == ROLLUP, Errors.Inbox__Unauthorized());

    // Rename: inProgress - doesn't convey that it represents a numerical identifier for L1->L2 subtrees.
    uint64 inProgress = state.inProgress;

    // Comment that we can only consume from a finalized (fixed) tree (and define the circumstances under which finalization happens), because if the tree can still be inserted-into it would be impossible to generate a proof of correct consumption, because the root (aka in_hash) would be a moving target. I.e. we cannot consume from an in-progress tree because...
    require(_toConsume < inProgress, Errors.Inbox__MustBuildBeforeConsume());

    bytes32 root = EMPTY_ROOT;
    if (_toConsume > Constants.INITIAL_L2_BLOCK_NUM) {
      root = trees[_toConsume].root(forest, HEIGHT, SIZE);
    }

    // If we are "catching up" we skip the tree creation as it is already there
    // Not clear. Catching up with what? Why would this function be called in circumstances other than `_toConsume + 1 == inProgress`? What tree creation: The `if` block below doesn't do anything with trees.
    // What are the circumstances under which a new tree should be created? Is it every time a block is proposed? Can it also happen once a tree becomes full? Will there ever be a disconnect between the block numbers and tree numbers, or will it always be 1:1?
    // It looks like we can start a new tree in two situations:
    // - The current tree is full.
    // - The latest block proposal has consumed the latest fixed tree.
    // So explain that this `if` statement won't bite during times where demand for L1->L2 messages is high: because new trees will be created and filled (and then fixed) by users' message insertions faster than new block proposals can consume those trees.
    if (_toConsume + 1 == inProgress) {
      // We're currently consuming the most-recently fixed tree.
      // There's another tree beyond the fixed tree that we're consuming, that is currently in-progress.
      // We fix that in-progress tree, so that no new messages can be added to it, and said tree will be consumed by the next proposal (after this one).
      // We create a new in-progress tree, so that new messages can continue to come into the inbox, and said tree will be consumed by the _next next_ proposal (two after this one).
      state.inProgress = inProgress + 1;
    }

    return root; // aka in_hash!
  }

  function getFeeAssetPortal() external view override(IInbox) returns (address) {
    return FEE_ASSET_PORTAL;
  }

  function getRoot(uint256 _blockNumber) external view override(IInbox) returns (bytes32) {
    return trees[_blockNumber].root(forest, HEIGHT, SIZE);
  }

  function getState() external view override(IInbox) returns (InboxState memory) {
    return state;
  }

  function getTotalMessagesInserted() external view override(IInbox) returns (uint64) {
    return state.totalMessagesInserted;
  }

  function getInProgress() external view override(IInbox) returns (uint64) {
    return state.inProgress;
  }
}
