// SPDX-License-Identifier: Apache-2.0
// Copyright 2023 Aztec Labs.
pragma solidity >=0.8.18;

import {Test} from "forge-std/Test.sol";

import {NaiveMerkle} from "./Naive.sol";
import {FrontierMerkle} from "./../../src/core/messagebridge/frontier_tree/Frontier.sol";

contract MerkleTest is Test {
  NaiveMerkle internal merkle;
  FrontierMerkle internal frontier;

  uint256 public constant DEPTH = 10;

  function setUp() public {
    merkle = new NaiveMerkle(DEPTH);
    frontier = new FrontierMerkle(DEPTH);
  }

  function testFrontier() public {
    uint256 upper = frontier.SIZE();
    for (uint256 i = 0; i < upper; i++) {
      bytes32 leaf = sha256(abi.encode(i + 1));
      merkle.insertLeaf(leaf);
      frontier.insertLeaf(leaf);
      assertEq(merkle.computeRoot(), frontier.root(), "Frontier Roots should be equal");
    }
  }

  function testNaive(uint256 _idx) public {
    uint256 upper = merkle.SIZE();

    // function for bounding the test env
    uint256 idx = bound(_idx, 0, upper - 1);

    for (uint256 i = 0; i < upper; i++) {
      bytes32 leaf = sha256(abi.encode(i + 1));
      merkle.insertLeaf(leaf);
    }

    (bytes32[] memory path, bytes32 leaf) = merkle.computeSiblingPath(idx);

    for (uint256 i = 0; i < merkle.DEPTH(); i++) {
      emit log_named_bytes32("path", path[i]);
    }

    emit log_named_bytes32("test", leaf);
    emit log_named_bytes32("size", bytes32(merkle.SIZE()));
    emit log_named_bytes32("root", merkle.computeRoot());

    assertTrue(merkle.verifyMembership(path, leaf, idx));
  }

  function testNaive(uint256 _idx) public {
    uint256 upper = merkle.SIZE();

    // function for bounding the test env
    uint256 idx = bound(_idx, 0, upper - 1);

    for (uint256 i = 0; i < upper; i++) {
      bytes32 leaf = sha256(abi.encode(i + 1));
      merkle.insertLeaf(leaf);
    }

    (bytes32[] memory path, bytes32 leaf) = merkle.computeSiblingPath(idx);

    for (uint256 i = 0; i < merkle.DEPTH(); i++) {
      emit log_named_bytes32("path", path[i]);
    }

    emit log_named_bytes32("test", leaf);
    emit log_named_bytes32("size", bytes32(merkle.SIZE()));
    emit log_named_bytes32("root", merkle.computeRoot());

    assertTrue(merkle.verifyMembership(path, leaf, idx));
  }
}
