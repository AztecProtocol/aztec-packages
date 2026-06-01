// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {RewardDistributorBase, FakeRollup} from "./Base.t.sol";

import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {Ownable} from "@oz/access/Ownable.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {IRollup} from "@aztec/core/interfaces/IRollup.sol";

// `recoverFrom(_from, _to, _amount)` is owner-only and shares the accounting path with `claim`:
//   - canonical: draws from unearmarked first, then specificRecipientBalance[canonical].
//   - non-canonical: draws only from specificRecipientBalance[_from].
//
// `recoverWrongAsset(_asset, _to, _amount)` is owner-only and refuses ASSET so accounting cannot
// be bypassed.
contract RecoverTest is RewardDistributorBase {
  address internal owner;
  address internal canonical;

  function setUp() public override {
    super.setUp();
    owner = Ownable(address(registry)).owner();
    canonical = address(registry.getCanonicalRollup());
  }

  // ---------------------------------------------------------------
  // Authorization
  // ---------------------------------------------------------------

  function test_recover_revertsWhen_callerIsNotOwner(address _caller) external {
    vm.assume(_caller != owner);
    vm.expectRevert(abi.encodeWithSelector(Errors.RewardDistributor__InvalidCaller.selector, _caller, owner));
    vm.prank(_caller);
    rewardDistributor.recoverFrom(canonical, _caller, 1e18);
  }

  function test_recoverWrongAsset_revertsWhen_callerIsNotOwner(address _caller) external {
    vm.assume(_caller != owner);
    TestERC20 other = new TestERC20("Other", "OTH", address(this));
    vm.expectRevert(abi.encodeWithSelector(Errors.RewardDistributor__InvalidCaller.selector, _caller, owner));
    vm.prank(_caller);
    rewardDistributor.recoverWrongAsset(address(other), _caller, 1e18);
  }

  // Authority follows the registry's current owner, not whoever was owner at deploy.
  function test_recoverAuthority_followsRegistryOwner() external {
    address newOwner = makeAddr("newOwner");
    Ownable(address(registry)).transferOwnership(newOwner);

    token.mint(address(rewardDistributor), 1e18);

    vm.expectRevert(abi.encodeWithSelector(Errors.RewardDistributor__InvalidCaller.selector, owner, newOwner));
    vm.prank(owner);
    rewardDistributor.recoverFrom(canonical, owner, 1);

    vm.prank(newOwner);
    rewardDistributor.recoverFrom(canonical, newOwner, 1);
    assertEq(token.balanceOf(newOwner), 1);
  }

  // ---------------------------------------------------------------
  // recover — canonical path mirrors `claim` from canonical
  // ---------------------------------------------------------------

  function test_recover_canonical_drawsFromUnearmarked(uint256 _balance, uint256 _amount) external {
    uint256 balance = bound(_balance, 1, type(uint128).max);
    uint256 amount = bound(_amount, 1, balance);
    token.mint(address(rewardDistributor), balance);

    vm.prank(owner);
    rewardDistributor.recoverFrom(canonical, owner, amount);

    assertEq(token.balanceOf(owner), amount);
    assertEq(token.balanceOf(address(rewardDistributor)), balance - amount);
    assertEq(rewardDistributor.specificRecipientBalance(canonical), 0, "canonical earmarked unchanged");
    assertEq(rewardDistributor.totalEarmarkedBalance(), 0, "totalEarmarked unchanged");
  }

  function test_recover_canonical_dipsIntoOwnEarmarked() external {
    uint256 earmarked = 100e18;
    _subsidize(canonical, earmarked);
    uint256 unearmarked = 30e18;
    token.mint(address(rewardDistributor), unearmarked);

    uint256 dip = 20e18;
    uint256 amount = unearmarked + dip;
    vm.prank(owner);
    rewardDistributor.recoverFrom(canonical, owner, amount);

    assertEq(token.balanceOf(owner), amount);
    assertEq(rewardDistributor.specificRecipientBalance(canonical), earmarked - dip);
    assertEq(rewardDistributor.totalEarmarkedBalance(), earmarked - dip);
    assertEq(token.balanceOf(address(rewardDistributor)), earmarked - dip);
  }

  function test_recover_canonical_revertsAboveAvailable() external {
    uint256 unearmarked = 10e18;
    token.mint(address(rewardDistributor), unearmarked);
    uint256 earmarked = 5e18;
    _subsidize(canonical, earmarked);

    uint256 totalAvailable = unearmarked + earmarked;
    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.RewardDistributor__InsufficientAvailable.selector, totalAvailable + 1, totalAvailable
      )
    );
    vm.prank(owner);
    rewardDistributor.recoverFrom(canonical, owner, totalAvailable + 1);
  }

  // ---------------------------------------------------------------
  // recover — non-canonical path: only that rollup's earmarked
  // ---------------------------------------------------------------

  function test_recover_nonCanonical_drawsFromEarmarked(address _old, uint256 _subsidy, uint256 _amount) external {
    vm.assume(_old != canonical && _old != address(0));
    uint256 subsidy = bound(_subsidy, 1, type(uint128).max);
    uint256 amount = bound(_amount, 1, subsidy);

    _subsidize(_old, subsidy);

    vm.prank(owner);
    rewardDistributor.recoverFrom(_old, owner, amount);

    assertEq(token.balanceOf(owner), amount);
    assertEq(rewardDistributor.specificRecipientBalance(_old), subsidy - amount);
    assertEq(rewardDistributor.totalEarmarkedBalance(), subsidy - amount);
    assertEq(token.balanceOf(address(rewardDistributor)), subsidy - amount);
  }

  // Adding unearmarked balance must NOT make it accessible via recover(_old, ...).
  function test_recover_nonCanonical_revertsAboveEarmarked(address _old) external {
    vm.assume(_old != canonical && _old != address(0));
    uint256 subsidy = 7e18;
    _subsidize(_old, subsidy);

    token.mint(address(rewardDistributor), 1000e18);

    vm.expectRevert(
      abi.encodeWithSelector(Errors.RewardDistributor__InsufficientAvailable.selector, subsidy + 1, subsidy)
    );
    vm.prank(owner);
    rewardDistributor.recoverFrom(_old, owner, subsidy + 1);
  }

  function test_recover_doesNotTouchOtherRollupsEarmarked(address _a, address _b) external {
    vm.assume(_a != canonical && _b != canonical && _a != _b && _a != address(0) && _b != address(0));
    uint256 subsidyA = 30e18;
    uint256 subsidyB = 70e18;

    _subsidize(_a, subsidyA);
    _subsidize(_b, subsidyB);

    vm.prank(owner);
    rewardDistributor.recoverFrom(_a, owner, subsidyA);

    assertEq(rewardDistributor.specificRecipientBalance(_a), 0, "A drained");
    assertEq(rewardDistributor.specificRecipientBalance(_b), subsidyB, "B untouched");
    assertEq(rewardDistributor.totalEarmarkedBalance(), subsidyB);
    assertEq(token.balanceOf(address(rewardDistributor)), subsidyB);
  }

  function test_governanceCanFullyDrainAllRollupsAndUnearmarked(address _a) external {
    vm.assume(_a != canonical && _a != address(0));

    uint256 subsidyA = 13e18;
    uint256 subsidyCanonical = 21e18;
    uint256 unearmarked = 5e18;

    _subsidize(_a, subsidyA);
    _subsidize(canonical, subsidyCanonical);
    token.mint(address(rewardDistributor), unearmarked);

    // Drain canonical pool first (unearmarked + canonical earmarked), then A's earmarked.
    vm.prank(owner);
    rewardDistributor.recoverFrom(canonical, owner, unearmarked + subsidyCanonical);
    vm.prank(owner);
    rewardDistributor.recoverFrom(_a, owner, subsidyA);

    assertEq(token.balanceOf(owner), unearmarked + subsidyCanonical + subsidyA);
    assertEq(rewardDistributor.totalEarmarkedBalance(), 0);
    assertEq(rewardDistributor.specificRecipientBalance(_a), 0);
    assertEq(rewardDistributor.specificRecipientBalance(canonical), 0);
    assertEq(token.balanceOf(address(rewardDistributor)), 0);
  }

  function test_recover_followsCanonicalRotation() external {
    address r1 = address(new FakeRollup());
    uint256 subsidy = 80e18;
    _subsidize(r1, subsidy);
    registry.addRollup(IRollup(r1));
    assertEq(address(registry.getCanonicalRollup()), r1);

    uint256 unearmarked = 10e18;
    token.mint(address(rewardDistributor), unearmarked);

    // recover(canonical=r1) reaches unearmarked + r1's earmarked.
    vm.prank(owner);
    rewardDistributor.recoverFrom(r1, owner, unearmarked + subsidy);
    assertEq(rewardDistributor.specificRecipientBalance(r1), 0);
    assertEq(rewardDistributor.totalEarmarkedBalance(), 0);
    assertEq(token.balanceOf(address(rewardDistributor)), 0);
  }

  // ---------------------------------------------------------------
  // recoverWrongAsset
  // ---------------------------------------------------------------

  function test_recoverWrongAsset_transfersAnyOtherToken(uint256 _balance, uint256 _amount) external {
    uint256 balance = bound(_balance, 1, type(uint128).max);
    uint256 amount = bound(_amount, 1, balance);

    TestERC20 other = new TestERC20("Other", "OTH", address(this));
    other.mint(address(rewardDistributor), balance);

    vm.prank(owner);
    rewardDistributor.recoverWrongAsset(address(other), owner, amount);

    assertEq(other.balanceOf(owner), amount);
    assertEq(other.balanceOf(address(rewardDistributor)), balance - amount);
  }

  function test_recoverWrongAsset_revertsForAsset() external {
    token.mint(address(rewardDistributor), 100e18);
    vm.expectRevert(abi.encodeWithSelector(Errors.RewardDistributor__WrongRecoverMechanism.selector));
    vm.prank(owner);
    rewardDistributor.recoverWrongAsset(address(token), owner, 1e18);
  }

  function test_recoverWrongAsset_doesNotAffectAssetBookkeeping() external {
    uint256 subsidy = 50e18;
    _subsidize(canonical, subsidy);
    uint256 unearmarked = 25e18;
    token.mint(address(rewardDistributor), unearmarked);

    TestERC20 other = new TestERC20("Other", "OTH", address(this));
    uint256 stray = 7e18;
    other.mint(address(rewardDistributor), stray);

    uint256 balanceBefore = token.balanceOf(address(rewardDistributor));
    uint256 specificBefore = rewardDistributor.specificRecipientBalance(canonical);
    uint256 totalBefore = rewardDistributor.totalEarmarkedBalance();

    vm.prank(owner);
    rewardDistributor.recoverWrongAsset(address(other), owner, stray);

    assertEq(other.balanceOf(owner), stray);
    assertEq(token.balanceOf(address(rewardDistributor)), balanceBefore, "ASSET balance unchanged");
    assertEq(rewardDistributor.specificRecipientBalance(canonical), specificBefore);
    assertEq(rewardDistributor.totalEarmarkedBalance(), totalBefore);
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
