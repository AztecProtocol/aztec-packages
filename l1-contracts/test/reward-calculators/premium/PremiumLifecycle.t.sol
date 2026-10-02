// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

// solhint-disable func-name-mixedcase
// solhint-disable comprehensive-interface

import {Exit, Status} from "@aztec/core/interfaces/IStaking.sol";
import {Timestamp} from "@aztec/core/libraries/TimeLib.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {G1Point, G2Point} from "@aztec/shared/libraries/BN254Lib.sol";
import {Clones} from "@oz/proxy/Clones.sol";
import {PremiumATP} from "@test/reward-calculators/premium/PremiumATP.sol";
import {PremiumATPStaker} from "@test/reward-calculators/premium/PremiumATPStaker.sol";
import {FakeWithdrawer} from "@test/reward-calculators/premium/mocks/PremiumMocks.sol";
import {PremiumRollupBase} from "@test/reward-calculators/premium/PremiumRollupBase.sol";
import {RollupBuilder} from "@test/builder/RollupBuilder.sol";
import {Rollup} from "@aztec/core/Rollup.sol";
import {RollupConfigInput} from "@aztec/core/interfaces/IRollup.sol";
import {Registry} from "@aztec/governance/Registry.sol";
import {IHaveVersion} from "@aztec/governance/interfaces/IRegistry.sol";
import {TestConstants} from "@test/harnesses/TestConstants.sol";
import {Ownable} from "@oz/access/Ownable.sol";

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

  // Attack: the staker's keys and proof of possession registered first under another attester.

  function test_KeysRegisteredFirstUnderAnotherAttesterOnlyDelayTheGenuineValidator() external {
    (PremiumATP atp, PremiumATPStaker staker) = _position(4);
    address genuine = _newAttester();
    address copy = _newAttester();
    // The proof of possession binds neither the attester nor the withdrawer, so the attacker can copy them from the
    // staker's pending transaction and register them first under an attester and withdrawer of its own.
    keyOf[copy] = keyOf[genuine];
    _liquidDeposit(attacker, copy, attacker);
    _stake(staker, genuine);
    _flush();

    assertTrue(rollup.getStatus(copy) == Status.VALIDATING);
    assertEq(_rewardOf(copy), DEFAULT_REWARD);
    // The genuine deposit failed at flush and was refunded to the staker; its record earns nothing.
    assertTrue(rollup.getStatus(genuine) == Status.NONE);
    assertEq(gse.getWithdrawer(genuine), address(0));
    assertTrue(staker.isAttester(genuine));
    assertEq(_rewardOf(genuine), DEFAULT_REWARD);
    assertEq(token.balanceOf(address(staker)), threshold);
    assertEq(atp.getReserved(), threshold);

    staker.returnTokensToATP();
    vm.prank(operator);
    staker.release(genuine);
    assertEq(token.balanceOf(address(atp)), 4 * threshold);
    assertEq(atp.getReserved(), 0);

    // With fresh keys the genuine validator registers and earns the premium.
    keyOf[genuine] = nextKey++;
    _stake(staker, genuine);
    _flush();
    assertTrue(rollup.getStatus(genuine) == Status.VALIDATING);
    assertEq(gse.getWithdrawer(genuine), address(staker));
    assertEq(_rewardOf(genuine), PREMIUM);
    assertEq(atp.getReserved(), threshold);
    assertEq(_rewardOf(copy), DEFAULT_REWARD);
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

  // Slashing: premiums follow state at proof time.

  function test_FullySlashedAttesterKeepsThePremiumUntilReleased() external {
    (PremiumATP atp, PremiumATPStaker staker) = _position(2);
    address slashed = _stake(staker);
    address other = _stake(staker);
    _flush();
    uint256 activeBefore = rollup.getActiveAttesterCount();

    vm.prank(rollup.getSlasher());
    rollup.slash(slashed, threshold);

    // It left the validator set with nothing at stake, so it cannot be sampled for new committees.
    assertTrue(rollup.getStatus(slashed) == Status.NONE);
    assertEq(gse.effectiveBalanceOf(address(rollup), slashed), 0);
    assertFalse(rollup.getExit(slashed).exists);
    assertEq(rollup.getActiveAttesterCount(), activeBefore - 1);
    for (uint256 i = 0; i < rollup.getActiveAttesterCount(); i++) {
      assertTrue(rollup.getAttesterAtIndex(i) != slashed, "slashed attester still in the validator set");
    }

    // Its GSE record and its staker record remain, so checkpoints it proposed before the slash and proven after it
    // still earn the premium.
    assertEq(gse.getWithdrawer(slashed), address(staker));
    assertTrue(staker.isAttester(slashed));
    assertEq(_rewardOf(slashed), PREMIUM);
    assertEq(_rewardOf(other), PREMIUM);

    // The reservation still covers it, and the slashed tokens are lost to the position.
    assertEq(atp.getReserved(), 2 * threshold);
    assertLe(atp.getClaimed() + atp.getReserved(), atp.getAllocation());
    vm.warp(unlockStart + LOCK);
    assertEq(atp.getClaimable(), 0);

    vm.prank(operator);
    staker.release(slashed);
    assertEq(_rewardOf(slashed), DEFAULT_REWARD);
    assertEq(_rewardOf(other), PREMIUM);
    assertEq(atp.getReserved(), threshold);
    assertLe(atp.getClaimed() + atp.getReserved(), atp.getAllocation());
    // Releasing frees allocation, but the position holds nothing to claim: the slashed stake is gone.
    assertEq(token.balanceOf(address(atp)), 0);
    assertEq(atp.getClaimable(), 0);

    // Exiting the other attester returns only its own stake.
    _exit(staker, other);
    vm.prank(operator);
    staker.release(other);
    assertEq(atp.getClaimable(), threshold);
    vm.prank(beneficiary);
    atp.claim();
    assertEq(token.balanceOf(beneficiary), threshold);
    assertLe(atp.getClaimed() + atp.getReserved(), atp.getAllocation());
  }

  function test_PartialSlashThatEjectsReturnsTheRemainderToThePosition() external {
    (PremiumATP atp, PremiumATPStaker staker) = _position(1);
    address attester = _stake(staker);
    _flush();

    // Leaves less than the ejection threshold: the attester is removed with an exit for the rest, owed to its
    // withdrawer, so it is a zombie until the staker names the recipient.
    uint256 ejection = rollup.getEjectionThreshold();
    if (rollup.getLocalEjectionThreshold() > ejection) {
      ejection = rollup.getLocalEjectionThreshold();
    }
    uint256 slashAmount = threshold - ejection + 1;
    assertLt(slashAmount, threshold);
    vm.prank(rollup.getSlasher());
    rollup.slash(attester, slashAmount);
    assertTrue(rollup.getStatus(attester) == Status.ZOMBIE);
    Exit memory exit = rollup.getExit(attester);
    assertEq(exit.amount, threshold - slashAmount);
    assertEq(exit.recipientOrWithdrawer, address(staker));
    assertFalse(exit.isRecipient);
    assertEq(_rewardOf(attester), PREMIUM);

    vm.prank(operator);
    staker.initiateWithdraw(version, attester);
    assertEq(rollup.getExit(attester).recipientOrWithdrawer, address(atp));
    vm.warp(block.timestamp + Timestamp.unwrap(rollup.getExitDelay()) + 1);
    rollup.finalizeWithdraw(attester);
    assertEq(token.balanceOf(address(atp)), threshold - slashAmount);
    assertEq(token.balanceOf(address(staker)), 0);

    // The reservation is unchanged by the slash and the exit, and covers the whole original stake until release.
    assertEq(atp.getReserved(), threshold);
    vm.warp(unlockStart + LOCK);
    assertEq(atp.getClaimable(), 0);
    assertEq(_rewardOf(attester), PREMIUM);
    vm.prank(operator);
    staker.release(attester);
    assertEq(_rewardOf(attester), DEFAULT_REWARD);
    assertEq(atp.getClaimable(), threshold - slashAmount);
    assertLe(atp.getClaimed() + atp.getReserved(), atp.getAllocation());
  }

  function test_SlashDuringAnExitReducesWhatReturnsToThePosition() external {
    (PremiumATP atp, PremiumATPStaker staker) = _position(1);
    address attester = _stake(staker);
    _flush();

    vm.prank(operator);
    staker.initiateWithdraw(version, attester);
    assertTrue(rollup.getStatus(attester) == Status.EXITING);

    uint256 slashAmount = threshold / 4;
    vm.prank(rollup.getSlasher());
    rollup.slash(attester, slashAmount);
    assertEq(rollup.getExit(attester).amount, threshold - slashAmount);
    assertEq(rollup.getExit(attester).recipientOrWithdrawer, address(atp));
    assertEq(_rewardOf(attester), PREMIUM);

    vm.warp(block.timestamp + Timestamp.unwrap(rollup.getExitDelay()) + 1);
    rollup.finalizeWithdraw(attester);
    assertEq(token.balanceOf(address(atp)), threshold - slashAmount);

    assertEq(atp.getReserved(), threshold);
    vm.warp(unlockStart + LOCK);
    assertEq(atp.getClaimable(), 0);
    vm.prank(operator);
    staker.release(attester);
    assertEq(_rewardOf(attester), DEFAULT_REWARD);
    assertEq(atp.getClaimable(), threshold - slashAmount);
    assertLe(atp.getClaimed() + atp.getReserved(), atp.getAllocation());
  }

  function test_AttesterThatMovesWithTheLatestRollupKeepsThePremiumAndExitsFromIt() external {
    (PremiumATP atp, PremiumATPStaker staker) = _position(2);
    address attester = _newAttester();
    (G1Point memory pk1, G2Point memory pk2, G1Point memory pop) = _keys(attester);
    vm.prank(operator);
    staker.stake(version, attester, pk1, pk2, pop, true);
    _flush();
    assertEq(gse.effectiveBalanceOf(address(rollup), attester), threshold);
    assertEq(_rewardOf(attester), PREMIUM);

    // A new rollup becomes the latest: the bonus instance, and the attester with it, now belong to it.
    Rollup next = _deployNextRollup();
    uint256 nextVersion = next.getVersion();
    assertEq(gse.getLatestRollup(), address(next));
    assertEq(gse.effectiveBalanceOf(address(rollup), attester), 0);
    assertEq(gse.effectiveBalanceOf(address(next), attester), threshold);

    // The calculator reads the GSE, not its caller, so the premium follows the attester to the new rollup.
    assertEq(gse.getWithdrawer(attester), address(staker));
    assertEq(_rewardOf(attester), PREMIUM);
    assertEq(atp.getReserved(), threshold);

    // The exit goes through the new rollup and still pays the position.
    vm.prank(operator);
    staker.initiateWithdraw(nextVersion, attester);
    assertTrue(next.getStatus(attester) == Status.EXITING);
    assertEq(next.getExit(attester).recipientOrWithdrawer, address(atp));
    vm.warp(block.timestamp + Timestamp.unwrap(next.getExitDelay()) + 1);
    staker.finalizeWithdraw(nextVersion, attester);
    assertEq(token.balanceOf(address(atp)), 2 * threshold);

    assertEq(_rewardOf(attester), PREMIUM);
    vm.warp(unlockStart + LOCK);
    assertEq(atp.getClaimable(), threshold);
    vm.prank(operator);
    staker.release(attester);
    assertEq(_rewardOf(attester), DEFAULT_REWARD);
    assertEq(atp.getClaimable(), 2 * threshold);
  }

  /// @dev Deploys a rollup on the same GSE and registry with the next version and makes it the latest in both.
  function _deployNextRollup() internal returns (Rollup next) {
    RollupConfigInput memory input = TestConstants.getRollupConfigInput();
    // forge-lint: disable-next-line(unsafe-typecast)
    input.version = uint32(version + 1);
    RollupBuilder builder = new RollupBuilder(address(this)).setTestERC20(token).setGSE(gse)
      .setRegistry(Registry(address(rollupRegistry))).setRollupConfigInput(input).setMakeCanonical(false)
      .setMakeGovernance(false).setUpdateOwnerships(false);
    builder.deploy();
    next = Rollup(address(builder.getConfig().rollup));
    vm.prank(Ownable(address(rollupRegistry)).owner());
    rollupRegistry.addRollup(IHaveVersion(address(next)));
    vm.prank(gse.owner());
    gse.addRollup(address(next));
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

/**
 * @notice An exit the attester initiates on a rollup with enough validators for an attester exit allowance: the
 *         stake waits for the staker, its withdrawer, to name a recipient, which is always the position.
 */
contract PremiumAttesterExitLifecycleTest is PremiumRollupBase {
  // With no committee to keep, the allowance is (validators - 1) / 20, so 21 validators allow one exit.
  uint256 internal constant VALIDATORS = 21;

  function _configureRollupBuilder(RollupBuilder _builder) internal override {
    _builder.setTargetCommitteeSize(0);
  }

  function test_AttesterInitiatedExitPaysThePositionOnceTheStakerNamesIt() external {
    (PremiumATP atp, PremiumATPStaker staker) = _position(1);
    address attester = _stake(staker);
    address fillerWithdrawer = makeAddr("filler withdrawer");
    for (uint256 i = 1; i < VALIDATORS; i++) {
      _liquidDeposit(makeAddr("filler depositor"), _newAttester(), fillerWithdrawer);
    }
    _flush();
    vm.warp(block.timestamp + 1);
    assertEq(rollup.getActiveAttesterCount(), VALIDATORS);

    vm.prank(attester);
    rollup.initiateWithdrawByAttester(attester);

    // The exit names the withdrawer, not a recipient: the attester is a zombie until the staker names one.
    assertTrue(rollup.getStatus(attester) == Status.ZOMBIE);
    Exit memory exit = rollup.getExit(attester);
    assertEq(exit.recipientOrWithdrawer, address(staker));
    assertFalse(exit.isRecipient);
    assertEq(_rewardOf(attester), PREMIUM);

    _warpToFinalizable(attester);
    vm.expectRevert(abi.encodeWithSelector(Errors.Staking__InitiateWithdrawNeeded.selector, attester));
    rollup.finalizeWithdraw(attester);

    // Only the withdrawer can name the recipient.
    vm.expectRevert(abi.encodeWithSelector(Errors.Staking__NotWithdrawer.selector, address(staker), attacker));
    vm.prank(attacker);
    rollup.initiateWithdraw(attester, attacker);

    vm.prank(operator);
    staker.initiateWithdraw(version, attester);
    assertTrue(rollup.getStatus(attester) == Status.EXITING);
    assertEq(rollup.getExit(attester).recipientOrWithdrawer, address(atp));

    rollup.finalizeWithdraw(attester);
    assertTrue(rollup.getStatus(attester) == Status.NONE);
    assertEq(token.balanceOf(address(atp)), threshold);
    assertEq(token.balanceOf(address(staker)), 0);
    assertEq(token.balanceOf(beneficiary), 0);

    // The returned stake stays reserved, and the premium stays, until the operator releases the attester.
    vm.warp(unlockStart + LOCK);
    assertEq(atp.getClaimable(), 0);
    assertEq(_rewardOf(attester), PREMIUM);
    vm.prank(operator);
    staker.release(attester);
    assertEq(_rewardOf(attester), DEFAULT_REWARD);
    assertEq(atp.getClaimable(), threshold);
  }

  function _warpToFinalizable(address _attester) internal {
    Exit memory exit = rollup.getExit(_attester);
    uint256 localUnlock = Timestamp.unwrap(exit.exitableAt);
    uint256 governanceUnlock = Timestamp.unwrap(gse.getGovernance().getWithdrawal(exit.withdrawalId).unlocksAt);
    vm.warp((localUnlock > governanceUnlock ? localUnlock : governanceUnlock) + 1);
  }
}
