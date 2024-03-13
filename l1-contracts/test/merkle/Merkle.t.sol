// SPDX-License-Identifier: Apache-2.0
// Copyright 2023 Aztec Labs.
pragma solidity >=0.8.18;

import {Test} from "forge-std/Test.sol";

import {NaiveMerkle} from "./Naive.sol";
import {MerkleLib} from "../../src/core/libraries/MerkleLib.sol";
import {MerkleLibHelper} from "./helpers/MerkleLibHelper.sol";
import {Errors} from "../../src/core/libraries/Errors.sol";
import {FrontierMerkle} from "./../../src/core/messagebridge/frontier_tree/Frontier.sol";
import {Constants} from "../../src/core/libraries/ConstantsGen.sol";

contract MerkleTest is Test {
  function setUp() public {}

  function testFrontier() public {
    uint256 depth = 10;

    NaiveMerkle merkle = new NaiveMerkle(depth);
    FrontierMerkle frontier = new FrontierMerkle(depth);

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

    merkleLibHelper.verifyMembership(path, leaf, leafIndex, testNaiveMerkle.computeRoot());
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
    merkleLibHelper.verifyMembership(path1, leaf, leafIndex, expectedRoot);

    // Tests truncated path
    (bytes32[] memory path2,) = testNaiveMerkle.computeSiblingPath(leafIndex);
    bytes32[] memory truncatedPath = new bytes32[](path2.length - 1);
    for (uint256 i = 0; i < truncatedPath.length; i++) {
      truncatedPath[i] = path2[i];
    }

    vm.expectRevert();
    merkleLibHelper.verifyMembership(truncatedPath, leaf, leafIndex, expectedRoot);

    // Tests empty path
    bytes32[] memory emptyPath = new bytes32[](0);
    vm.expectRevert();
    merkleLibHelper.verifyMembership(emptyPath, leaf, leafIndex, expectedRoot);
  }

  function testComputeSiblingPathManuallyLeftChild() public {
    /// Creates a merkle tree with depth 3 and size 8, with leafs from 1 - 8
    NaiveMerkle manualTree = new NaiveMerkle(3);
    for (uint256 i = 1; i <= 8; i++) {
      bytes32 generatedLeaf = bytes32(abi.encode(i));
      manualTree.insertLeaf(generatedLeaf);
    }

    /**
     * We manually make a path; this is the sibling path of the leaf with the value of 1.
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

    /**
     * We manually make a path; this is the sibling path of the leaf with the value of 8.
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
    assertEq(calculateTreeHeightFromSize(0), 1);
    assertEq(calculateTreeHeightFromSize(1), 1);
    assertEq(calculateTreeHeightFromSize(2), 1);
    assertEq(calculateTreeHeightFromSize(3), 2);
    assertEq(calculateTreeHeightFromSize(4), 2);
    assertEq(calculateTreeHeightFromSize(5), 3);
    assertEq(calculateTreeHeightFromSize(6), 3);
    assertEq(calculateTreeHeightFromSize(7), 3);
    assertEq(calculateTreeHeightFromSize(8), 3);
    assertEq(calculateTreeHeightFromSize(9), 4);
  }

  /*
  * @notice Calculates a tree height from the amount of elements in the tree
  * @param _size - The amount of elements in the tree
  */
  function calculateTreeHeightFromSize(uint256 _size) public pure returns (uint256) {
    /// The code / formula that works below has one edge case at _size = 1, which we handle here
    if (_size == 1) {
      return 1;
    }

    /// We need to store the original numer to check at the end if we are a power of two
    uint256 originalNumber = _size;

    /// We need the height of the tree that will contain all of our leaves,
    /// hence the next highest power of two from the amount of leaves - Math.ceil(Math.log2(x))
    uint256 height = 0;

    /// While size > 1, we divide by two, and count how many times we do this; producing a rudimentary way of calculating Math.Floor(Math.log2(x))
    while (_size > 1) {
      _size >>= 1;
      height++;
    }

    /// @notice - We check if 2 ** height does not equal our original number. If so, this means that our size is not a power of two,
    /// and hence we've rounded down (Math.floor) and have obtained the next lowest power of two instead of rounding up (Math.ceil) to obtain the next highest power of two and therefore we need to increment height before returning it.
    /// If 2 ** height equals our original number, it means that we have a perfect power of two and Math.floor(Math.log2(x)) = Math.ceil(Math.log2(x)) and we can return height as-is
    return (2 ** height) != originalNumber ? ++height : height;
  // Checks whether sha root matches output of base parity circuit
  function testRootMatchesBaseParity() public {
    uint256[4] memory msgs = [
      0x151de48ca3efbae39f180fe00b8f472ec9f25be10b4f283a87c6d78393537039,
      0x14c2ea9dedf77698d4afe23bc663263eed0bf9aa3a8b17d9b74812f185610f9e,
      0x1570cc6641699e3ae87fa258d80a6d853f7b8ccb211dc244d017e2ca6530f8a1,
      0x2806c860af67e9cd50000378411b8c4c4db172ceb2daa862b259b689ccbdc1e0
    ];

    // We can't use Constants.NUM_MSGS_PER_BASE_PARITY directly when defining the array so we do the check here to
    // ensure it does not get outdated.
    assertEq(
      msgs.length,
      Constants.NUM_MSGS_PER_BASE_PARITY,
      "NUM_MSGS_PER_BASE_PARITY changed, update msgs."
    );

    uint256 treeHeight = 2; // log_2(NUM_MSGS_PER_BASE_PARITY)
    // We don't have log_2 directly accessible in solidity so I just do the following check here to ensure
    // the hardcoded value is not outdated.
    assertEq(
      2 ** treeHeight,
      Constants.NUM_MSGS_PER_BASE_PARITY,
      "Base parity circuit subtree height changed, update treeHeight."
    );

    FrontierMerkle frontier = new FrontierMerkle(treeHeight);

    for (uint256 i = 0; i < msgs.length; i++) {
      frontier.insertLeaf(bytes32(msgs[i]));
    }

    bytes32 expectedRoot = 0xb3a3fc1968999f2c2d798b900bdf0de41311be2a4d20496a7e792a521fc8abac;
    assertEq(frontier.root(), expectedRoot, "Root does not match base parity circuit root");
  }

  // Checks whether sha root matches output of root parity circuit
  function testRootMatchesRootParity() public {
    // sha256 roots coming out of base parity circuits
    uint256[4] memory baseRoots = [
      0xb3a3fc1968999f2c2d798b900bdf0de41311be2a4d20496a7e792a521fc8abac,
      0x43f78e0ebc9633ce336a8c086064d898c32fb5d7d6011f5427459c0b8d14e91f,
      0x024259b6404280addcc9319bc5a32c9a5d56af5c93b2f941fa326064fbe9636c,
      0x53042d820859d80c474d4694e03778f8dc0ac88fc1c3a97b4369c1096e904ae7
    ];

    // We can't use Constants.NUM_BASE_PARITY_PER_ROOT_PARITY directly when defining the array so we do the check here
    // to ensure it does not get outdated.
    assertEq(
      baseRoots.length,
      Constants.NUM_BASE_PARITY_PER_ROOT_PARITY,
      "NUM_BASE_PARITY_PER_ROOT_PARITY changed, update baseRoots."
    );

    uint256 treeHeight = 2; // log_2(NUM_BASE_PARITY_PER_ROOT_PARITY)
    // We don't have log_2 directly accessible in solidity so I just do the following check here to ensure
    // the hardcoded value is not outdated.
    assertEq(
      2 ** treeHeight,
      Constants.NUM_BASE_PARITY_PER_ROOT_PARITY,
      "Root parity circuit subtree height changed, update treeHeight."
    );

    FrontierMerkle frontier = new FrontierMerkle(treeHeight);

    for (uint256 i = 0; i < baseRoots.length; i++) {
      frontier.insertLeaf(bytes32(baseRoots[i]));
    }

    bytes32 expectedRoot = 0x8e7d8bf0ef7ebd1607cc7ff9f2fbacf4574ee5b692a5a5ac1e7b1594067b9049;
    assertEq(frontier.root(), expectedRoot, "Root does not match root parity circuit root");
  }
}
