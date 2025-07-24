// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Hash} from "@aztec/core/libraries/crypto/Hash.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";

/**
 * @notice    A hash of an InboxAnchor.
 * @dev       This is a wrapper around bytes32 to make it harder to misuse.
 */
type InboxAnchorHash is bytes32;

/**
 * @notice    An anchor is a block that has a real value.
 * @param root - The root of the tree for the block number
 * @param blockNumber - the number of the block
 * @param parentBlockNumber - The block number of the anchor parent
 *                            used to make it simpler to find starting points
 * @param parent - The hash of the anchor parent
 */
struct InboxAnchor {
  bytes32 root;
  uint256 blockNumber;
  InboxAnchorHash parent;
}

struct InboxAnchorChain {
  mapping(uint256 blockNumber => InboxAnchorHash link) links;
  uint256 lastAnchorBlockNumber;
}

library InboxAnchorLib {
  function hash(InboxAnchor memory _link) internal pure returns (InboxAnchorHash) {
    return InboxAnchorHash.wrap(Hash.sha256ToField(abi.encode(_link)));
  }
}

/**
 * @title   InboxAnchorChainLib
 * @author  Aztec Labs
 * @notice  A library that implements a simple wrapper around hash-chain based snapshotting
 *
 *          Hash-chain based snapshotting meaning that whenever we take a snapshot, we "chain" it
 *          together with its parent;
 *          When the checkpoint for `n + 1` is created, it includes `hash(element n)` as part of its fields.
 *          For storage purposes, only the `hash` of these elements are stored.
 *
 *          In storage we would have elements as such:
 *          Element 0: hash(Genesis)
 *          Element 1: hash(Content 1, hash(elemenet 0))
 *          Element 2: hash(Content 2, hash(elemenet 1)) [which implicitly also have content 1 and element 0]
 *          ...
 *          Element N + 1: hash(Content N + 1, hash(element N))
 *
 *          This makes it possible to "walk back" a subsection of chain from a input list of elements,
 *          while validating that the list is correct by only needing to read the `start` and `end` elements from storage.
 *
 *          Normally this might be a strange way to do it, we could have just read a list of hashes from storage?
 *          But when `sload`s are costly and data is less so, it becomes a more efficient method of operation.
 *          The savings increase further, when realising that it is possible to move all the hashing checks into a circuit
 *          such that the intermediate values need not be published at all, N reads became 2 reads + some hashing or circuit work.
 *
 *          Say for example that you were given elements N-2, N-1, N, N+1; then you can "in memory" compute:
 *          Element N-2: hash(Content N-2, hash(element N-3)) // where `hash(element N-3)` is already in storage so match that
 *          Element N-1: hash(Content N-1, hash(element N-2)) // where element N-2 were something we provided
 *          Element N: hash(Content N, hash(element N-1))     // where element N-1 were something we provided
 *          Element N+1: hash(Content N+1, hash(element N))   // where element N were something we provided and
 *                                                            // the output `hash(element N+1)` is already in storage to match
 *
 * @dev     Each of these checkpoint values (element hashes) are referred to as an `anchor` (its a trust anchor).
 */
