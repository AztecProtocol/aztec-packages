// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";

import {SampleLib} from "@aztec/core/libraries/crypto/SampleLib.sol";

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

  function testSampleFuzz(uint8 _committeeSize, uint8 _validatorSetSize, uint256 _seed) public {
    vm.assume(_committeeSize <= _validatorSetSize);
    vm.assume(_committeeSize > 0);
    vm.assume(_seed != 0); // Seed is computed from a hash, which we can safetly assume is non zero

    uint256[] memory committee = sampler.computeCommittee(_committeeSize, _validatorSetSize, _seed);

    // Check that none of the indices are the same
    for (uint256 i = 0; i < _committeeSize; i++) {
      for (uint256 j = i + 1; j < _committeeSize; j++) {
        assertNotEq(committee[i], committee[j], "Indices are the same");
      }
    }
  }

  function test_dirtySample(uint8 _committeeSize, uint16 _validatorSetSize, uint256 _seed) public {
    vm.assume(_validatorSetSize < 2 ** 12 - 1);
    vm.assume(_committeeSize <= _validatorSetSize);
    vm.assume(_committeeSize > 0);
    vm.assume(_seed != 0); // Seed is computed from a hash, which we can safetly assume is non zero

    // We sample 3 committees in the same tx, so if we fail to clear it should explode.
    uint256[] memory committee1 = sampler.computeCommittee(_committeeSize, _validatorSetSize, _seed);
    uint256[] memory committee2 = sampler.computeCommittee(_committeeSize, _validatorSetSize, _seed);
    uint256[] memory committee3 = sampler.computeCommittee(_committeeSize, _validatorSetSize, _seed);

    assertEq(committee1, committee2);
    assertEq(committee1, committee3);
    assertEq(committee2, committee3);
  }
}
