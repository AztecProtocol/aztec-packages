// SPDX-License-Identifier: Apache-2.0
// Copyright 2023 Aztec Labs.
pragma solidity >=0.8.18;

import {Test} from "forge-std/Test.sol";

import {NaiveMerkle} from "./Naive.sol";
import {Merkle} from "../../src/core/libraries/Merkle.sol";
import {Errors} from "../../src/core/libraries/Errors.sol";
import {FrontierMerkle} from "./../../src/core/messagebridge/frontier_tree/Frontier.sol";

abstract contract MerkleLibWrapper {
  function _verifyMembershipWrapper(
    bytes32[] memory _path,
    bytes32 _leaf,
    uint256 _index,
    bytes32 _expectedRoot
  ) external pure {
    Merkle._verifyMembership(_path, _leaf, _index, _expectedRoot);
  }
}

contract MerkleTest is Test, MerkleLibWrapper {
  NaiveMerkle internal merkle;
  FrontierMerkle internal frontier;

  NaiveMerkle internal testNaiveMerkle;

  uint256 public constant DEPTH = 10;

  function setUp() public {
    // Set up testFrontier
    frontier = new FrontierMerkle(DEPTH);
    merkle = new NaiveMerkle(DEPTH);

    // Set up testNative
    testNaiveMerkle = new NaiveMerkle(DEPTH);
    uint256 treeSize = testNaiveMerkle.SIZE();
    for (uint256 i = 0; i < treeSize; i++) {
      bytes32 generatedLeaf = sha256(abi.encode(i + 1));
      testNaiveMerkle.insertLeaf(generatedLeaf);
    }
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

  function testNaiveSiblingPathAndMembershipVerification(uint256 _idx) public view {
    uint256 leafIndex = bound(_idx, 0, merkle.SIZE() - 1);

    (bytes32[] memory path, bytes32 leaf) = testNaiveMerkle.computeSiblingPath(leafIndex);

    Merkle._verifyMembership(path, leaf, leafIndex, testNaiveMerkle.computeRoot());
  }

  function testNaiveBadSiblingPathAndMembershipVerification(uint256 _idx) public {
    uint256 leafIndex = bound(_idx, 0, merkle.SIZE() - 1);
    bytes32 expectedRoot = testNaiveMerkle.computeRoot();

    // Tests garbled path
    (bytes32[] memory path1, bytes32 leaf) = testNaiveMerkle.computeSiblingPath(leafIndex);
    bytes32 temp1 = path1[0];
    path1[0] = path1[path1.length - 1];
    path1[path1.length - 1] = temp1;
    vm.expectRevert();
    this._verifyMembershipWrapper(path1, leaf, leafIndex, expectedRoot);

    // Tests truncated path
    (bytes32[] memory path2,) = testNaiveMerkle.computeSiblingPath(leafIndex);
    bytes32[] memory truncatedPath = new bytes32[](path2.length - 1);
    for (uint256 i = 0; i < truncatedPath.length; i++) {
      truncatedPath[i] = path2[i];
    }

    vm.expectRevert();
    this._verifyMembershipWrapper(truncatedPath, leaf, leafIndex, expectedRoot);

    // Tests empty path
    bytes32[] memory emptyPath = new bytes32[](0);
    vm.expectRevert();
    this._verifyMembershipWrapper(emptyPath, leaf, leafIndex, expectedRoot);
  }

  function testComputeSiblingPathManually() public {
    NaiveMerkle manualTree = new NaiveMerkle(3);

    for (uint256 i = 1; i <= 8; i++) {
      bytes32 generatedLeaf = bytes32(abi.encode(i));
      manualTree.insertLeaf(generatedLeaf);
    }

    bytes32[3] memory expectedPath1 = [
      bytes32(abi.encode(2)),
      sha256(bytes.concat(bytes32(abi.encode(3)), bytes32(abi.encode(4)))),
      sha256(
        bytes.concat(
          sha256(bytes.concat(bytes32(abi.encode(5)), bytes32(abi.encode(6)))),
          sha256(bytes.concat(bytes32(abi.encode(7)), bytes32(abi.encode(8))))
        )
      )
    ];

    (bytes32[] memory path1, bytes32 leaf1) = manualTree.computeSiblingPath(0);
    assertEq(leaf1, bytes32(abi.encode(1)));
    assertEq(path1[0], expectedPath1[0]);
    assertEq(path1[1], expectedPath1[1]);
    assertEq(path1[2], expectedPath1[2]);

    bytes32[3] memory expectedPath2 = [
      bytes32(abi.encode(7)),
      sha256(bytes.concat(bytes32(abi.encode(5)), bytes32(abi.encode(6)))),
      sha256(
        bytes.concat(
          sha256(bytes.concat(bytes32(abi.encode(1)), bytes32(abi.encode(2)))),
          sha256(bytes.concat(bytes32(abi.encode(3)), bytes32(abi.encode(4))))
        )
      )
    ];

    (bytes32[] memory path2, bytes32 leaf2) = manualTree.computeSiblingPath(7);
    assertEq(leaf2, bytes32(abi.encode(8)));
    assertEq(path2[0], expectedPath2[0]);
    assertEq(path2[1], expectedPath2[1]);
    assertEq(path2[2], expectedPath2[2]);
  }
}
