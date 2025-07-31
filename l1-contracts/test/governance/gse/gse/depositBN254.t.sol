// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {BLS} from "@aztec/governance/libraries/BLS.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {Timestamp} from "@aztec/shared/libraries/TimeMath.sol";
import {Withdrawal} from "@aztec/governance/interfaces/IGovernance.sol";
// import {IGSECore} from "@aztec/governance/GSE.sol";
import {stdStorage, StdStorage} from "forge-std/Test.sol";
import {WithGSE} from "./base.sol";

contract DepositBN254Test is WithGSE {
  using stdStorage for StdStorage;

  uint256 private sk = 0x7777777;
  uint256[2] private pk1;
  uint256[4] private pk2;
  uint256[2] private sigma;

  function setUp() public override {
    super.setUp();
    stdstore.target(address(gse)).sig("checkProofOfPossession()").checked_write(true);
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
    vm.expectRevert(abi.encodeWithSelector(BLS.pk1Zero.selector));
    gse.deposit(
      address(0),
      address(0),
      [uint256(0), uint256(0)],
      [uint256(0), uint256(0), uint256(0), uint256(0)],
      [uint256(0), uint256(0)],
      _moveWithLatestRollup
    );
  }

  modifier whenTheDepositKeysPassTheProofOfPossessionCheck() {
    // Generate Public Key
    {
      pk1 = BLS.ecMul([BLS.G1_X, BLS.G1_Y], sk);
      // See yarn-project/ethereum/src/test/bn254_registration.test.ts for construction of pk2
      pk2 = [
        12000187580290590047264785709963395816646295176893602234201956783324175839805,
        17931071651819835067098563222910421513876328033572114834306979690881549564414,
        3847186948811352011829434621581350901968531448585779990319356482934947911409,
        9611549517545166944736557219282359806761534888544046901025233666228290030286
      ];
      bytes memory pk1Bytes = abi.encodePacked(pk1[0], pk1[1]);

      uint256[2] memory pk1DigestPoint = BLS.hashToPoint(BLS.STAKING_DOMAIN_SEPARATOR, pk1Bytes);

      sigma = BLS.ecMul(pk1DigestPoint, sk);
    }
    _;
  }

  modifier whenProofOfPossessionHasBeenSeenBefore(
    address _instance,
    address _attester,
    address _withdrawer,
    bool _moveWithLatestRollup
  ) {
    {
      uint256 depositAmount = gse.DEPOSIT_AMOUNT();

      vm.prank(stakingAsset.owner());
      stakingAsset.mint(address(_instance), depositAmount);

      vm.startPrank(_instance);
      stakingAsset.approve(address(gse), depositAmount);
      gse.deposit(_attester, _withdrawer, pk1, pk2, sigma, _moveWithLatestRollup);
      vm.stopPrank();
    }
    _;
  }

  function test_WhenTheOriginalKeyHolderIsStillActive(
    address _instance,
    address _attester1,
    address _attester2,
    address _withdrawer,
    bool _moveWithLatestRollup
  )
    external
    whenCallerIsRegisteredRollup(_instance)
    whenTheDepositKeysPassTheProofOfPossessionCheck
    whenProofOfPossessionHasBeenSeenBefore(_instance, _attester1, _withdrawer, _moveWithLatestRollup)
  {
    // it reverts
    uint256 depositAmount = gse.DEPOSIT_AMOUNT();

    vm.prank(stakingAsset.owner());
    stakingAsset.mint(address(_instance), depositAmount);

    vm.startPrank(_instance);
    stakingAsset.approve(address(gse), depositAmount);
    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.GSE__ProofOfPossessionAlreadySeen.selector,
        keccak256(abi.encodePacked(pk1[0], pk1[1]))
      )
    );
    gse.deposit(_attester2, _withdrawer, pk1, pk2, sigma, _moveWithLatestRollup);
    vm.stopPrank();
  }

  function test_WhenTheOriginalKeyHolderIsNotActive(
    address _instance,
    address _attester1,
    address _withdrawer,
    bool _moveWithLatestRollup
  )
    external
    whenCallerIsRegisteredRollup(_instance)
    whenTheDepositKeysPassTheProofOfPossessionCheck
    whenProofOfPossessionHasBeenSeenBefore(_instance, _attester1, _withdrawer, _moveWithLatestRollup)
  {
    // it adds the keys
    vm.startPrank(_instance);
    (, bool removed, uint256 withdrawalId) = gse.withdraw(_attester1, gse.DEPOSIT_AMOUNT());
    vm.stopPrank();

    assertEq(removed, true);
    assertEq(withdrawalId, 0);

    Withdrawal memory withdrawal = governance.getWithdrawal(withdrawalId);
    vm.warp(Timestamp.unwrap(withdrawal.unlocksAt));

    gse.finaliseHelper(withdrawalId);

    vm.startPrank(stakingAsset.owner());
    stakingAsset.mint(address(_instance), gse.DEPOSIT_AMOUNT());
    vm.stopPrank();

    vm.startPrank(_instance);
    stakingAsset.approve(address(gse), gse.DEPOSIT_AMOUNT());
    gse.deposit(_attester1, _withdrawer, pk1, pk2, sigma, _moveWithLatestRollup);
    vm.stopPrank();
  }

  function test_WhenProofOfPossessionHasNotBeenSeenBefore()
    external
    whenTheDepositKeysPassTheProofOfPossessionCheck
  {
    // it adds the keys
  }
}
