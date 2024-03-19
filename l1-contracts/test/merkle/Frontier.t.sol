// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.18;

import {Test} from "forge-std/Test.sol";

import {Hash} from "../../src/core/libraries/Hash.sol";
import {FrontierMerkle} from "./../../src/core/messagebridge/frontier_tree/Frontier.sol";

contract FrontierTest is Test {
  mapping(uint256 index => bytes32 leaf) public leaves;

  function setUp() public {}

  // TODO(Miranda): Once NewOutbox is complete, both it and NewInbox will use the truncated SHA
  // tree. The below fn replaces Naive.sol while NewOutbox is being worked on.
  function _computeRootTruncated(uint256 _depth) internal view returns (bytes32) {
    uint256 size = 2 ** _depth;
    bytes32[] memory nodes = new bytes32[](size / 2);

    for (uint256 i = 0; i < _depth; i++) {
      for (uint256 j = 0; j < size; j += 2) {
        if (i == 0) {
          nodes[j / 2] = Hash.sha256ToField(bytes.concat(leaves[j], leaves[j + 1]));
        } else {
          nodes[j / 2] = Hash.sha256ToField(bytes.concat(nodes[j], nodes[j + 1]));
        }
      }
      size /= 2;
    }
    return nodes[0];
  }

  function testFrontier() public {
    // reduced from 10 to 5 due to OOG error w/ above temp fn
    uint256 depth = 5;

    FrontierMerkle frontier = new FrontierMerkle(depth);

    uint256 upper = frontier.SIZE();
    for (uint256 i = 0; i < upper; i++) {
      bytes32 leaf = sha256(abi.encode(i + 1));
      leaves[i] = leaf;
      frontier.insertLeaf(leaf);
      assertEq(_computeRootTruncated(depth), frontier.root(), "Frontier Roots should be equal");
    }
  }
}
