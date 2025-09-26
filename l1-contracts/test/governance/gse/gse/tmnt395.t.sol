// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {TestBase} from "@test/base/Base.sol";

import {IInstance} from "@aztec/core/interfaces/IInstance.sol";
import {MultiAdder, CheatDepositArgs} from "@aztec/mock/MultiAdder.sol";
import {G1Point, G2Point} from "@aztec/shared/libraries/BN254Lib.sol";
import {RollupBuilder} from "@test/builder/RollupBuilder.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {BN254Lib, G1Point, G2Point} from "@aztec/shared/libraries/BN254Lib.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {AttesterConfig} from "@aztec/governance/GSE.sol";
import {stdStorage, StdStorage} from "forge-std/Test.sol";
import {WithGSE} from "./base.sol";
import {GSEWithSkip} from "@test/GSEWithSkip.sol";
import {Errors as CoreErrors} from "@aztec/core/libraries/Errors.sol";

contract Tmnt395Test is TestBase {
  using stdStorage for StdStorage;

  struct ProofOfPossession {
    G1Point pk1;
    G2Point pk2;
    G1Point sigma;
  }

  IInstance public INSTANCE;
  TestERC20 public STAKING_ASSET;

  uint256 private sk1 = 0x7777777;
  uint256 private sk2 = 0x8888888;

  mapping(uint256 sk => ProofOfPossession proofOfPossession) private proofOfPossessions;

  function setUp() public {
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

    RollupBuilder builder = new RollupBuilder(address(this)).setUpdateOwnerships(false).setCheckProofOfPossession(true)
      .setEntryQueueFlushSizeMin(8).deploy();

    INSTANCE = IInstance(address(builder.getConfig().rollup));
    STAKING_ASSET = builder.getConfig().testERC20;

    vm.prank(STAKING_ASSET.owner());
    STAKING_ASSET.addMinter(address(this));
  }

  function test_malleability_g1() external {
    address withdrawer = makeAddr("withdrawer");
    address attester1 = makeAddr("attester1");
    address attester2 = makeAddr("attester2");

    uint256 activationThreshold = INSTANCE.getActivationThreshold();

    // Adds a point outside the boundary of the curve, that would still satisfy the curve equation if modded.
    {
      emit log_string("Deposit modded pk1 and pk2 for _attester2 should work");
      STAKING_ASSET.mint(address(this), activationThreshold);
      STAKING_ASSET.approve(address(INSTANCE), activationThreshold);
      G1Point memory pk1 = proofOfPossessions[sk1].pk1;
      pk1.x = pk1.x + BN254Lib.BASE_FIELD_ORDER;
      pk1.y = pk1.y + BN254Lib.BASE_FIELD_ORDER;

      G2Point memory pk2 = proofOfPossessions[sk1].pk2;
      G1Point memory sigma = proofOfPossessions[sk1].sigma;
      INSTANCE.deposit(attester2, withdrawer, pk1, pk2, sigma, true);
    }

    {
      emit log_string("Deposit pk1 and pk2 for _attester1 should work");
      STAKING_ASSET.mint(address(this), activationThreshold);
      STAKING_ASSET.approve(address(INSTANCE), activationThreshold);
      G1Point memory pk1 = proofOfPossessions[sk1].pk1;
      G2Point memory pk2 = proofOfPossessions[sk1].pk2;
      G1Point memory sigma = proofOfPossessions[sk1].sigma;
      INSTANCE.deposit(attester1, withdrawer, pk1, pk2, sigma, true);
    }

    vm.expectRevert(abi.encodeWithSelector(CoreErrors.Staking__DepositOutOfGas.selector));
    INSTANCE.flushEntryQueue{gas: 500_000}();

    INSTANCE.flushEntryQueue{gas: 1_500_000}();

    // Ensure that only one of the attesters were added
    assertEq(INSTANCE.getActiveAttesterCount(), 1, "invalid active attester count");
    assertEq(INSTANCE.getEntryQueueLength(), 0, "invalid entry queue length");
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
}
