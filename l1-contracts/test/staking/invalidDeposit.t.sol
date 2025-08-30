// SPDX-License-Identifier: UNLICENSED
// solhint-disable func-name-mixedcase
// solhint-disable imports-order
// solhint-disable comprehensive-interface
// solhint-disable ordering

pragma solidity >=0.8.27;

import {StakingBase} from "./base.t.sol";
import {GSE} from "@aztec/governance/GSE.sol";
import {StakingQueueConfig} from "@aztec/core/libraries/compressed-data/StakingQueueConfig.sol";
import {Rollup} from "@aztec/core/Rollup.sol";
import {G1Point, G2Point} from "@aztec/shared/libraries/BN254Lib.sol";
import {BN254Fixtures} from "../shared/BN254Fixtures.t.sol";
import {stdStorage, StdStorage} from "forge-std/Test.sol";
import {GSEWithSkip} from "@test/GSEWithSkip.sol";

contract InvalidPointsFlushEntryQueueTest is StakingBase, BN254Fixtures {
  using stdStorage for StdStorage;

  struct ProofOfPossession {
    G1Point pk1;
    G2Point pk2;
    G1Point sigma;
  }

  uint256 private activationThreshold;
  uint256 private epochSeconds;

  function setUp() public override(BN254Fixtures, StakingBase) {
    BN254Fixtures.setUp();
    StakingBase.setUp();

    GSE gse = staking.getGSE();
    GSEWithSkip(address(gse)).setCheckProofOfPossession(true);

    StakingQueueConfig memory stakingQueueConfig = StakingQueueConfig({
      bootstrapValidatorSetSize: 0,
      bootstrapFlushSize: 0,
      normalFlushSizeMin: 2,
      normalFlushSizeQuotient: 1,
      maxQueueFlushSize: 48
    });

    Rollup rollup = Rollup(address(registry.getCanonicalRollup()));
    vm.prank(rollup.owner());
    rollup.updateStakingQueueConfig(stakingQueueConfig);

    epochSeconds = rollup.getEpochDuration() * rollup.getSlotDuration();
  }

  function test_invalid_points() public {
    // Ensure we got enough keys to walk over each of the cases below
    assertGt(fixtureData.sampleKeys.length, 6, "not enough keys");

    GSE gse = staking.getGSE();
    activationThreshold = gse.ACTIVATION_THRESHOLD();

    for (uint256 i = 0; i + 1 < fixtureData.sampleKeys.length; i += 2) {
      FixtureKey memory key1 = fixtureData.sampleKeys[i];
      FixtureKey memory key2 = fixtureData.sampleKeys[i + 1];
      G1Point memory proof1 = signRegistrationDigest(key1.sk);
      G1Point memory proof2 = signRegistrationDigest(key2.sk);

      // Ensure that failures happen regardless of which point is invalid
      uint256 invalidXCoord = uint256(keccak256(abi.encodePacked("https://www.youtube.com/watch?v=glN0W8WogK8")));
      if (i % 3 == 0) {
        key1.pk1.x = invalidXCoord;
      } else if (i % 3 == 1) {
        key1.pk2.x0 = invalidXCoord;
      } else {
        proof1.x = invalidXCoord;
      }

      vm.prank(stakingAsset.owner());
      stakingAsset.mint(address(this), activationThreshold * 2);
      stakingAsset.approve(address(staking), activationThreshold * 2);
      uint256 balance = stakingAsset.balanceOf(address(staking));
      staking.deposit(address(uint160(key1.pk1.x)), address(uint160(key1.pk1.y)), key1.pk1, key1.pk2, proof1, true);
      staking.deposit(address(uint160(key2.pk1.x)), address(uint160(key2.pk1.y)), key2.pk1, key2.pk2, proof2, true);
      assertEq(stakingAsset.balanceOf(address(staking)), balance + activationThreshold * 2, "invalid balance");
    }

    uint256 active = staking.getActiveAttesterCount();
    assertEq(active, 0, "invalid active attester count before");
    while (staking.getEntryQueueLength() > 0) {
      staking.flushEntryQueue{gas: 15_000_000}();
      vm.warp(block.timestamp + epochSeconds);
    }

    assertEq(staking.getActiveAttesterCount(), fixtureData.sampleKeys.length / 2, "invalid active attester count after");
  }
}
