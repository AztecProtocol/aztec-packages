// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

// solhint-disable func-name-mixedcase
// solhint-disable comprehensive-interface

import {Status} from "@aztec/core/interfaces/IStaking.sol";
import {Rollup} from "@aztec/core/Rollup.sol";
import {RollupConfigInput} from "@aztec/core/interfaces/IRollup.sol";
import {StakingQueueConfig} from "@aztec/core/libraries/compressed-data/StakingQueueConfig.sol";
import {Timestamp} from "@aztec/core/libraries/TimeLib.sol";
import {GSE, IGSE} from "@aztec/governance/GSE.sol";
import {Registry} from "@aztec/governance/Registry.sol";
import {IHaveVersion} from "@aztec/governance/interfaces/IRegistry.sol";
import {G1Point, G2Point} from "@aztec/shared/libraries/BN254Lib.sol";
import {Ownable} from "@oz/access/Ownable.sol";
import {RollupBuilder} from "@test/builder/RollupBuilder.sol";
import {TestConstants} from "@test/harnesses/TestConstants.sol";
import {IStakingRegistry} from "@test/reward-calculators/premium/IPremiumATP.sol";
import {PremiumATP} from "@test/reward-calculators/premium/PremiumATP.sol";
import {PremiumATPFactory} from "@test/reward-calculators/premium/PremiumATPFactory.sol";
import {PremiumATPStaker} from "@test/reward-calculators/premium/PremiumATPStaker.sol";
import {PremiumRewardCalculator} from "@test/reward-calculators/premium/PremiumRewardCalculator.sol";
import {PremiumRollupBase} from "@test/reward-calculators/premium/PremiumRollupBase.sol";

/**
 * @notice Two rollups on two GSEs in one rollup registry, as after a GSE upgrade, each with a premium calculator for
 *         the same position registry. An attester address registers at most once per GSE, not across GSEs, so the
 *         same attester can validate on both, with the genuine staker as its withdrawer on each. A record of the
 *         staker must earn a premium on its own GSE only.
 * @dev The other GSE's activation threshold is twice this one's, so a premium paid there against a reservation made
 *      here would also be paid for more stake than was reserved.
 */
