// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";

import {SampleLib} from "@aztec/core/libraries/crypto/SampleLib.sol";

import "forge-std/console.sol";

// Adding a contract to get some gas-numbers out.
contract Sampler {
  function computeCommittee(uint256 _committeeSize, uint256 _indexCount, uint256 _seed)
    public
    returns (uint256[] memory)
  {
    return SampleLib.computeCommittee(_committeeSize, _indexCount, _seed);
  }
}

contract SamplingTest is Test {
  Sampler sampler = new Sampler();

  function testShuffle() public {
    // Sizes pulled out of thin air
    uint256 setSize = 1024;
    uint256 commiteeSize = 32;

    uint256[] memory indices = new uint256[](setSize);
    for (uint256 i = 0; i < setSize; i++) {
      indices[i] = i;
    }

    uint256[] memory shuffledIndices = new uint256[](setSize);
    uint256 seed = uint256(keccak256(abi.encodePacked("seed1")));

    uint256[] memory committee = sampler.computeCommittee(commiteeSize, setSize, seed);

    for (uint256 i = 0; i < commiteeSize; i++) {
      console.log("committee[%d]", committee[i]);
    }
  }
}