library InboxAnchorChainLib {
  using InboxAnchorLib for InboxAnchor;

  event AnchorLowered(InboxAnchor anchor);

  /**
   * @notice  Initialises the storage by lowering the first anchor
   *          The anchor is in itself similar to the "no-value" but we need
   *          a first parent to make logic down the line simpler.
   */
  function initialize(InboxAnchorChain storage self, bytes32 _root) internal {
    InboxAnchor memory anchor = getGenesisAnchor(_root);
    self.links[0] = anchor.hash();
    emit AnchorLowered(anchor);
  }

  /**
   * @notice  Lowers an anchor for a given `_root` and _blockNumber`
   *
   * @dev     Reverts if the anchor is already populated
   * @dev     Reverts if the block number would put the anchor in the past, the anchors must have
   *          evergrowing block numbers.
   *
   * @param self - The InboxAnchorChain storage object
   * @param _root - The root of the tree for the block number
   * @param _blockNumber - The block number to lower the anchor to
   */
  function lowerAnchor(InboxAnchorChain storage self, bytes32 _root, uint256 _blockNumber) internal {
    require(
      InboxAnchorHash.unwrap(self.links[_blockNumber]) == bytes32(0),
      Errors.Inbox__AlreadyPopulated(_blockNumber)
    );
    require(
      _blockNumber > self.lastAnchorBlockNumber,
      Errors.Inbox__CannotLowerAnchorInPast(_blockNumber, self.lastAnchorBlockNumber)
    );

    InboxAnchor memory anchor = InboxAnchor({
      root: _root,
      blockNumber: _blockNumber,
      parent: self.links[self.lastAnchorBlockNumber]
    });
    self.links[_blockNumber] = anchor.hash();
    self.lastAnchorBlockNumber = _blockNumber;

    emit AnchorLowered(anchor);
  }

  /**
   * @notice  Returns the block number of the last anchor
   *
   * @param self - The InboxAnchorChain storage object
   *
   * @return - The block number of the last anchor
   */
  function getLastAnchorBlockNumber(InboxAnchorChain storage self) internal view returns (uint256) {
    return self.lastAnchorBlockNumber;
  }

  /**
   * @notice  Returns the hash of the anchor for a given block number
   *
   * @param self - The InboxAnchorChain storage object
   * @param _blockNumber - The block number to get the anchor hash for
   *
   * @return - The hash of the anchor for the given block number
   */
  function getAnchorHash(InboxAnchorChain storage self, uint256 _blockNumber)
    internal
    view
    returns (InboxAnchorHash)
  {
    return self.links[_blockNumber];
  }

  /**
   * @notice  Returns true if the anchor for a given block number is populated
   *
   * @param self - The InboxAnchorChain storage object
   * @param _blockNumber - The block number to check if it has an anchor
   *
   * @return - True if the anchor for the given block number is populated, false otherwise
   */
  function hasAnchor(InboxAnchorChain storage self, uint256 _blockNumber)
    internal
    view
    returns (bool)
  {
    return InboxAnchorHash.unwrap(getAnchorHash(self, _blockNumber)) != bytes32(0);
  }

  // We want to open a chain back to an anchor. Anchor being something that have a real value

  /**
   * @notice  Returns true if the anchor provided matches the populated storage
   *
   * @param self - The InboxAnchorChain storage object
   * @param _anchor - The anchor to check if it is populated
   *
   * @return - True if the anchor for the given block number is populated, false otherwise
   */
  function isAnchor(InboxAnchorChain storage self, InboxAnchor memory _anchor)
    internal
    view
    returns (bool)
  {
    return isAnchor(self, _anchor.blockNumber, _anchor.hash());
  }

  function isAnchor(
    InboxAnchorChain storage self,
    uint256 _blockNumber,
    InboxAnchorHash _anchorHash
  ) internal view returns (bool) {
    return InboxAnchorHash.unwrap(getAnchorHash(self, _blockNumber))
      == InboxAnchorHash.unwrap(_anchorHash);
  }

  // We want to be able to open from one anchor, all the way back to the first anchor at or before our target.
  // This is to show that all in our "span" is correct. We do this "before" because we need to support that
  // blocks without any anchors exists (this is the case if there were no messages in the block after it).

  /**
   * @notice    Validate that a chain of anchors create a valid anchored hash-chain
   *
   * @dev       With a valid hash-chain and the first and last being real anchors we are guaranteed
   *            that the intermediate anchors are also in the hash-chain as the last would otherwise not match
   *            This allows us to bypass `sload`s for the intermediate values.
   *
   * @param self - The InboxAnchorChain storage object
   * @param _chain - The chain of InboxAnchor's that makes up the anchor chain
   *
   * @return - True if the chain is valid, false otherwise.
   */
  function validateAnchorChain(InboxAnchorChain storage self, InboxAnchor[] memory _chain)
    internal
    view
    returns (bool)
  {
    // @todo    It is possible to optimise slightly by computing the hash of the anchor first such that it can be reused in the
    //          first update to the current anchor.
    InboxAnchor memory currentAnchor = _chain[0];

    if (!isAnchor(self, currentAnchor)) {
      return false;
    }

    for (uint256 i = 1; i < _chain.length; i++) {
      InboxAnchor memory nextAnchor = _chain[i];
      currentAnchor = InboxAnchor({
        root: nextAnchor.root,
        blockNumber: nextAnchor.blockNumber,
        parent: currentAnchor.hash()
      });
    }

    return isAnchor(self, currentAnchor);
  }

  function getGenesisAnchor(bytes32 _root) internal pure returns (InboxAnchor memory) {
    return InboxAnchor({root: _root, blockNumber: 0, parent: InboxAnchorHash.wrap(0)});
  }
}

// Only used to build faster things.
library InboxAnchorChainHelperLib {
  // nuke later
  function getParentAnchorBlockNumber(InboxAnchorChain storage self, uint256 _blockNumber)
    internal
    view
    returns (uint256)
  {
    uint256 potentialParent = _blockNumber - 1;

    while (!InboxAnchorChainLib.hasAnchor(self, potentialParent)) {
      potentialParent -= 1;
    }

    return potentialParent;
  }

  function getChildAnchorBlockNumber(InboxAnchorChain storage self, uint256 _blockNumber)
    internal
    view
    returns (uint256)
  {
    uint256 potentialChild = _blockNumber + 1;

    while (!InboxAnchorChainLib.hasAnchor(self, potentialChild)) {
      potentialChild += 1;
    }

    return potentialChild;
  }
}