contract PremiumGSEBindingTest is PremiumRollupBase {
  GSE internal otherGse;
  Rollup internal otherRollup;
  uint256 internal otherVersion;
  uint256 internal otherThreshold;
  PremiumATPFactory internal otherFactory;
  PremiumRewardCalculator internal otherCalculator;

  function setUp() public override {
    super.setUp();
    otherThreshold = 2 * threshold;
    otherGse = new GSE(address(this), token, otherThreshold, TestConstants.EJECTION_THRESHOLD);

    RollupConfigInput memory input = TestConstants.getRollupConfigInput();
    // forge-lint: disable-next-line(unsafe-typecast)
    input.version = uint32(version + 1);
    input.stakingQueueConfig = StakingQueueConfig({
      bootstrapValidatorSetSize: 0,
      bootstrapFlushSize: 0,
      normalFlushSizeMin: 48,
      normalFlushSizeQuotient: 1,
      maxQueueFlushSize: 48
    });
    RollupBuilder builder = new RollupBuilder(address(this)).setTestERC20(token).setGSE(otherGse)
      .setRegistry(Registry(address(rollupRegistry))).setRollupConfigInput(input).setMakeCanonical(false)
      .setUpdateOwnerships(false);
    builder.deploy();
    otherRollup = Rollup(address(builder.getConfig().rollup));
    otherVersion = otherRollup.getVersion();
    vm.prank(Ownable(address(rollupRegistry)).owner());
    rollupRegistry.addRollup(IHaveVersion(address(otherRollup)));
    vm.prank(otherGse.owner());
    otherGse.addRollup(address(otherRollup));
    assertEq(address(rollupRegistry.getRollup(version)), address(rollup));
    assertEq(address(rollupRegistry.getRollup(otherVersion)), address(otherRollup));
    assertEq(otherRollup.getActivationThreshold(), otherThreshold);

    // The new GSE's premiums come from a factory bound to it, for the same position registry.
    otherFactory = new PremiumATPFactory(
      foundation, token, atpRegistry, rollupRegistry, otherGse, IStakingRegistry(address(stakingRegistry))
    );
    otherCalculator = new PremiumRewardCalculator(IGSE(address(otherGse)), governance);
    vm.prank(governance);
    otherCalculator.setRegistryReward(address(atpRegistry), PREMIUM, address(otherFactory));
  }

  function test_FactoryAndStakersReportTheirGSE() external {
    (, PremiumATPStaker staker) = _position(1);
    assertEq(factory.getGSE(), address(gse));
    assertEq(factory.getStakerImplementation().getGSE(), address(gse));
    assertEq(staker.getGSE(), address(gse));
    assertEq(otherFactory.getGSE(), address(otherGse));
  }

  // The staker side: a genuine staker deposits only into rollups on its GSE.

  function test_RevertWhen_StakingIntoARollupOnAnotherGSE() external {
    (PremiumATP atp, PremiumATPStaker staker) = _position(4);
    address attester = _newAttester();
    (G1Point memory pk1, G2Point memory pk2, G1Point memory pop) = _keys(attester);
    vm.expectRevert(
      abi.encodeWithSelector(
        PremiumATPStaker.PremiumATPStaker__RollupOnAnotherGSE.selector, address(otherRollup), address(otherGse)
      )
    );
    vm.prank(operator);
    staker.stake(otherVersion, attester, pk1, pk2, pop, false);

    _addProviderKey(attester);
    vm.expectRevert(
      abi.encodeWithSelector(
        PremiumATPStaker.PremiumATPStaker__RollupOnAnotherGSE.selector, address(otherRollup), address(otherGse)
      )
    );
    vm.prank(operator);
    staker.stakeWithProvider(otherVersion, providerId, 500, beneficiary, false);

    assertEq(atp.getReserved(), 0);
    assertFalse(staker.isAttester(attester));
  }

  // The calculator side: a factory bound to another GSE is never a provenance source.

  function test_RevertWhen_ProvenanceSourceIsBoundToAnotherGSE() external {
    vm.expectRevert(
      abi.encodeWithSelector(
        PremiumRewardCalculator.PremiumRewardCalculator__ProvenanceSourceOnAnotherGSE.selector,
        address(factory),
        address(gse)
      )
    );
    vm.prank(governance);
    otherCalculator.setRegistryReward(address(atpRegistry), PREMIUM, address(factory));

    vm.expectRevert(
      abi.encodeWithSelector(
        PremiumRewardCalculator.PremiumRewardCalculator__ProvenanceSourceOnAnotherGSE.selector,
        address(otherFactory),
        address(otherGse)
      )
    );
    vm.prank(governance);
    calculator.setRegistryReward(address(atpRegistry), PREMIUM, address(otherFactory));
  }

  // A liquid deposit naming the staker on its GSE, then the staker's own deposit of the same attester on the other:
  // the staker refuses the other GSE, so the premium-earning stake never exceeds the reservation.

  function test_LiquidDepositOnTheStakersGSEThenStakeOnTheOtherEarnsNoPremium() external {
    (PremiumATP atp, PremiumATPStaker staker) = _position(4);
    address attester = _newAttester();

    _liquidDeposit(operator, attester, address(staker));
    _flush();
    assertTrue(rollup.getStatus(attester) == Status.VALIDATING);

    keyOf[attester] = nextKey++;
    (G1Point memory pk1, G2Point memory pk2, G1Point memory pop) = _keys(attester);
    vm.expectRevert(
      abi.encodeWithSelector(
        PremiumATPStaker.PremiumATPStaker__RollupOnAnotherGSE.selector, address(otherRollup), address(otherGse)
      )
    );
    vm.prank(operator);
    staker.stake(otherVersion, attester, pk1, pk2, pop, false);

    assertFalse(staker.isAttester(attester));
    assertEq(_rewardOf(attester), DEFAULT_REWARD);
    assertEq(_otherRewardOf(attester), DEFAULT_REWARD);
    _assertPremiumStakeWithinTheReservation(atp, attester);
  }

  // A liquid deposit naming the staker on the other GSE, then the staker's own deposit of the same attester on its
  // GSE: both validate with the staker as withdrawer, and only the staker's GSE pays the premium.

  function test_LiquidDepositOnTheOtherGSEThenStakeOnTheStakersEarnsOnePremium() external {
    (PremiumATP atp, PremiumATPStaker staker) = _position(4);
    address attester = _newAttester();

    _liquidDepositOther(operator, attester, address(staker));
    _flushOther();
    assertTrue(otherRollup.getStatus(attester) == Status.VALIDATING);
    assertEq(otherGse.getWithdrawer(attester), address(staker));

    keyOf[attester] = nextKey++;
    _stake(staker, attester);
    _flush();
    assertTrue(rollup.getStatus(attester) == Status.VALIDATING);
    assertEq(gse.getWithdrawer(attester), address(staker));
    assertTrue(staker.isAttester(attester));

    assertEq(_rewardOf(attester), PREMIUM);
    assertEq(_otherRewardOf(attester), DEFAULT_REWARD);
    _assertPremiumStakeWithinTheReservation(atp, attester);

    // The liquid stake on the other GSE can still exit through the staker, and only to the position.
    uint256 balanceBefore = token.balanceOf(address(atp));
    vm.prank(operator);
    staker.initiateWithdraw(otherVersion, attester);
    assertEq(otherRollup.getExit(attester).recipientOrWithdrawer, address(atp));
    vm.warp(block.timestamp + Timestamp.unwrap(otherRollup.getExitDelay()) + 1);
    staker.finalizeWithdraw(otherVersion, attester);
    assertEq(token.balanceOf(address(atp)), balanceBefore + otherThreshold);
    assertEq(_rewardOf(attester), PREMIUM);
  }

  // The staker's deposit on its GSE, whose activation threshold is the lower one, then a liquid deposit of the same
  // attester naming the staker on the other: the other GSE's calculator does not pay a record it did not reserve for.

  function test_StakeOnTheLowerThresholdGSEEarnsNoPremiumOnTheHigherOne() external {
    (PremiumATP atp, PremiumATPStaker staker) = _position(4);
    address attester = _stake(staker);
    _flush();
    assertEq(atp.getReserved(), threshold);

    keyOf[attester] = nextKey++;
    _liquidDepositOther(operator, attester, address(staker));
    _flushOther();
    assertTrue(otherRollup.getStatus(attester) == Status.VALIDATING);
    assertEq(otherGse.getWithdrawer(attester), address(staker));

    assertEq(_rewardOf(attester), PREMIUM);
    assertEq(_otherRewardOf(attester), DEFAULT_REWARD);
    _assertPremiumStakeWithinTheReservation(atp, attester);
  }

  // A position of the other GSE's factory, staked on the other GSE, earns the premium there and only there.

  function test_PositionOfTheOtherGSEsFactoryEarnsThePremiumOnItsGSEOnly() external {
    (PremiumATP atp, PremiumATPStaker staker) = _position(otherFactory, 4 * otherThreshold);
    assertEq(staker.getGSE(), address(otherGse));
    address attester = _newAttester();
    (G1Point memory pk1, G2Point memory pk2, G1Point memory pop) = _keys(attester);
    vm.prank(operator);
    staker.stake(otherVersion, attester, pk1, pk2, pop, false);
    _flushOther();
    assertEq(atp.getReserved(), otherThreshold);

    keyOf[attester] = nextKey++;
    _liquidDeposit(operator, attester, address(staker));
    _flush();
    assertEq(gse.getWithdrawer(attester), address(staker));

    assertEq(_otherRewardOf(attester), PREMIUM);
    assertEq(_rewardOf(attester), DEFAULT_REWARD);
  }

  /// @dev Premium-earning stake of `_attester` across both GSEs, each registration weighted by its GSE's threshold.
  function _assertPremiumStakeWithinTheReservation(PremiumATP _atp, address _attester) internal view {
    uint256 premiumStake =
      (_rewardOf(_attester) == PREMIUM ? threshold : 0) + (_otherRewardOf(_attester) == PREMIUM ? otherThreshold : 0);
    assertLe(premiumStake, _atp.getReserved(), "premium-earning stake exceeds the reservation");
  }

  function _liquidDepositOther(address _depositor, address _attester, address _withdrawer) internal {
    (G1Point memory pk1, G2Point memory pk2, G1Point memory pop) = _keys(_attester);
    _mint(_depositor, otherThreshold);
    vm.startPrank(_depositor);
    token.approve(address(otherRollup), otherThreshold);
    otherRollup.deposit(_attester, _withdrawer, pk1, pk2, pop, false);
    vm.stopPrank();
  }

  function _flushOther() internal {
    vm.warp(block.timestamp + otherRollup.getEpochDuration() * otherRollup.getSlotDuration());
    otherRollup.flushEntryQueue();
    assertEq(otherRollup.getEntryQueueLength(), 0, "entry queue not flushed");
  }

  function _otherRewardOf(address _attester) internal view returns (uint256) {
    address[] memory proposers = new address[](1);
    proposers[0] = _attester;
    return otherCalculator.getSequencerRewards(EPOCH, proposers, DEFAULT_REWARD, CHECKPOINT_REWARD)[0];
  }
}
