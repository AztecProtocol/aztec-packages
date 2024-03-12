// SPDX-License-Identifier: Apache-2.0
// Copyright 2023 Aztec Labs.
pragma solidity >=0.8.18;

import {Test} from "forge-std/Test.sol";

import {NaiveMerkle} from "./Naive.sol";
import {Merkle} from "../../src/core/libraries/Merkle.sol";
import {Errors} from "../../src/core/libraries/Errors.sol";
import {FrontierMerkle} from "./../../src/core/messagebridge/frontier_tree/Frontier.sol";

abstract contract MerkleLibWrapper {
  function verifyMembershipWrapper(
    bytes32[] memory _path,
    bytes32 _leaf,
    uint256 _index,
    bytes32 _expectedRoot
  ) external pure {
    Merkle.verifyMembership(_path, _leaf, _index, _expectedRoot);
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

    // Set up testNaive
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

    Merkle.verifyMembership(path, leaf, leafIndex, testNaiveMerkle.computeRoot());
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
    this.verifyMembershipWrapper(path1, leaf, leafIndex, expectedRoot);

    // Tests truncated path
    (bytes32[] memory path2,) = testNaiveMerkle.computeSiblingPath(leafIndex);
    bytes32[] memory truncatedPath = new bytes32[](path2.length - 1);
    for (uint256 i = 0; i < truncatedPath.length; i++) {
      truncatedPath[i] = path2[i];
    }

    vm.expectRevert();
    this.verifyMembershipWrapper(truncatedPath, leaf, leafIndex, expectedRoot);

    // Tests empty path
    bytes32[] memory emptyPath = new bytes32[](0);
    vm.expectRevert();
    this.verifyMembershipWrapper(emptyPath, leaf, leafIndex, expectedRoot);
  }

  function testComputeSiblingPathManuallyLeftChild() public {
    /// Creates a merkle tree with depth 3 and size 8, with leafs from 1 - 8
    NaiveMerkle manualTree = new NaiveMerkle(3);
    for (uint256 i = 1; i <= 8; i++) {
      bytes32 generatedLeaf = bytes32(abi.encode(i));
      manualTree.insertLeaf(generatedLeaf);
    }

    /** We manually make a path; this is the sibling path of the leaf with the value of 1.
    * This path, from leaf to root, consists a, b, and c; which correspond to the value of 2, then the hash of 3 and 4,
    * and finally, the hash of 5 and 6 concatenated with the hash of 7 and 8;
    * d0:                                            [ root ]
    * d1:                      [ ]                                               [c]
    * d2:         [ ]                      [b]                       [ ]                     [ ]
    * d3:   [1]         [a]          [3]         [4]           [5]         [6]          [7]        [8].
    */
    bytes32[3] memory expectedPath = [
      bytes32(abi.encode(2)),
      sha256(bytes.concat(bytes32(abi.encode(3)), bytes32(abi.encode(4)))),
      sha256(
        bytes.concat(
          sha256(bytes.concat(bytes32(abi.encode(5)), bytes32(abi.encode(6)))),
          sha256(bytes.concat(bytes32(abi.encode(7)), bytes32(abi.encode(8))))
        )
      )
    ];

    /// We then compute the sibling path using the tree and expect that our manual calculation should equal the computed one
    (bytes32[] memory path, bytes32 leaf) = manualTree.computeSiblingPath(0);
    assertEq(leaf, bytes32(abi.encode(1)));
    assertEq(path[0], expectedPath[0]);
    assertEq(path[1], expectedPath[1]);
    assertEq(path[2], expectedPath[2]);
  }

  function testComputeSiblingPathManuallyRightChild() public {
    /// Creates a merkle tree with depth 3 and size 8, with leafs from 1 - 8
    NaiveMerkle manualTree = new NaiveMerkle(3);
    for (uint256 i = 1; i <= 8; i++) {
      bytes32 generatedLeaf = bytes32(abi.encode(i));
      manualTree.insertLeaf(generatedLeaf);
    }

   /** We manually make a path; this is the sibling path of the leaf with the value of 8.
    * This path, from leaf to root, consists of c a, b, and c; which correspond to the value of 7, then the hash of 5 and 6,
    * and finally, the hash of 1 and 2 concatenated with the hash of 3 and 4;
    * d0:                                            [ root ]
    * d1:                      [c]                                               [ ]
    * d2:         [ ]                      [b]                       [b]                     [ ]
    * d3:   [1]         [2]          [3]         [4]           [5]         [6]          [a]        [8].
    */
    bytes32[3] memory expectedPath = [
      bytes32(abi.encode(7)),
      sha256(bytes.concat(bytes32(abi.encode(5)), bytes32(abi.encode(6)))),
      sha256(
        bytes.concat(
          sha256(bytes.concat(bytes32(abi.encode(1)), bytes32(abi.encode(2)))),
          sha256(bytes.concat(bytes32(abi.encode(3)), bytes32(abi.encode(4))))
        )
      )
    ];

    /// We then compute the sibling path using the tree and expect that our manual calculation should equal the computed one
    (bytes32[] memory path, bytes32 leaf) = manualTree.computeSiblingPath(7);
    assertEq(leaf, bytes32(abi.encode(8)));
    assertEq(path[0], expectedPath[0]);
    assertEq(path[1], expectedPath[1]);
    assertEq(path[2], expectedPath[2]);
  }

  function testCalculateTreeHeightFromSize() external {
    assertEq(Merkle.calculateTreeHeightFromSize(0), 1);
    assertEq(Merkle.calculateTreeHeightFromSize(1), 1);
    assertEq(Merkle.calculateTreeHeightFromSize(2), 1);
    assertEq(Merkle.calculateTreeHeightFromSize(3), 2);
    assertEq(Merkle.calculateTreeHeightFromSize(4), 2);
    assertEq(Merkle.calculateTreeHeightFromSize(5), 3);
    assertEq(Merkle.calculateTreeHeightFromSize(6), 3);
    assertEq(Merkle.calculateTreeHeightFromSize(7), 3);
    assertEq(Merkle.calculateTreeHeightFromSize(8), 3);
    assertEq(Merkle.calculateTreeHeightFromSize(9), 4);
  }
}
