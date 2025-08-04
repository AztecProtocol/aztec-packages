// SPDX-License-Identifier: UNLICENSED
// solhint-disable func-name-mixedcase
// solhint-disable imports-order
// solhint-disable comprehensive-interface
// solhint-disable ordering

pragma solidity >=0.8.27;

import {StakingBase} from "./base.t.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Epoch, Timestamp} from "@aztec/shared/libraries/TimeMath.sol";
import {Status, AttesterView, IStakingCore} from "@aztec/core/interfaces/IStaking.sol";
import {Math} from "@oz/utils/math/Math.sol";
import {GSE, IGSECore} from "@aztec/governance/GSE.sol";
import {StakingQueueLib} from "@aztec/core/libraries/StakingQueue.sol";
import {StakingQueueConfig, StakingQueueConfigLib} from "@aztec/core/libraries/compressed-data/StakingQueueConfig.sol";
import {Rollup} from "@aztec/core/Rollup.sol";
import {BN254Lib, G1Point, G2Point} from "@aztec/shared/libraries/BN254Lib.sol";
import {stdStorage, StdStorage} from "forge-std/Test.sol";

contract ExploitFlushEntryQueueTest is StakingBase {
  using stdStorage for StdStorage;

  struct ProofOfPossession {
    G1Point pk1;
    G2Point pk2;
    G1Point sigma;
  }

  uint256 private sk1 = 0x7777777;
  uint256 private sk2 = 0x8888888;

  mapping(uint256 sk => ProofOfPossession proofOfPossession) private proofOfPossessions;

  uint256 private activationThreshold;

  function setUp() public override {
    super.setUp();
    GSE gse = staking.getGSE();
    stdstore.target(address(gse)).sig("checkProofOfPossession()").checked_write(true);
    // See yarn-project/ethereum/src/test/bn254_registration.test.ts for construction of pk2
    // Prefilling here, and the rest of the data will be generated using the helper
    // generateProofsOfPossession()
    proofOfPossessions[sk1].pk2 = G2Point({
      x1: 12_000_187_580_290_590_047_264_785_709_963_395_816_646_295_176_893_602_234_201_956_783_324_175_839_805,
      x0: 17_931_071_651_819_835_067_098_563_222_910_421_513_876_328_033_572_114_834_306_979_690_881_549_564_414,
      y1: 3_847_186_948_811_352_011_829_434_621_581_350_901_968_531_448_585_779_990_319_356_482_934_947_911_409,
      y0: 9_611_549_517_545_166_944_736_557_219_282_359_806_761_534_888_544_046_901_025_233_666_228_290_030_286
    });
    generateProofsOfPossession(sk1);

    proofOfPossessions[sk2].pk2 = G2Point({
      x1: 1_508_004_737_965_051_103_384_491_280_975_170_100_170_616_215_043_110_680_634_427_285_854_533_421_349,
      x0: 2_276_549_912_948_331_340_977_885_552_999_684_185_609_731_617_727_385_907_945_409_014_914_655_706_355,
      y1: 12_411_732_771_141_425_816_085_037_286_206_083_986_670_633_222_105_118_555_909_903_595_342_512_393_131,
      y0: 5_774_481_376_093_013_975_280_852_628_790_789_958_927_737_066_979_135_638_334_935_597_723_797_963_109
    });
    generateProofsOfPossession(sk2);

    StakingQueueConfig memory stakingQueueConfig = StakingQueueConfig({
      bootstrapValidatorSetSize: 0,
      bootstrapFlushSize: 0,
      normalFlushSizeMin: 2,
      normalFlushSizeQuotient: 1
    });

    Rollup rollup = Rollup(address(registry.getCanonicalRollup()));
    vm.prank(rollup.owner());
    rollup.updateStakingQueueConfig(stakingQueueConfig);
  }

  function generateProofsOfPossession(uint256 _sk) internal {
    G1Point memory pk1 = BN254Lib.g1Mul(BN254Lib.g1Generator(), _sk);
    G1Point memory sigma =
      BN254Lib.g1Mul(BN254Lib.hashToPoint(BN254Lib.STAKING_DOMAIN_SEPARATOR, abi.encodePacked(pk1.x, pk1.y)), _sk);
    proofOfPossessions[_sk] = ProofOfPossession({
      pk1: pk1,
      // pk2 must be prefilled
      pk2: proofOfPossessions[_sk].pk2,
      sigma: sigma
    });
  }

  function test_exploit() public {
    GSE gse = staking.getGSE();
    activationThreshold = gse.ACTIVATION_THRESHOLD();

    address goodAttester = address(0x123);
    address badAttester = address(0x456);

    vm.prank(stakingAsset.owner());
    stakingAsset.mint(address(this), activationThreshold * 2);
    stakingAsset.approve(address(staking), activationThreshold * 2);

    G2Point memory pk2 = proofOfPossessions[sk1].pk2;
    pk2.x0 = uint256(keccak256(abi.encodePacked("https://www.youtube.com/watch?v=glN0W8WogK8")));

    uint256 balance = stakingAsset.balanceOf(address(staking));
    staking.deposit(badAttester, badAttester, proofOfPossessions[sk1].pk1, pk2, proofOfPossessions[sk1].sigma, true);

    assertEq(stakingAsset.balanceOf(address(staking)), balance + activationThreshold, "invalid balance");

    staking.deposit(
      goodAttester,
      goodAttester,
      proofOfPossessions[sk2].pk1,
      proofOfPossessions[sk2].pk2,
      proofOfPossessions[sk2].sigma,
      true
    );

    assertEq(stakingAsset.balanceOf(address(staking)), balance + activationThreshold * 2, "invalid balance");

    uint256 active = staking.getActiveAttesterCount();
    assertEq(active, 0, "invalid active attester count before");

    // Will explode with `Staking__DepositOutOfGas`, but if you dont pass
    // If no gas specified, this will actually pass but consume 1B gas 💀
    staking.flushEntryQueue{gas: 15_000_000}();

    assertEq(staking.getActiveAttesterCount(), 1, "invalid active attester count after");
  }
}
