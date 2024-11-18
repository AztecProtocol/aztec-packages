// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {FrontierLib} from "@aztec/core/libraries/crypto/FrontierLib.sol";

import {Ownable} from "@oz/access/Ownable.sol";

// This truncates each hash and hash preimage to 31 bytes to follow Noir.
// It follows the logic in /noir-protocol-circuits/crates/parity-lib/src/utils/sha256_merkle_tree.nr
// TODO(Miranda): Possibly nuke this contract, and use a generic version which can either use
// regular sha256 or sha256ToField when emulating circuits
contract FrontierMerkle is Ownable {
  using FrontierLib for FrontierLib.Tree;
  using FrontierLib for FrontierLib.Forest;

  uint256 public immutable HEIGHT;
  uint256 public immutable SIZE;

  // Practically immutable value as we only set it in the constructor.
  FrontierLib.Forest internal forest;

  FrontierLib.Tree internal tree;

  constructor(uint256 _height) Ownable(msg.sender) {
    HEIGHT = _height;
    SIZE = 2 ** _height;
    forest.initialize(_height);
  }

  function insertLeaf(bytes32 _leaf) external onlyOwner returns (uint256) {
    return tree.insertLeaf(_leaf);
  }

  function root() external view returns (bytes32) {
    return tree.root(forest, HEIGHT, SIZE);
  }

  function isFull() external view returns (bool) {
    return tree.isFull(SIZE);
  }
}
