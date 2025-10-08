// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {BN254Lib, G1Point, G2Point} from "@aztec/shared/libraries/BN254Lib.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {AttesterConfig} from "@aztec/governance/GSE.sol";
import {stdStorage, StdStorage} from "forge-std/Test.sol";
import {WithGSE} from "./base.sol";
import {GSEWithSkip} from "@test/GSEWithSkip.sol";

contract DepositBN254Test is WithGSE {
  using stdStorage for StdStorage;

  struct ProofOfPossession {
    G1Point pk1;
    G2Point pk2;
    G1Point sigma;
  }

  uint256 private sk1 = 0x7777777;
  uint256 private sk2 = 0x8888888;

  mapping(uint256 sk => ProofOfPossession proofOfPossession) private proofOfPossessions;

  function setUp() public override {
    super.setUp();
    GSEWithSkip(address(gse)).setCheckProofOfPossession(true);
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
  }

  modifier whenCallerIsRegisteredRollup(address _instance) {
    vm.assume(_instance != address(0) && _instance != gse.BONUS_INSTANCE_ADDRESS());
    vm.assume(gse.isRollupRegistered(_instance) == false);

    vm.prank(gse.owner());
    gse.addRollup(_instance);

    _;
  }

  function test_WhenTheDepositKeysDoNotPassTheProofOfPossessionCheck(address _instance, bool _moveWithLatestRollup)
    external
    whenCallerIsRegisteredRollup(_instance)
  {
    // it reverts
    vm.prank(_instance);
    vm.expectRevert(abi.encodeWithSelector(BN254Lib.InfinityNotAllowed.selector));
    gse.deposit(address(1), address(0), BN254Lib.g1Zero(), BN254Lib.g2Zero(), BN254Lib.g1Zero(), _moveWithLatestRollup);
  }

  function test_WhenTheDepositKeysPassTheProofOfPossessionCheck(
    address _instance,
    address _attester1,
    address _attester2,
    address _withdrawer,
    bool _moveWithLatestRollup
  ) external whenCallerIsRegisteredRollup(_instance) {
    vm.assume(_attester1 != address(0));
    vm.assume(_attester2 != address(0));
    vm.assume(_attester1 != _attester2);
    // it adds the keys if they are new
    uint256 activationThreshold = gse.ACTIVATION_THRESHOLD();

    {
      emit log_string("Deposit pk1 and pk2 for _attester1 should work");
      vm.prank(stakingAsset.owner());
      stakingAsset.mint(address(_instance), activationThreshold);
      vm.startPrank(_instance);
      stakingAsset.approve(address(gse), activationThreshold);
      G1Point memory pk1 = proofOfPossessions[sk1].pk1;
      G2Point memory pk2 = proofOfPossessions[sk1].pk2;
      G1Point memory sigma = proofOfPossessions[sk1].sigma;
      gse.deposit(_attester1, _withdrawer, pk1, pk2, sigma, _moveWithLatestRollup);
      vm.stopPrank();
    }

    {
      emit log_string("Getting attester1's public key should work");
      address[] memory attesters = new address[](1);
      attesters[0] = _attester1;
      G1Point[] memory publicKeys = gse.getG1PublicKeysFromAddresses(attesters);
      assertEq(publicKeys.length, 1);
      assertEq(publicKeys[0].x, proofOfPossessions[sk1].pk1.x);
      assertEq(publicKeys[0].y, proofOfPossessions[sk1].pk1.y);
    }

    {
      emit log_string("Try to deposit pk1 and pk2 for _attester2 should revert");
      vm.prank(stakingAsset.owner());
      stakingAsset.mint(address(_instance), activationThreshold);

      vm.startPrank(_instance);
      stakingAsset.approve(address(gse), activationThreshold);
      vm.expectRevert(
        abi.encodeWithSelector(
          Errors.GSE__ProofOfPossessionAlreadySeen.selector,
          keccak256(abi.encodePacked(proofOfPossessions[sk1].pk1.x, proofOfPossessions[sk1].pk1.y))
        )
      );
      gse.deposit(
        _attester2,
        _withdrawer,
        proofOfPossessions[sk1].pk1,
        proofOfPossessions[sk1].pk2,
        proofOfPossessions[sk1].sigma,
        _moveWithLatestRollup
      );
      vm.stopPrank();
    }

    {
      emit log_string("Withdraw attester1");
      vm.startPrank(_instance);
      (, bool removed, uint256 withdrawalId) = gse.withdraw(_attester1, gse.ACTIVATION_THRESHOLD());
      vm.stopPrank();

      assertEq(removed, true);
      assertEq(withdrawalId, 0);
    }

    {
      emit log_string("Getting attester1's public key should work still work");
      address[] memory attesters = new address[](1);
      attesters[0] = _attester1;
      G1Point[] memory publicKeys = gse.getG1PublicKeysFromAddresses(attesters);
      assertEq(publicKeys.length, 1);
      assertEq(publicKeys[0].x, proofOfPossessions[sk1].pk1.x);
      assertEq(publicKeys[0].y, proofOfPossessions[sk1].pk1.y);
    }

    {
      emit log_string("Try to deposit pk1 and pk2 for _attester2 again should still revert");
      vm.prank(stakingAsset.owner());
      stakingAsset.mint(address(_instance), activationThreshold);

      vm.startPrank(_instance);
      stakingAsset.approve(address(gse), activationThreshold);
      vm.expectRevert(
        abi.encodeWithSelector(
          Errors.GSE__ProofOfPossessionAlreadySeen.selector,
          keccak256(abi.encodePacked(proofOfPossessions[sk1].pk1.x, proofOfPossessions[sk1].pk1.y))
        )
      );
      gse.deposit(
        _attester2,
        _withdrawer,
        proofOfPossessions[sk1].pk1,
        proofOfPossessions[sk1].pk2,
        proofOfPossessions[sk1].sigma,
        _moveWithLatestRollup
      );
      vm.stopPrank();
    }

    {
      emit log_string("Coming back as attester1 with different keys should revert");
      vm.prank(stakingAsset.owner());
      stakingAsset.mint(address(_instance), activationThreshold);
      vm.startPrank(_instance);
      stakingAsset.approve(address(gse), activationThreshold);
      vm.expectRevert(
        abi.encodeWithSelector(
          Errors.GSE__CannotChangePublicKeys.selector, proofOfPossessions[sk1].pk1.x, proofOfPossessions[sk1].pk1.y
        )
      );
      gse.deposit(
        _attester1,
        _withdrawer,
        proofOfPossessions[sk2].pk1,
        proofOfPossessions[sk2].pk2,
        proofOfPossessions[sk2].sigma,
        _moveWithLatestRollup
      );
      vm.stopPrank();
    }

    {
      emit log_string("Coming back as attester1 with the same keys should revert");
      vm.prank(stakingAsset.owner());
      stakingAsset.mint(address(_instance), activationThreshold);
      vm.startPrank(_instance);
      stakingAsset.approve(address(gse), activationThreshold);
      vm.expectRevert(
        abi.encodeWithSelector(
          Errors.GSE__CannotChangePublicKeys.selector, proofOfPossessions[sk1].pk1.x, proofOfPossessions[sk1].pk1.y
        )
      );
      gse.deposit(
        _attester1,
        _withdrawer,
        proofOfPossessions[sk1].pk1,
        proofOfPossessions[sk1].pk2,
        proofOfPossessions[sk1].sigma,
        _moveWithLatestRollup
      );
      vm.stopPrank();
    }

    {
      emit log_string("Depositing a fresh key for attester2 should work");
      vm.prank(stakingAsset.owner());
      stakingAsset.mint(address(_instance), activationThreshold);
      vm.startPrank(_instance);
      stakingAsset.approve(address(gse), activationThreshold);
      gse.deposit(
        _attester2,
        _withdrawer,
        proofOfPossessions[sk2].pk1,
        proofOfPossessions[sk2].pk2,
        proofOfPossessions[sk2].sigma,
        _moveWithLatestRollup
      );
      vm.stopPrank();
    }

    {
      emit log_string("Getting attester2's public key should work");
      address[] memory attesters = new address[](2);
      attesters[0] = _attester1;
      attesters[1] = _attester2;
      G1Point[] memory publicKeys = gse.getG1PublicKeysFromAddresses(attesters);
      assertEq(publicKeys.length, 2);
      assertEq(publicKeys[0].x, proofOfPossessions[sk1].pk1.x);
      assertEq(publicKeys[0].y, proofOfPossessions[sk1].pk1.y);
      assertEq(publicKeys[1].x, proofOfPossessions[sk2].pk1.x);
      assertEq(publicKeys[1].y, proofOfPossessions[sk2].pk1.y);
    }
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
