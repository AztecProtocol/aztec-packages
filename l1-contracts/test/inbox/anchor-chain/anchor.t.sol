// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {
  InboxAnchorChainLib,
  InboxAnchorChain,
  InboxAnchor,
  InboxAnchorLib,
  InboxAnchorHash
} from "@aztec/core/libraries/crypto/InboxAnchorChain.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";

contract AnchorChainWrapper {
  using InboxAnchorChainLib for InboxAnchorChain;

  InboxAnchorChain public chain;

  constructor(bytes32 _root) {
    chain.initialize(_root);
  }

  function lowerAnchor(bytes32 _root, uint256 _blockNumber) public {
    chain.lowerAnchor(_root, _blockNumber);
  }

  function getLastAnchorBlockNumber() public view returns (uint256) {
    return chain.getLastAnchorBlockNumber();
  }

  function getAnchorHash(uint256 _blockNumber) public view returns (InboxAnchorHash) {
    return chain.getAnchorHash(_blockNumber);
  }

  function hasAnchor(uint256 _blockNumber) public view returns (bool) {
    return chain.hasAnchor(_blockNumber);
  }

  function isAnchor(uint256 _blockNumber, InboxAnchorHash _anchorHash) public view returns (bool) {
    return chain.isAnchor(_blockNumber, _anchorHash);
  }

  function isAnchor(InboxAnchor memory _anchor) public view returns (bool) {
    return chain.isAnchor(_anchor);
  }

  function validateAnchorChain(InboxAnchor[] memory _chain) public view returns (bool) {
    return chain.validateAnchorChain(_chain);
  }

  function getGenesisAnchor(bytes32 _root) public pure returns (InboxAnchor memory) {
    return InboxAnchorChainLib.getGenesisAnchor(_root);
  }
}

contract AnchorChainTest is Test {
  using InboxAnchorLib for InboxAnchor;

  bytes32 public constant EMPTY_ROOT = bytes32("EMPTY_ROOT");
  AnchorChainWrapper public anchorChain;

  InboxAnchor[] public expectedChain;

  function setUp() public {
    anchorChain = new AnchorChainWrapper(EMPTY_ROOT);
  }

  function test_already_populated() public {
    anchorChain.lowerAnchor(EMPTY_ROOT, 1);
    vm.expectRevert(abi.encodeWithSelector(Errors.Inbox__AlreadyPopulated.selector, 1));
    anchorChain.lowerAnchor(EMPTY_ROOT, 1);
  }

  function test_cannot_lower_anchor_to_a_block_before_last_anchor() public {
    anchorChain.lowerAnchor(EMPTY_ROOT, 2);
    vm.expectRevert(abi.encodeWithSelector(Errors.Inbox__CannotLowerAnchorInPast.selector, 1, 2));
    anchorChain.lowerAnchor(EMPTY_ROOT, 1);
  }

  modifier createAnchorChain(uint8[8] memory _jumps) {
    expectedChain.push(anchorChain.getGenesisAnchor(EMPTY_ROOT));

    for (uint256 i = 0; i < _jumps.length; i++) {
      uint256 bn = anchorChain.getLastAnchorBlockNumber() + bound(_jumps[i], 1, 16);

      bytes32 root = keccak256(abi.encode("root", bn));

      vm.expectEmit(true, true, true, true, address(anchorChain));
      emit InboxAnchorChainLib.AnchorLowered(
        InboxAnchor({root: root, blockNumber: bn, parent: expectedChain[i].hash()})
      );
      anchorChain.lowerAnchor(root, bn);
      expectedChain.push(
        InboxAnchor({root: root, blockNumber: bn, parent: expectedChain[i].hash()})
      );

      assertEq(anchorChain.getLastAnchorBlockNumber(), bn);
      assertEq(
        InboxAnchorHash.unwrap(anchorChain.getAnchorHash(bn)),
        InboxAnchorHash.unwrap(expectedChain[i + 1].hash())
      );
    }

    _;
  }

  function test_subsectionOfAnchorChain(uint8[8] memory _jumps, uint256 _start, uint256 _end)
    public
    createAnchorChain(_jumps)
  {
    uint256 size = expectedChain.length;

    // Pick start and end index from the anchor chain.
    uint256 start = bound(_start, 0, size - 1);
    uint256 end = bound(_end, start, size - 1);

    // Check that subsections is in the anchor chain.
    uint256 subsectionSize = end - start + 1;
    InboxAnchor[] memory subsection = new InboxAnchor[](subsectionSize);
    for (uint256 i = 0; i < subsectionSize; i++) {
      subsection[i] = expectedChain[start + i];
    }
    assertEq(anchorChain.validateAnchorChain(subsection), true);
  }

  function test_startNotInAnchorChain(uint8[8] memory _jumps) public createAnchorChain(_jumps) {
    InboxAnchor[] memory subsection = new InboxAnchor[](1);
    subsection[0] = InboxAnchor({
      root: keccak256(abi.encode("start is out of bounds")),
      blockNumber: anchorChain.getLastAnchorBlockNumber() + 1,
      parent: expectedChain[expectedChain.length - 1].hash()
    });

    assertEq(anchorChain.isAnchor(subsection[0]), false);
    assertEq(anchorChain.validateAnchorChain(subsection), false);
  }

  function test_endNotInAnchorChain(uint8[8] memory _jumps, uint256 _start, uint256 _end)
    public
    createAnchorChain(_jumps)
  {
    uint256 size = expectedChain.length;
    uint256 start = bound(_start, 0, size - 1);
    uint256 end = bound(_end, start, size - 1);

    // Check that subsections is in the anchor chain.
    uint256 subsectionSize = end - start + 2;
    InboxAnchor[] memory subsection = new InboxAnchor[](subsectionSize);
    for (uint256 i = 0; i < subsectionSize - 1; i++) {
      subsection[i] = expectedChain[start + i];
    }

    subsection[subsectionSize - 1] = InboxAnchor({
      root: keccak256(abi.encode("out is not in the chain")),
      blockNumber: size + 1,
      parent: subsection[subsectionSize - 2].hash()
    });

    assertEq(anchorChain.isAnchor(subsection[subsectionSize - 2]), true);
    assertEq(anchorChain.isAnchor(subsection[subsectionSize - 1]), false);
    assertEq(anchorChain.validateAnchorChain(subsection), false);
  }
}
