// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {ValidatorSelectionTestBase, CheatDepositArgs} from "./ValidatorSelectionBase.sol";
import {Epoch, Timestamp, TimeLib} from "@aztec/core/libraries/TimeLib.sol";
import {Checkpoints} from "@oz/utils/structs/Checkpoints.sol";
import {IValidatorSelection} from "@aztec/core/interfaces/IValidatorSelection.sol";
import {TestConstants} from "../harnesses/TestConstants.sol";
import {BN254Lib, G1Point, G2Point} from "@aztec/shared/libraries/BN254Lib.sol";
import {GSE} from "@aztec/governance/GSE.sol";

contract SeedAndSizeSnapshotsTest is ValidatorSelectionTestBase {
  using TimeLib for Timestamp;
  using TimeLib for Epoch;

  uint256 internal $currentsize = 4;
  mapping(uint256 slot => uint256 size) internal $sizes;
  mapping(uint256 slot => uint256 randao) internal $randaos;

  function test_seedAndSizeSnapshots() public setup(4, 4) {
    // We set up the initial
    $sizes[timeCheater.getCurrentSlot()] = $currentsize;
    $randaos[timeCheater.getCurrentSlot()] = block.prevrandao;

    uint256 endEpoch = Epoch.unwrap(timeCheater.getCurrentEpoch()) + 10;

    GSE gse = rollup.getGSE();

    vm.prank(address(testERC20.owner()));
    testERC20.mint(address(rollup), type(uint128).max);
    vm.prank(address(rollup));
    testERC20.approve(address(gse), type(uint128).max);

    while (Epoch.unwrap(timeCheater.getCurrentEpoch()) < endEpoch) {
      timeCheater.cheat__progressSlot();

      uint256 nextRandao = uint256(keccak256(abi.encode(block.prevrandao)));
      vm.prevrandao(nextRandao);

      rollup.checkpointRandao();

      vm.prank(address(rollup));
      gse.deposit(
        address(uint160(nextRandao)),
        address(uint160(nextRandao)),
        BN254Lib.g1Zero(),
        BN254Lib.g2Zero(),
        BN254Lib.g1Zero(),
        true
      );

      $currentsize += 1;
      $sizes[timeCheater.getCurrentSlot()] = $currentsize;
      $randaos[timeCheater.getCurrentSlot()] = nextRandao;

      // We will add one node to the GSE for rollup (impersonate rollup to avoid the queue).
      // We want to see that the lag between current values are the same between randaos and size values

      uint256 epochIndex = Epoch.unwrap(timeCheater.getCurrentEpoch());
      if (epochIndex >= 2) {
        (uint256 seed, uint256 size) = getValues();
        uint256 slot = (epochIndex - 2) * timeCheater.epochDuration();

        assertEq(size, $sizes[slot], "invalid size");
        assertEq(seed, uint256(keccak256(abi.encode(epochIndex, uint224($randaos[slot])))), "invalid seed");
      }
    }
  }

  function getValues() internal view returns (uint256 sampleSeed, uint256 size) {
    // We are always using for an epoch, so we are going to do that here as well
    Timestamp ts = Timestamp.wrap(block.timestamp);

    sampleSeed = rollup.getSampleSeedAt(ts);
    size = rollup.getSamplingSizeAt(ts);
  }
}
