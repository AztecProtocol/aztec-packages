// SPDX-License-Identifier: Apache-2.0
// Copyright 2023 Aztec Labs.
pragma solidity >=0.8.18;

import {Test} from "forge-std/Test.sol";

import {NaiveMerkle} from "./Naive.sol";
import {FrontierMerkle} from "./../../src/core/messagebridge/frontier_tree/Frontier.sol";
import {Constants} from "../../src/core/libraries/ConstantsGen.sol";

import "forge-std/console.sol";

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
    assertEq(frontier.root(), expectedRoot, "Root does not match Noir's root");
  }
}
