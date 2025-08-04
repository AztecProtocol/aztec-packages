// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {BN254Lib, G1Point, G2Point} from "@aztec/shared/libraries/BN254Lib.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {AttesterConfig} from "@aztec/governance/GSE.sol";
import {stdStorage, StdStorage} from "forge-std/Test.sol";
import {WithGSE} from "./base.sol";

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
    stdstore.target(address(gse)).sig("checkProofOfPossession()").checked_write(true);
    // See yarn-project/ethereum/src/test/bn254_registration.test.ts for construction of pk2
    // Prefilling here, and the rest of the data will be generated using the helper
    // generateProofsOfPossession()
    proofOfPossessions[sk1].pk2 = G2Point({
      x1: 12000187580290590047264785709963395816646295176893602234201956783324175839805,
      x0: 17931071651819835067098563222910421513876328033572114834306979690881549564414,
      y1: 3847186948811352011829434621581350901968531448585779990319356482934947911409,
      y0: 9611549517545166944736557219282359806761534888544046901025233666228290030286
    });
    generateProofsOfPossession(sk1);

    proofOfPossessions[sk2].pk2 = G2Point({
      x1: 1508004737965051103384491280975170100170616215043110680634427285854533421349,
      x0: 2276549912948331340977885552999684185609731617727385907945409014914655706355,
      y1: 12411732771141425816085037286206083986670633222105118555909903595342512393131,
      y0: 5774481376093013975280852628790789958927737066979135638334935597723797963109
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

  function test_WhenTheDepositKeysDoNotPassTheProofOfPossessionCheck(
    address _instance,
    bool _moveWithLatestRollup
  ) external whenCallerIsRegisteredRollup(_instance) {
    // it reverts
    vm.prank(_instance);
    vm.expectRevert(abi.encodeWithSelector(BN254Lib.Pk1Zero.selector));
    gse.deposit(
      address(0),
      address(0),
      BN254Lib.g1Zero(),
      BN254Lib.g2Zero(),
      BN254Lib.g1Zero(),
      _moveWithLatestRollup
    );
  }

  function test_WhenTheDepositKeysPassTheProofOfPossessionCheck(
    address _instance,
    address _attester1,
    address _attester2,
    address _withdrawer,
    bool _moveWithLatestRollup
  ) external whenCallerIsRegisteredRollup(_instance) {
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
          Errors.GSE__CannotChangePublicKeys.selector,
          proofOfPossessions[sk1].pk1.x,
          proofOfPossessions[sk1].pk1.y
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
          Errors.GSE__CannotChangePublicKeys.selector,
          proofOfPossessions[sk1].pk1.x,
          proofOfPossessions[sk1].pk1.y
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
    G1Point memory sigma = BN254Lib.g1Mul(
      BN254Lib.hashToPoint(BN254Lib.STAKING_DOMAIN_SEPARATOR, abi.encodePacked(pk1.x, pk1.y)), _sk
    );
    proofOfPossessions[_sk] = ProofOfPossession({
      pk1: pk1,
      // pk2 must be prefilled
      pk2: proofOfPossessions[_sk].pk2,
      sigma: sigma
    });
  }
}
