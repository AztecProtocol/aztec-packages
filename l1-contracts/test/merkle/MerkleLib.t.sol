// SPDX-License-Identifier: Apache-2.0
// Copyright 2023 Aztec Labs.
pragma solidity >=0.8.18;

import {Test} from "forge-std/Test.sol";

import {NaiveMerkle} from "./Naive.sol";
import {MerkleLibHelper} from "./helpers/MerkleLibHelper.sol";

contract MerkleLibTest is Test {
  MerkleLibHelper internal merkleLibHelper;
  NaiveMerkle internal merkle;
  uint256 public constant DEPTH = 10;

  function setUp() public {
    merkleLibHelper = new MerkleLibHelper();

    merkle = new NaiveMerkle(DEPTH);
    uint256 treeSize = merkle.SIZE();
    for (uint256 i = 0; i < treeSize; i++) {
      bytes32 generatedLeaf = sha256(abi.encode(i + 1));
      merkle.insertLeaf(generatedLeaf);
    }
  }

  function testVerifyMembership(uint256 _idx) public view {
    uint256 leafIndex = bound(_idx, 0, merkle.SIZE() - 1);

    (bytes32[] memory path, bytes32 leaf) = merkle.computeSiblingPath(leafIndex);

    bytes32 expectedRoot = merkle.computeRoot();

    merkleLibHelper.verifyMembership(path, leaf, leafIndex, expectedRoot);
  }

  function testVerifyMembershipWithBadInput(uint256 _idx) public {
    uint256 leafIndex = bound(_idx, 0, merkle.SIZE() - 1);
    bytes32 expectedRoot = merkle.computeRoot();

    // Tests garbled path
    (bytes32[] memory path1, bytes32 leaf) = merkle.computeSiblingPath(leafIndex);
    bytes32 temp1 = path1[0];
    path1[0] = path1[path1.length - 1];
    path1[path1.length - 1] = temp1;
    vm.expectRevert();
    merkleLibHelper.verifyMembership(path1, leaf, leafIndex, expectedRoot);

    // Tests truncated path
    (bytes32[] memory path2,) = merkle.computeSiblingPath(leafIndex);
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

  function testVerifyMembershipWithRandomSiblingPaths(
    uint256 _idx,
    bytes32[DEPTH] memory _siblingPath
  ) public {
    uint256 leafIndex = _idx % (2 ** DEPTH);
    bytes32 expectedRoot = merkle.computeRoot();

    bytes32[] memory siblingPath = new bytes32[](DEPTH);
    for (uint256 i = 0; i < _siblingPath.length; i++) {
      siblingPath[i] = _siblingPath[i];
    }

    bytes32 leaf = sha256(abi.encode(leafIndex + 1));

    vm.expectRevert();
    merkleLibHelper.verifyMembership(siblingPath, leaf, leafIndex, expectedRoot);
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
  }
}
