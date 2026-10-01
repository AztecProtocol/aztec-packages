// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

// solhint-disable func-name-mixedcase
// solhint-disable comprehensive-interface

import {Status} from "@aztec/core/interfaces/IStaking.sol";
import {Timestamp} from "@aztec/core/libraries/TimeLib.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {G1Point, G2Point} from "@aztec/shared/libraries/BN254Lib.sol";
import {Clones} from "@oz/proxy/Clones.sol";
import {PremiumATP} from "@test/reward-calculators/premium/PremiumATP.sol";
import {PremiumATPStaker} from "@test/reward-calculators/premium/PremiumATPStaker.sol";
import {FakeWithdrawer} from "@test/reward-calculators/premium/mocks/PremiumMocks.sol";
import {PremiumRollupBase} from "@test/reward-calculators/premium/PremiumRollupBase.sol";

/**
 * @notice The premium calculator and provenance-tracking positions over a real rollup and GSE: deposits go through
 *         the entry queue, are flushed with real proof-of-possession checks, and exit to the position.
 */
contract PremiumLifecycleTest is PremiumRollupBase {
  // Happy paths

  function test_StakedAttesterEarnsThePremiumOnceFlushed() external {
    (PremiumATP atp, PremiumATPStaker staker) = _position(4);
    address attester = _stake(staker);

    assertTrue(staker.isAttester(attester));
    assertEq(atp.getReserved(), threshold);
    // Queued, not yet in the GSE: no withdrawer, no premium.
    assertEq(gse.getWithdrawer(attester), address(0));
    assertEq(_rewardOf(attester), DEFAULT_REWARD);

    _flush();
    assertTrue(rollup.getStatus(attester) == Status.VALIDATING);
    assertEq(gse.getWithdrawer(attester), address(staker));
    assertEq(_rewardOf(attester), PREMIUM);
  }

  function test_ProviderAttesterEarnsThePremiumOnceFlushed() external {
    (PremiumATP atp, PremiumATPStaker staker) = _position(4);
    address attester = _newAttester();
    _addProviderKey(attester);

    vm.prank(operator);
    staker.stakeWithProvider(version, 0, 500, beneficiary, false);
    assertTrue(staker.isAttester(attester));
    assertEq(atp.getReserved(), threshold);

    _flush();
    assertTrue(rollup.getStatus(attester) == Status.VALIDATING);
    assertEq(gse.getWithdrawer(attester), address(staker));
    assertEq(_rewardOf(attester), PREMIUM);
  }

  // Attack: a fake withdrawer pointing at a genuine position, with real stake.

  function test_DepositWithAFakeWithdrawerEarnsTheDefault() external {
    (PremiumATP atp, PremiumATPStaker staker) = _position(4);
    address genuine = _stake(staker);
    address forged = _newAttester();
    _liquidDeposit(attacker, forged, address(new FakeWithdrawer(address(atp))));
    _flush();

    assertTrue(rollup.getStatus(forged) == Status.VALIDATING);
    assertEq(_rewardOf(forged), DEFAULT_REWARD);
    assertEq(_rewardOf(genuine), PREMIUM);
  }

  // Attack: a position from an implementation the attacker deployed, staking for real through genuine staker code.

  function test_StakeThroughAnAttackerImplementationEarnsTheDefault() external {
    vm.startPrank(attacker);
    PremiumATP implementation = new PremiumATP(atpRegistry, token, address(factory.getStakerImplementation()));
    PremiumATP clone = PremiumATP(Clones.clone(address(implementation)));
    clone.initialize(attacker, 10 * threshold);
    clone.updateStakerOperator(operator);
    vm.stopPrank();
    _mint(address(clone), 10 * threshold);

    PremiumATPStaker staker = PremiumATPStaker(clone.getStaker());
    address attester = _stake(staker);
    _flush();

    assertTrue(rollup.getStatus(attester) == Status.VALIDATING);
    assertEq(gse.getWithdrawer(attester), address(staker));
    assertTrue(staker.isAttester(attester));
    assertEq(clone.getRegistry(), address(atpRegistry));
    assertEq(_rewardOf(attester), DEFAULT_REWARD);
  }

  // Attack: liquid stake naming the genuine staker as withdrawer for a new attester.

  function test_LiquidDepositNamingTheStakerEarnsTheDefault() external {
    (PremiumATP atp, PremiumATPStaker staker) = _position(4);
    address genuine = _stake(staker);
    address liquid = _newAttester();
    _liquidDeposit(attacker, liquid, address(staker));
    _flush();

    assertTrue(rollup.getStatus(liquid) == Status.VALIDATING);
    assertEq(gse.getWithdrawer(liquid), address(staker));
    assertFalse(staker.isAttester(liquid));
    assertEq(_rewardOf(liquid), DEFAULT_REWARD);
    assertEq(_rewardOf(genuine), PREMIUM);

    // The staker can exit the liquid stake, but only to the position, where it is never claimable: the position
    // pays at most its allocation.
    _exit(staker, liquid);
    vm.warp(unlockStart + LOCK);
    assertEq(token.balanceOf(address(atp)), 4 * threshold);
    assertEq(atp.getClaimable(), 3 * threshold);
  }

  // Attack: the staker's own deposit front-run with its own (public) keys.

  function test_FrontRunNamingTheStakerKeepsThePremiumBackedByTheReservation() external {
    (PremiumATP atp, PremiumATPStaker staker) = _position(4);
    address attester = _newAttester();
    // The attacker copies the keys and proof of possession from the staker's pending transaction.
    _liquidDeposit(attacker, attester, address(staker));
    _stake(staker, attester);

    _flush();

    // The liquid deposit won; the staker's deposit was refunded to the staker, not to the position.
    assertTrue(rollup.getStatus(attester) == Status.VALIDATING);
    assertEq(token.balanceOf(address(staker)), threshold);
    assertEq(token.balanceOf(address(atp)), 3 * threshold);
    // The attester is recorded and earns the premium, backed by a reservation of the allocation.
    assertEq(_rewardOf(attester), PREMIUM);
    assertEq(atp.getReserved(), threshold);

    vm.prank(attacker);
    staker.returnTokensToATP();
    assertEq(token.balanceOf(address(atp)), 4 * threshold);
    assertEq(atp.getReserved(), threshold);

    // Even with the whole allocation back in the position and fully unlocked, the reservation stays locked.
    vm.warp(unlockStart + LOCK);
    assertEq(atp.getClaimable(), 3 * threshold);
    vm.prank(beneficiary);
    atp.claim();
    assertEq(token.balanceOf(beneficiary), 3 * threshold);
    assertEq(_rewardOf(attester), PREMIUM);
  }

  function test_FrontRunNamingAnotherWithdrawerEarnsTheDefaultAndCanBeReleased() external {
    (PremiumATP atp, PremiumATPStaker staker) = _position(4);
    address attester = _newAttester();
    _liquidDeposit(attacker, attester, attacker);
    _stake(staker, attester);
    _flush();

    assertEq(gse.getWithdrawer(attester), attacker);
    assertTrue(staker.isAttester(attester));
    assertEq(_rewardOf(attester), DEFAULT_REWARD);
    assertEq(token.balanceOf(address(staker)), threshold);

    staker.returnTokensToATP();
    vm.prank(operator);
    staker.release(attester);
    assertEq(atp.getReserved(), 0);
    vm.warp(unlockStart + LOCK);
    assertEq(atp.getClaimable(), 4 * threshold);
  }

  // Attack: top up a fully staked position and claim beyond the reservation.

  function test_TopUpOfAFullyStakedPositionIsNotClaimable() external {
    (PremiumATP atp, PremiumATPStaker staker) = _position(2);
    address a = _stake(staker);
    address b = _stake(staker);
    _flush();
    _mint(address(atp), 2 * threshold);

    vm.warp(unlockStart + LOCK);
    assertEq(atp.getClaimable(), 0);
    vm.expectRevert(PremiumATP.PremiumATP__NothingToClaim.selector);
    vm.prank(beneficiary);
    atp.claim();
    vm.expectRevert(abi.encodeWithSelector(PremiumATP.PremiumATP__AllocationExhausted.selector, 0, threshold));
    vm.prank(operator);
    staker.stake(version, _newAttester(), _g1(), _g2(), _g1(), false);
    assertEq(_rewardOf(a), PREMIUM);
    assertEq(_rewardOf(b), PREMIUM);
  }

  // Release and exit

  function test_ReleaseBeforeExit() external {
    (PremiumATP atp, PremiumATPStaker staker) = _position(4);
    address attester = _stake(staker);
    _flush();

    vm.prank(operator);
    staker.release(attester);
    assertEq(_rewardOf(attester), DEFAULT_REWARD);
    assertEq(atp.getReserved(), 0);

    // The freed quota is only worth what the position holds: the stake is still in the rollup.
    vm.warp(unlockStart + LOCK);
    assertEq(atp.getClaimable(), 3 * threshold);
    vm.prank(beneficiary);
    atp.claim();

    // The stake exits to the position and becomes claimable, under the lock and up to the allocation.
    _exit(staker, attester);
    assertEq(token.balanceOf(address(atp)), threshold);
    vm.prank(beneficiary);
    atp.claim();
    assertEq(token.balanceOf(beneficiary), 4 * threshold);
    assertEq(atp.getClaimed(), atp.getAllocation());
  }

  function test_ExitKeepsThePremiumUntilRelease() external {
    (PremiumATP atp, PremiumATPStaker staker) = _position(4);
    address attester = _stake(staker);
    _flush();

    vm.prank(operator);
    staker.initiateWithdraw(version, attester);
    assertTrue(rollup.getStatus(attester) == Status.EXITING);
    // Checkpoints the attester proposed before exiting may still be proven: the premium persists.
    assertEq(_rewardOf(attester), PREMIUM);

    vm.warp(block.timestamp + Timestamp.unwrap(rollup.getExitDelay()) + 1);
    rollup.finalizeWithdraw(attester);
    assertTrue(rollup.getStatus(attester) == Status.NONE);
    assertEq(token.balanceOf(address(atp)), 4 * threshold);
    assertEq(_rewardOf(attester), PREMIUM);

    // Until released, the returned stake stays reserved.
    vm.warp(unlockStart + LOCK);
    assertEq(atp.getClaimable(), 3 * threshold);

    vm.prank(operator);
    staker.release(attester);
    assertEq(_rewardOf(attester), DEFAULT_REWARD);
    assertEq(atp.getClaimable(), 4 * threshold);
  }

  function test_ClaimFollowsTheLockAcrossAnExit() external {
    (PremiumATP atp, PremiumATPStaker staker) = _position(4);
    address attester = _stake(staker);
    _flush();

    vm.warp(unlockStart + LOCK / 4);
    assertEq(atp.getClaimable(), threshold);
    vm.prank(beneficiary);
    atp.claim();

    _exit(staker, attester);
    vm.prank(operator);
    staker.release(attester);
    // The returned stake is back in the position, but the lock still bounds the claim.
    assertEq(token.balanceOf(address(atp)), 3 * threshold);
    assertEq(atp.getClaimable(), (4 * threshold * (block.timestamp - unlockStart)) / LOCK - threshold);
    vm.warp(unlockStart + LOCK);
    assertEq(atp.getClaimable(), 3 * threshold);
  }

  // Re-registration of an attester address is impossible with the real GSE.

  function test_ExitedAttesterCannotBeRegisteredAgain() external {
    (PremiumATP atp, PremiumATPStaker staker) = _position(4);
    address attester = _stake(staker);
    _flush();
    _exit(staker, attester);
    vm.prank(operator);
    staker.release(attester);

    // A liquid deposit of the same attester, with its old key or a fresh one, naming the staker, fails at flush.
    _liquidDeposit(attacker, attester, address(staker));
    keyOf[attester] = nextKey++;
    _liquidDeposit(attacker, attester, address(staker));
    // So does the staker's own attempt to record it again.
    _stake(staker, attester);
    _flush();

    assertTrue(rollup.getStatus(attester) == Status.NONE);
    // The three refunds went to the withdrawer they named, the staker, and can only go on to the position.
    assertEq(token.balanceOf(address(staker)), 3 * threshold);
    staker.returnTokensToATP();
    assertEq(token.balanceOf(address(atp)), 6 * threshold);
    // The new record holds a reservation like any other, and the attester can never propose again.
    assertEq(atp.getReserved(), threshold);
    vm.warp(unlockStart + LOCK);
    assertEq(atp.getClaimable(), 3 * threshold);
  }

  function test_RevertWhen_DepositingAnExitingAttester() external {
    (, PremiumATPStaker staker) = _position(4);
    address attester = _stake(staker);
    _flush();
    vm.prank(operator);
    staker.initiateWithdraw(version, attester);

    (G1Point memory pk1, G2Point memory pk2, G1Point memory pop) = _keys(attester);
    _mint(attacker, threshold);
    vm.startPrank(attacker);
    token.approve(address(rollup), threshold);
    vm.expectRevert(abi.encodeWithSelector(Errors.Staking__AlreadyExiting.selector, attester));
    rollup.deposit(attester, address(staker), pk1, pk2, pop, false);
    vm.stopPrank();
  }

  function _g1() internal pure returns (G1Point memory) {
    return G1Point(0, 0);
  }

  function _g2() internal pure returns (G2Point memory) {
    return G2Point(0, 0, 0, 0);
  }
}
