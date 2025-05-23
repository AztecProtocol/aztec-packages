// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {SampleLib} from "@aztec/core/libraries/crypto/SampleLib.sol";
import {Test} from "forge-std/Test.sol";

// solhint-disable comprehensive-interface
// solhint-disable func-name-mixedcase

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
  Sampler public sampler = new Sampler();

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

  function testSimpleSample() public {
    uint256 saw0 = 0;
    uint256 saw1 = 0;

    for (uint256 i = 0; i < 1000; i++) {
      uint256[] memory committee = sampler.computeCommittee(1, 2, i);
      assertEq(committee.length, 1, "committee length is 1");
      if (committee[0] == 0) {
        saw0++;
      } else {
        saw1++;
      }
    }
    assertGt(saw0, 400, "should have seen more 0s");
    assertGt(saw1, 400, "should have seen more 1s");
  }
}
