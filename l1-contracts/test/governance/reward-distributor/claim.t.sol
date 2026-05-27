// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {RewardDistributorBase, FakeRollup} from "./Base.t.sol";

import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {IRollup} from "@aztec/core/interfaces/IRollup.sol";
import {IRewardDistributor} from "@aztec/governance/interfaces/IRewardDistributor.sol";

// Authorization for `claim` is `_amount <= availableTo(msg.sender)`.
// availableTo == specificRecipientBalance for non-canonical callers, and
// (balance - totalEarmarked) + specificRecipientBalance for the canonical caller.
contract ClaimTest is RewardDistributorBase {
  address internal canonical;

  function setUp() public override {
    super.setUp();
    canonical = address(registry.getCanonicalRollup());
  }

  // ---------------------------------------------------------------
  // Authorization
  // ---------------------------------------------------------------

  function test_revertsWhen_callerIsNotCanonicalAndHasNoSubsidy(address _caller, uint256 _amount) external {
    vm.assume(_caller != canonical);
    uint256 amount = bound(_amount, 1, type(uint256).max);

    vm.expectRevert(abi.encodeWithSelector(Errors.RewardDistributor__InsufficientAvailable.selector, amount, 0));
    vm.prank(_caller);
    rewardDistributor.claim(_caller, amount);
  }

  function test_oldRollupCannotClaimMoreThanItsSubsidy(address _old) external {
    vm.assume(_old != canonical && _old != address(0));
    uint256 subsidy = 100e18;
    _subsidize(_old, subsidy);

    vm.expectRevert(
      abi.encodeWithSelector(Errors.RewardDistributor__InsufficientAvailable.selector, subsidy + 1, subsidy)
    );
    vm.prank(_old);
    rewardDistributor.claim(_old, subsidy + 1);
  }

  function test_canonicalCannotDrawFromOtherRollupEarmarked(address _old) external {
    vm.assume(_old != canonical && _old != address(0));
    uint256 subsidy = 100e18;
    _subsidize(_old, subsidy);

    assertEq(rewardDistributor.availableTo(canonical), 0, "canonical should not see other rollup's subsidy");

    vm.expectRevert(abi.encodeWithSelector(Errors.RewardDistributor__InsufficientAvailable.selector, 1, 0));
    vm.prank(canonical);
    rewardDistributor.claim(canonical, 1);
  }

  // ---------------------------------------------------------------
  // Canonical: drains unearmarked first, then dips into its own earmarked
  // ---------------------------------------------------------------

  function test_canonicalClaimsFromUnearmarkedPool(uint256 _balance, uint256 _amount) external {
    uint256 balance = bound(_balance, 1, type(uint128).max);
    uint256 amount = bound(_amount, 1, balance);
    token.mint(address(rewardDistributor), balance);

    assertEq(rewardDistributor.availableTo(canonical), balance);

    uint256 callerBalance = token.balanceOf(canonical);
    vm.prank(canonical);
    rewardDistributor.claim(canonical, amount);

    assertEq(token.balanceOf(canonical), callerBalance + amount);
    assertEq(token.balanceOf(address(rewardDistributor)), balance - amount);
    assertEq(rewardDistributor.totalEarmarkedBalance(), 0, "no earmarked accounting touched");
  }

  function test_canonicalClaim_atUnearmarkedBoundary_doesNotTouchEarmarked() external {
    uint256 unearmarked = 40e18;
    token.mint(address(rewardDistributor), unearmarked);

    uint256 earmarked = 10e18;
    _subsidize(canonical, earmarked);

    vm.prank(canonical);
    rewardDistributor.claim(canonical, unearmarked);

    assertEq(rewardDistributor.specificRecipientBalance(canonical), earmarked, "canonical earmarked untouched");
    assertEq(rewardDistributor.totalEarmarkedBalance(), earmarked, "totalEarmarked untouched");
    assertEq(token.balanceOf(address(rewardDistributor)), earmarked, "balance == remaining earmarked");
  }

  function test_canonicalClaim_oneAboveUnearmarked_pullsOneFromEarmarked() external {
    uint256 unearmarked = 40e18;
    token.mint(address(rewardDistributor), unearmarked);

    uint256 earmarked = 10e18;
    _subsidize(canonical, earmarked);

    vm.prank(canonical);
    rewardDistributor.claim(canonical, unearmarked + 1);

    assertEq(rewardDistributor.specificRecipientBalance(canonical), earmarked - 1);
    assertEq(rewardDistributor.totalEarmarkedBalance(), earmarked - 1);
  }

  function test_canonicalClaim_drainsBothPools() external {
    uint256 unearmarked = 40e18;
    uint256 earmarked = 10e18;
    token.mint(address(rewardDistributor), unearmarked);
    _subsidize(canonical, earmarked);

    vm.prank(canonical);
    rewardDistributor.claim(canonical, unearmarked + earmarked);

    assertEq(rewardDistributor.specificRecipientBalance(canonical), 0);
    assertEq(rewardDistributor.totalEarmarkedBalance(), 0);
    assertEq(token.balanceOf(address(rewardDistributor)), 0);
  }

  // ---------------------------------------------------------------
  // Non-canonical can drain its own earmarked
  // ---------------------------------------------------------------

  function test_oldRollupCanClaimUpToItsSubsidy(address _old, uint256 _subsidy, uint256 _claimAmt) external {
    vm.assume(_old != canonical && _old != address(0));
    uint256 subsidy = bound(_subsidy, 1, type(uint128).max);
    uint256 claimAmt = bound(_claimAmt, 1, subsidy);

    _subsidize(_old, subsidy);

    assertEq(rewardDistributor.specificRecipientBalance(_old), subsidy);
    assertEq(rewardDistributor.totalEarmarkedBalance(), subsidy);

    address recipient = makeAddr("oldRecipient");
    vm.prank(_old);
    rewardDistributor.claim(recipient, claimAmt);

    assertEq(token.balanceOf(recipient), claimAmt);
    assertEq(rewardDistributor.specificRecipientBalance(_old), subsidy - claimAmt);
    assertEq(rewardDistributor.totalEarmarkedBalance(), subsidy - claimAmt);
  }

  // ---------------------------------------------------------------
  // Zero-amount claims are no-ops in either path
  // ---------------------------------------------------------------

  function test_zeroAmountClaim_canonical_isNoop() external {
    token.mint(address(rewardDistributor), 50e18);
    uint256 balBefore = token.balanceOf(address(rewardDistributor));

    vm.prank(canonical);
    rewardDistributor.claim(address(0xbeef), 0);

    assertEq(token.balanceOf(address(rewardDistributor)), balBefore);
    assertEq(token.balanceOf(address(0xbeef)), 0);
    assertEq(rewardDistributor.totalEarmarkedBalance(), 0);
  }

  function test_zeroAmountClaim_nonCanonical_isNoop(address _caller) external {
    vm.assume(_caller != canonical && _caller != address(0));
    vm.prank(_caller);
    rewardDistributor.claim(address(0xbeef), 0);
    assertEq(rewardDistributor.specificRecipientBalance(_caller), 0);
    assertEq(rewardDistributor.totalEarmarkedBalance(), 0);
  }

  // ---------------------------------------------------------------
  // Multi-rollup isolation
  // ---------------------------------------------------------------

  function test_subsidizingDoesNotReduceCanonicalAvailability(address _old, uint256 _balance, uint256 _subsidy)
    external
  {
    vm.assume(_old != canonical && _old != address(0));
    uint256 balance = bound(_balance, 1, type(uint128).max);
    uint256 subsidy = bound(_subsidy, 1, type(uint128).max);

    token.mint(address(rewardDistributor), balance);
    uint256 canonicalAvailable = rewardDistributor.availableTo(canonical);
    assertEq(canonicalAvailable, balance, "canonical baseline incorrect");

    _subsidize(_old, subsidy);

    // balance (now balance + subsidy) - totalEarmarked (subsidy) == balance.
    assertEq(rewardDistributor.availableTo(canonical), canonicalAvailable, "canonical availability changed");
    assertEq(rewardDistributor.availableTo(_old), subsidy);
  }

  function test_perRollupSubsidiesAreIsolatedAcrossClaim(address _a, address _b, address _c) external {
    vm.assume(
      _a != canonical && _b != canonical && _c != canonical && _a != _b && _b != _c && _a != _c && _a != address(0)
        && _b != address(0) && _c != address(0)
    );
    uint256 sa = 10e18;
    uint256 sb = 20e18;
    uint256 sc = 30e18;
    _subsidize(_a, sa);
    _subsidize(_b, sb);
    _subsidize(_c, sc);

    assertEq(rewardDistributor.availableTo(_a), sa);
    assertEq(rewardDistributor.availableTo(_b), sb);
    assertEq(rewardDistributor.availableTo(_c), sc);
    // Canonical sees nothing — entire balance is earmarked.
    assertEq(rewardDistributor.availableTo(canonical), 0);

    vm.prank(_b);
    rewardDistributor.claim(_b, sb);
    assertEq(rewardDistributor.specificRecipientBalance(_a), sa);
    assertEq(rewardDistributor.specificRecipientBalance(_c), sc);
    assertEq(rewardDistributor.specificRecipientBalance(_b), 0);
    assertEq(rewardDistributor.totalEarmarkedBalance(), sa + sc);
  }

  // ---------------------------------------------------------------
  // Canonical rotation
  // ---------------------------------------------------------------

  function test_availableToCanonicalIncludesItsOwnEarmarked() external {
    address r1 = address(new FakeRollup());
    uint256 subsidy = 100e18;
    uint256 unearmarked = 50e18;

    _subsidize(r1, subsidy);
    token.mint(address(rewardDistributor), unearmarked);

    // Non-canonical r1 sees only its own specificRecipientBalance.
    assertEq(rewardDistributor.availableTo(r1), subsidy);

    // Promote r1 to canonical; it now sees unearmarked + its own earmarked.
    registry.addRollup(IRollup(r1));
    assertEq(rewardDistributor.availableTo(r1), unearmarked + subsidy);
  }

  function test_canonicalDrainsThenSurvivesRotation() external {
    address r1 = address(new FakeRollup());
    uint256 subsidy = 100e18;
    uint256 unearmarked = 50e18;
    uint256 takenWhileCanonical = unearmarked + (subsidy / 2);
    uint256 expectedRemaining = subsidy - (subsidy / 2);

    _subsidize(r1, subsidy);
    token.mint(address(rewardDistributor), unearmarked);

    registry.addRollup(IRollup(r1));
    assertEq(rewardDistributor.availableTo(r1), unearmarked + subsidy);

    // Drain unearmarked + half of r1's earmarked in a single claim.
    address recipient = makeAddr("recipient");
    vm.prank(r1);
    rewardDistributor.claim(recipient, takenWhileCanonical);

    assertEq(token.balanceOf(recipient), takenWhileCanonical);
    assertEq(rewardDistributor.specificRecipientBalance(r1), expectedRemaining);
    assertEq(rewardDistributor.totalEarmarkedBalance(), expectedRemaining);
    assertEq(token.balanceOf(address(rewardDistributor)), expectedRemaining);
    assertEq(rewardDistributor.availableTo(r1), expectedRemaining);

    // Rotate canonical away from r1 — r1's remaining earmarked must survive.
    address r2 = address(new FakeRollup());
    registry.addRollup(IRollup(r2));
    assertEq(address(registry.getCanonicalRollup()), r2);
    assertEq(rewardDistributor.specificRecipientBalance(r1), expectedRemaining);

    // r1 is non-canonical again and recovers its remaining earmarked.
    assertEq(rewardDistributor.availableTo(r1), expectedRemaining);
    vm.prank(r1);
    rewardDistributor.claim(recipient, expectedRemaining);

    assertEq(token.balanceOf(recipient), takenWhileCanonical + expectedRemaining);
    assertEq(rewardDistributor.specificRecipientBalance(r1), 0);
    assertEq(rewardDistributor.totalEarmarkedBalance(), 0);
    assertEq(token.balanceOf(address(rewardDistributor)), 0);
  }

  function test_rotationPreservesEarmarkedAcrossManyRollups() external {
    address r1 = address(new FakeRollup());
    address r2 = address(new FakeRollup());
    address r3 = address(new FakeRollup());

    uint256 s1 = 11e18;
    uint256 s2 = 22e18;
    uint256 s3 = 33e18;
    _subsidize(r1, s1);
    _subsidize(r2, s2);
    _subsidize(r3, s3);

    registry.addRollup(IRollup(r1));
    assertEq(rewardDistributor.availableTo(r1), s1);

    registry.addRollup(IRollup(r2));
    assertEq(rewardDistributor.specificRecipientBalance(r1), s1);

    registry.addRollup(IRollup(r3));
    assertEq(rewardDistributor.specificRecipientBalance(r1), s1);
    assertEq(rewardDistributor.specificRecipientBalance(r2), s2);
    assertEq(rewardDistributor.availableTo(r3), s3);

    vm.prank(r1);
    rewardDistributor.claim(r1, s1);
    vm.prank(r2);
    rewardDistributor.claim(r2, s2);
    vm.prank(r3);
    rewardDistributor.claim(r3, s3);
    assertEq(rewardDistributor.totalEarmarkedBalance(), 0);
    assertEq(token.balanceOf(address(rewardDistributor)), 0);
  }

  function test_newCanonicalDoesNotInheritOldCanonicalEarmarked() external {
    address r1 = address(new FakeRollup());
    address r2 = address(new FakeRollup());

    uint256 r1Subsidy = 50e18;
    _subsidize(r1, r1Subsidy);

    registry.addRollup(IRollup(r1));
    registry.addRollup(IRollup(r2));

    // r2 must NOT see r1's earmarked. balance - totalEarmarked = 50 - 50 = 0.
    assertEq(rewardDistributor.availableTo(r2), 0);
    assertEq(rewardDistributor.availableTo(r1), r1Subsidy, "r1 retains earmarked after losing canonical");
  }

  // ---------------------------------------------------------------
  // Distributed event splits implicit-pool draw from earmarked-pool draw
  // ---------------------------------------------------------------

  function test_canonicalUnearmarkedClaim_emitsDistributedWithZeroEarmarked() external {
    uint256 balance = 50e18;
    uint256 amount = 30e18;
    token.mint(address(rewardDistributor), balance);

    address recipient = makeAddr("eventRecipient");
    vm.expectEmit(true, true, true, true, address(rewardDistributor));
    emit IRewardDistributor.Distributed(canonical, recipient, amount, amount, 0);
    vm.prank(canonical);
    rewardDistributor.claim(recipient, amount);
  }

  function test_canonicalMixedClaim_emitsDistributedSplit() external {
    uint256 unearmarked = 40e18;
    uint256 earmarked = 10e18;
    uint256 total = unearmarked + earmarked;
    token.mint(address(rewardDistributor), unearmarked);
    _subsidize(canonical, earmarked);

    address recipient = makeAddr("mixedRecipient");
    vm.expectEmit(true, true, true, true, address(rewardDistributor));
    emit IRewardDistributor.Distributed(canonical, recipient, total, unearmarked, earmarked);
    vm.prank(canonical);
    rewardDistributor.claim(recipient, total);
  }

  function test_nonCanonicalClaim_emitsDistributedWithOnlyEarmarked(address _old) external {
    vm.assume(_old != canonical && _old != address(0));
    uint256 subsidy = 7e18;
    _subsidize(_old, subsidy);

    address recipient = makeAddr("oldEventRecipient");
    vm.expectEmit(true, true, true, true, address(rewardDistributor));
    emit IRewardDistributor.Distributed(_old, recipient, subsidy, 0, subsidy);
    vm.prank(_old);
    rewardDistributor.claim(recipient, subsidy);
  }

  // ---------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------

  function _subsidize(address _rollup, uint256 _amount) internal {
    address funder = makeAddr("funder");
    token.mint(funder, _amount);
    vm.prank(funder);
    token.approve(address(rewardDistributor), _amount);
    vm.prank(funder);
    rewardDistributor.subsidizeAddress(_rollup, _amount);
  }
}
