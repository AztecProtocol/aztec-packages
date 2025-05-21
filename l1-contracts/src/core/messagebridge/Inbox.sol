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

    FrontierLib.Tree storage currentTree = trees[inProgress];

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
   *
   * @dev Only callable by the rollup contract
   * @dev In the first iteration we return empty tree root because first block's messages tree is always
   * empty because there has to be a 1 block lag to prevent sequencer DOS attacks
   *
   * @param _toConsume - The block number to consume
   *
   * @return The root of the consumed tree
   */
  function consume(uint256 _toConsume) external override(IInbox) returns (bytes32) {
    require(msg.sender == ROLLUP, Errors.Inbox__Unauthorized());

    uint64 inProgress = state.inProgress;
    require(_toConsume < inProgress, Errors.Inbox__MustBuildBeforeConsume());

    bytes32 root = EMPTY_ROOT;
    if (_toConsume > Constants.INITIAL_L2_BLOCK_NUM) {
      root = trees[_toConsume].root(forest, HEIGHT, SIZE);
    }

    // If we are "catching up" we skip the tree creation as it is already there
    if (_toConsume + 1 == inProgress) {
      state.inProgress = inProgress + 1;
    }

    return root;
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
