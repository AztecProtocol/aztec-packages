// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IRollup} from "@aztec/core/interfaces/IRollup.sol";
import {IInbox} from "@aztec/core/interfaces/messagebridge/IInbox.sol";
import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {FrontierLib} from "@aztec/core/libraries/crypto/FrontierLib.sol";
import {Hash} from "@aztec/core/libraries/crypto/Hash.sol";
import {
  InboxAnchor,
  InboxAnchorChainLib,
  InboxAnchorChainHelperLib,
  InboxAnchorChain,
  InboxAnchorHash
} from "@aztec/core/libraries/crypto/InboxAnchorChain.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {FeeJuicePortal} from "@aztec/core/messagebridge/FeeJuicePortal.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {Math} from "@oz/utils/math/Math.sol";

/**
 * @title Inbox
 * @author Aztec Labs
 * @notice Lives on L1 and is used to pass messages into the rollup, e.g., L1 -> L2 messages.
 */
contract Inbox is IInbox {
  using Hash for DataStructures.L1ToL2Msg;
  using FrontierLib for FrontierLib.Forest;
  using FrontierLib for FrontierLib.Tree;
  using InboxAnchorChainHelperLib for InboxAnchorChain;
  using InboxAnchorChainLib for InboxAnchorChain;

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
  InboxAnchorChain internal chain;

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

    chain.initialize(EMPTY_ROOT);
  }

  /**
   * @notice  Forcefully lowers the last stable tree as an anchor into the hash-chain.
   *          To be used by provers in case no anchors are available for their full span.
   *
   * @dev     Will lower the last stable tree (if not already) even if the root is EMPTY.
   * @dev     Also updates the `inProgress` storage value to ensure it is not possible
   *          to rewrite history afterwards.
   */
  function lowerAnchorForcefully() external override(IInbox) {
    // Before we perform the forceful insertion we must ensure that a anchor is made of
    // the last stable (which potentially have no anchor). Without this check, we might
    // skip the anchor of a non-zero from an older tree if no messages have been sent since.
    // For example, block N have message, but then 3 blocks without arrive. If not anchoring
    // the last cached.inProgress tree, we would create an empty anchor for N + 2, and
    // essentially deletes the messages in N.
    lowerIfNeeded();

    uint256 inProgress = getInProgress();
    // Very important that we don't try to snapshot the inProgress value. Only stable values!
    uint256 toSnapshot = inProgress - 1;
    uint256 lastAnchor = chain.getLastAnchorBlockNumber();

    // If toSnapshot is larger than last anchor we can safely lower the anchor.
    // Otherwise do nothing as it already exists.
    if (toSnapshot > lastAnchor) {
      chain.lowerAnchor({_root: getRoot(toSnapshot), _blockNumber: toSnapshot});

      // We update the `inProgress` to ensure that a prune won't cause overwrites
      state.inProgress = uint64(inProgress);
    }
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

    lowerIfNeeded();

    // Is this the best way to read a packed struct into local variables in a single SLOAD
    // without having to use assembly and manual unpacking?
    InboxState memory _state = state;
    bytes16 rollingHash = _state.rollingHash;
    uint64 totalMessagesInserted = _state.totalMessagesInserted;
    uint64 inProgress = getInProgress();

    // If the current tree is filled, we are forced to start a new tree.
    FrontierLib.Tree storage currentTree = trees[inProgress];
    if (currentTree.isFull(SIZE)) {
      bytes32 root = getRoot(inProgress);
      if (root != EMPTY_ROOT) {
        chain.lowerAnchor({_root: root, _blockNumber: inProgress});
      }
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
   * @notice    Validate the hash-chain and returns the in-hashes for a given range of blocks
   *
   *            As part of the validation in `EpochProofLib` the rollup must assert that the
   *            `in_hash` values provided as part of the rollup blocks, does indeed match the
   *            `in_hash` values that is generated from the inbox.
   *
   *            To validate this, we need to "logically" ensure that each of the match storage
   *            written by this inbox. However, this can potentially be a load of `sload`s
   *            heavily impacting the cost.
   *
   *            Instead a hash-chain, as defined in `InboxStructs.sol` is provided and the
   *            `in_hash` values derived.
   *
   *            For the hash chain to provide us meaningful guarantees, it **must** span the section
   *            that we need `in_hash` for.
   *            When deriving the `in_hash` values, recall that the elements of the hash-chain is
   *            checkspoints so the full `in_hash` values are derived as the hash-chain values for
   *            for blocks that have messages (and thereby checkpoints), and simply inserting the
   *            `EMPTY_ROOT` for all others.
   *
   *            While it is possible to derive certain "end" states on the fly, without having it
   *            in storage before the execution, the edge cases make us not do so for now. To quickly outline,
   *            consider the diagram below. When the last anchor is before the `end` it might be the case that
   *            we can predict it, and then insert at time of consumption, but it might also be the case that
   *            have changed, due to the async nature of the rollup/inbox relationship.
   *
   *                       ┌─────────────────────────────┐
   *                       │  when building anchor chain │
   *                       └──────────────┬──────────────┘
   *                                      │
   *                       ┌──────────────┴──────────────┐
   *                       │                             │
   *                       │Last anchor                  │Last anchor
   *                       │>= end                       │< end
   *                       ▼                             ▼
   *                  ┌─────────────┐              ┌───────────┐
   *                  │ Stable ✅   │              │ Unstable  │
   *                  └─────────────┘              └─────┬─────┘
   *                                                     │
   *                                                     ▼
   *                                               ┌───────────┐
   *                                               │at propose │
   *                                               └─────┬─────┘
   *                                                     │
   *                            ┌────────────────────────┼───────────────────────────┐
   *                            │                        │                           │
   *                       Last anchor              Last anchor                 Last anchor
   *                       < end                       == end                      > end
   *                            ▼                        ▼                           ▼
   *                     ┌─────────────────┐ ┌────────────────────────┐ ┌──────────────────────┐
   *                     │Lower anchor at  │ │End was stable, so we   │ │Last Anchor don't     │
   *                     │end ✅           │ │match ✅                │ │match ⚠️              │
   *                     └─────────────────┘ └────────────────────────┘ └──────────────────────┘
   *
   *            To limit the number of edge-cases heavily, or cases generally, we do not extend the
   *            stored hash-chain in any way throughout this function, we rely on that being done separtely
   *
   *            That will happen using the functions:
   *            - `sendL2Message` when the block `toProgress` increases AND a message is sent
   *            - `lowerAnchorForcefully` which can be called to create a checkpoint as needed
   *              - This is also called as part of the `setupEpoch` such that every epoch should
   *                create a checkpoint that can be used and cause minimal disturbance.
   *
   * @dev       This function will return a list of in-hashes for the given range of blocks.
   *            The list will be of length `_endblock - _startBlock + 1`.
   *            The list will be populated with the in-hashes for the given range of blocks.
   *            The list will be populated with the empty root if the block is not anchored.
   * @dev       If blocks are to be fetches beyond any anchor values, they will all be zeros
   * @dev       This is ONLY safe because the `sendL2Message` will always insert past existing blocks
   *            so when this proof lands, there will be no updates to these values afterwards.
   *
   * @param _chain      - The hash-chain
   * @param _startBlock - The start block number
   * @param _endBlock   - The end block number
   *
   * @return inHashes   - The list of inhashes for the range _startBlock.._endBlock both inclusive.
   */
  function consume(InboxAnchor[] memory _chain, uint256 _startBlock, uint256 _endBlock)
    external
    view
    override(IInbox)
    returns (bytes32[] memory)
  {
    require(_chain.length > 0, Errors.Inbox__EmptyAnchorChain());
    require(msg.sender == ROLLUP, Errors.Inbox__Unauthorized());
    require(_startBlock <= _endBlock, Errors.Inbox__StartBlockGreaterThanEndBlock());

    // We will not allow blocks that could be changed to be included here!
    require(_endBlock < getInProgress(), Errors.Inbox__EndBlockUnstable(_endBlock, getInProgress()));

    // This is implictly checked as combination of checks below, but it is much clearer here
    // e.g., _endBlock <= lastAnchorBN + chain.validateAnchorChain(_chain) implies it.
    require(
      _endBlock <= chain.getLastAnchorBlockNumber(), Errors.Inbox__EndBlockNotAnchored(_endBlock)
    );

    uint256 firstAnchorBN = _chain[0].blockNumber;
    uint256 lastAnchorBN = _chain[_chain.length - 1].blockNumber;

    // Ensure that the start and end blocks are both in the span covered by the chain
    // _chain.start <= _startBlock <= _endBlock <= _chain.end
    // If this is not done, the chain might be valid subsection, but not include the
    // specified blocks, which could end up loading empty roots in, essentially
    require(_startBlock >= firstAnchorBN, Errors.Inbox__StartBlockNotLocallyAnchored(_startBlock));
    require(_endBlock <= lastAnchorBN, Errors.Inbox__EndBlockNotLocallyAnchored(_endBlock));
    require(chain.validateAnchorChain(_chain), Errors.Inbox__InvalidAnchorChain());

    // Now we are simply to construct the in hashes
    // If the anchor block number matches block number use the provided root, otherwise use empty root
    bytes32[] memory inHashes = new bytes32[](_endBlock - _startBlock + 1);

    // Since we might not perfectly align the start and end with the anchors, we will need to derive
    // the necessary offset. This offset is very important since it could otherwise load incorrect
    // roots. Any extra elements at the end of the provided chain are unnecessary but not dangerous
    // since we will not load their values in unless they are in the span.
    // To find the offset, we simple walk forward until the anchor at hand is in the span.
    // This is a simple walk, and could potentially be expensive, if the prover provides
    // very long inputs. But that is their own problem then.
    uint256 anchorIndex = 0;
    while (anchorIndex < _chain.length && _chain[anchorIndex].blockNumber < _startBlock) {
      anchorIndex++;
    }

    for (uint256 i = 0; i < inHashes.length; i++) {
      uint256 targetBlock = _startBlock + i;

      if (anchorIndex < _chain.length && _chain[anchorIndex].blockNumber == targetBlock) {
        inHashes[i] = _chain[anchorIndex].root;
        anchorIndex++;
      } else {
        inHashes[i] = EMPTY_ROOT;
      }
    }

    return inHashes;
  }

  function getFeeAssetPortal() external view override(IInbox) returns (address) {
    return FEE_ASSET_PORTAL;
  }

  function getHeight() external view override(IInbox) returns (uint256) {
    return HEIGHT;
  }

  function getSize() external view override(IInbox) returns (uint256) {
    return SIZE;
  }

  function getState() external view override(IInbox) returns (InboxState memory) {
    return state;
  }

  function getTotalMessagesInserted() external view override(IInbox) returns (uint64) {
    return state.totalMessagesInserted;
  }

  /**
   * @notice A helper function that builds a anchor chain at least covering `_startBlockNumber`..`_endBlockNumber` from storage values
   *
   * @param _startBlockNumber - The start block number
   * @param _endBlockNumber - The end block number
   *
   * @return AnchorChain - The anchorchain that at least cover start till end.
   */
  function getAnchorChain(uint256 _startBlockNumber, uint256 _endBlockNumber)
    external
    view
    override(IInbox)
    returns (InboxAnchor[] memory)
  {
    require(_startBlockNumber <= _endBlockNumber, Errors.Inbox__StartBlockGreaterThanEndBlock());
    uint256 maxValue = chain.getLastAnchorBlockNumber();
    require(_endBlockNumber <= maxValue, Errors.Inbox__EndBlockNotAnchored(_endBlockNumber));

    InboxAnchor[] memory anchorChain = new InboxAnchor[](_endBlockNumber - _startBlockNumber + 2);
    InboxAnchor memory anchor;
    uint256 size = 0;

    // If the `_startBlockNumber` itself is the genesis, we simply read the genesis
    // If the `_startBlockNumber` itself is an anchor, we need to read its parent to reconstruct the full element.
    // If the `_startBlockNumber` itself is not an anchor, we will need to find parent (that is anchor) and use that
    // as starting point, which include us reading its parent to get the parent hash. Here there is an edge case
    // if we find the genesis block.

    if (_startBlockNumber == 0) {
      anchor = InboxAnchorChainLib.getGenesisAnchor(EMPTY_ROOT);
    } else {
      if (chain.hasAnchor(_startBlockNumber)) {
        // Since the `_startBlockNumber` will never be 0, it means we are at least the second anchor, and can find a parant
        // to rebuild the full anchor.
        uint256 parent = chain.getParentAnchorBlockNumber(_startBlockNumber);
        anchor = InboxAnchor({
          root: getRoot(_startBlockNumber),
          blockNumber: _startBlockNumber,
          parent: chain.getAnchorHash(parent)
        });
      } else {
        // The starting point do not have an anchor, so we need to find its grand parent
        // We need to find the grand parent then
        uint256 parent = chain.getParentAnchorBlockNumber(_startBlockNumber);

        if (parent == 0) {
          // If the parent is genesis, then we need to just start there.
          anchor = InboxAnchorChainLib.getGenesisAnchor(EMPTY_ROOT);
        } else {
          // Otherwise, it will itself have another parent, that we should find.
          uint256 grandParent = chain.getParentAnchorBlockNumber(parent);
          anchor = InboxAnchor({
            root: getRoot(parent),
            blockNumber: parent,
            parent: chain.getAnchorHash(grandParent)
          });
        }
      }
    }
    anchorChain[size++] = anchor;

    // Until we find an anchor that is past the `_endBlockNumber` keep walking down the chain.
    while (anchor.blockNumber < _endBlockNumber) {
      uint256 child = chain.getChildAnchorBlockNumber(anchor.blockNumber);
      anchor = InboxAnchor({
        root: getRoot(child),
        blockNumber: child,
        parent: chain.getAnchorHash(anchor.blockNumber)
      });
      anchorChain[size++] = anchor;
    }

    // Use assembly to overwrite the length of the anchorchain
    assembly {
      mstore(anchorChain, size)
    }

    return anchorChain;
  }

  function getLastAnchorBlockNumber() public view override(IInbox) returns (uint256) {
    return chain.getLastAnchorBlockNumber();
  }

  function hasAnchor(uint256 _blockNumber) public view override(IInbox) returns (bool) {
    return chain.hasAnchor(_blockNumber);
  }

  function getAnchorHash(uint256 _blockNumber)
    public
    view
    override(IInbox)
    returns (InboxAnchorHash)
  {
    return chain.getAnchorHash(_blockNumber);
  }

  function isAnchor(uint256 _blockNumber, InboxAnchorHash _anchorHash)
    public
    view
    override(IInbox)
    returns (bool)
  {
    return chain.isAnchor(_blockNumber, _anchorHash);
  }

  function isAnchor(InboxAnchor memory _anchor) public view override(IInbox) returns (bool) {
    return chain.isAnchor(_anchor);
  }

  function getInProgress() public view override(IInbox) returns (uint64) {
    // We either continue with the current in progress or pending block + 2.
    // It is +2 and not +1 because +1 would mean that we might alter the block that someone is about to propose right now,
    // which we don't want as that cause timing issues.
    return uint64(Math.max(state.inProgress, IRollup(ROLLUP).getPendingBlockNumber() + 2));
  }

  function getRoot(uint256 _blockNumber) public view override(IInbox) returns (bytes32) {
    return trees[_blockNumber].root(forest, HEIGHT, SIZE);
  }

  /**
   * @notice  Common function to lower last updated tree if non-zero.
   * If the `inProgress` have moved beyond the cached value and the root is non-empty
   * we need to save the cached anchor and update the in progress cache.
   */
  function lowerIfNeeded() internal {
    uint64 cachedInProgress = state.inProgress;
    uint256 inProgress = getInProgress();

    if (inProgress != cachedInProgress) {
      bytes32 root = getRoot(cachedInProgress);
      if (root != EMPTY_ROOT) {
        chain.lowerAnchor({_root: root, _blockNumber: cachedInProgress});
        state.inProgress = uint64(inProgress);
      }
    }
  }
}
