// SPDX-License-Identifier: Apache-2.0
// Copyright 2023 Aztec Labs.
pragma solidity >=0.8.18;

import {Test} from "forge-std/Test.sol";

contract NaiveMerkle is Test {
  uint256 public immutable DEPTH;
  uint256 public immutable SIZE;

  uint256 public nextIndex = 0;

  mapping(uint256 index => bytes32 leaf) public leafs;

  constructor(uint256 _depth) {
    DEPTH = _depth;
    SIZE = 2 ** _depth;
  }

  function insertLeaf(bytes32 _leaf) public {
    leafs[nextIndex++] = _leaf;
  }

  function computeRoot() public view returns (bytes32) {
    bytes32[] memory nodes = new bytes32[](SIZE / 2);
    uint256 size = SIZE;
    for (uint256 i = 0; i < DEPTH; i++) {
      for (uint256 j = 0; j < size; j += 2) {
        if (i == 0) {
          nodes[j / 2] = sha256(bytes.concat(leafs[j], leafs[j + 1]));
        } else {
          nodes[j / 2] = sha256(bytes.concat(nodes[j], nodes[j + 1]));
        }
      }
      size /= 2;
    }
    return nodes[0];
  }

  function computeSiblingPath(uint256 _index) public view returns (bytes32[] memory, bytes32) {
    bytes32[] memory path = new bytes32[](DEPTH);

    // IMPLEMENT
    return (path, leafs[_index]);
  }

  function verifyMembership(bytes32[] memory _path, bytes32 _leaf, uint256 _index) public returns (bool) {
    bytes32 root;
    uint256 index = _index;

    for (uint256 i = 0; i < _path.length; i++) {
      if (i == 0) {
        root = sha256(bytes.concat(_leaf, _path[i]));
      }
      emit log_named_bytes32("Root", root);
    }

    return computeRoot() == root;
  }
}
