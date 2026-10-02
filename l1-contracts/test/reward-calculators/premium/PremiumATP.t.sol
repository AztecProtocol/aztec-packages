// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

// solhint-disable func-name-mixedcase
// solhint-disable comprehensive-interface

import {Ownable} from "@oz/access/Ownable.sol";
import {Clones} from "@oz/proxy/Clones.sol";
import {IGSE} from "@aztec/governance/GSE.sol";
import {IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";
import {BN254Lib} from "@aztec/shared/libraries/BN254Lib.sol";
import {DepositArgs} from "@aztec/core/libraries/StakingQueue.sol";
import {IStakingRegistry} from "@test/reward-calculators/premium/IPremiumATP.sol";
import {PremiumATP} from "@test/reward-calculators/premium/PremiumATP.sol";
import {PremiumATPFactory} from "@test/reward-calculators/premium/PremiumATPFactory.sol";
import {PremiumATPRegistry, UnlockSchedule} from "@test/reward-calculators/premium/PremiumATPRegistry.sol";
import {PremiumATPStaker} from "@test/reward-calculators/premium/PremiumATPStaker.sol";
import {MockSplitFactory, MockStakingRegistry} from "@test/reward-calculators/premium/mocks/MockStakingRegistry.sol";
import {PremiumUnitBase} from "@test/reward-calculators/premium/PremiumUnitBase.sol";

/**
 * @notice Unit tests of the provenance-tracking position: factory provenance, one-shot initialization, the
 *         reservation invariant on both stake and claim, the lock, release, refund recovery and the provider path.
 */
contract PremiumATPTest is PremiumUnitBase {
  PremiumATP internal atp;
  PremiumATPStaker internal staker;

  function setUp() public override {
    super.setUp();
    (atp, staker) = _position();
  }

  // Factory

  function test_FactoryRecordsAndFundsThePositionsItCreates() external {
    assertTrue(factory.isATP(address(atp)));
    assertFalse(factory.isATP(address(factory.getATPImplementation())));
    assertFalse(factory.isATP(address(staker)));
    assertEq(token.balanceOf(address(atp)), ALLOCATION);
    assertEq(atp.getAllocation(), ALLOCATION);
    assertEq(atp.getBeneficiary(), beneficiary);
    assertEq(atp.getRegistry(), address(registry));
    assertEq(atp.getFactory(), address(factory));
    assertEq(address(atp.getToken()), address(token));
    assertEq(staker.getATP(), address(atp));
    assertEq(staker.getOperator(), operator);
    assertEq(factory.getRegistry(), address(registry));
    assertEq(address(factory.getToken()), address(token));
  }

  function test_CreateATPEmits() external {
    token.mint(address(factory), ALLOCATION);
    address predicted = vm.computeCreateAddress(address(factory), vm.getNonce(address(factory)));
    vm.expectEmit(true, true, true, true, address(factory));
    emit PremiumATPFactory.ATPCreated(beneficiary, predicted, ALLOCATION);
    vm.prank(foundation);
    factory.createATP(beneficiary, ALLOCATION);
    assertTrue(factory.isATP(predicted));
  }

  function test_RevertWhen_NonMinterCreatesAPosition(address _caller) external {
    vm.assume(_caller != foundation);
    vm.expectRevert(abi.encodeWithSelector(PremiumATPFactory.PremiumATPFactory__NotMinter.selector, _caller));
    vm.prank(_caller);
    factory.createATP(_caller, ALLOCATION);
  }

  function test_OwnerGrantsAndRevokesMinting() external {
    address minter = makeAddr("minter");
    vm.expectEmit(true, true, true, true, address(factory));
    emit PremiumATPFactory.MinterSet(minter, true);
    vm.prank(foundation);
    factory.setMinter(minter, true);
    token.mint(address(factory), ALLOCATION);
    vm.prank(minter);
    PremiumATP created = factory.createATP(beneficiary, ALLOCATION);
    assertTrue(factory.isATP(address(created)));

    vm.prank(foundation);
    factory.setMinter(minter, false);
    vm.expectRevert(abi.encodeWithSelector(PremiumATPFactory.PremiumATPFactory__NotMinter.selector, minter));
    vm.prank(minter);
    factory.createATP(beneficiary, ALLOCATION);
  }

  function test_RevertWhen_NonOwnerSetsAMinter(address _caller) external {
    vm.assume(_caller != foundation);
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, _caller));
    vm.prank(_caller);
    factory.setMinter(_caller, true);
  }

  // One-shot initialization

  function test_RevertWhen_PositionIsInitializedAgain() external {
    vm.expectRevert(PremiumATP.PremiumATP__AlreadyInitialized.selector);
    vm.prank(address(factory));
    atp.initialize(attacker, ALLOCATION);
  }

  function test_RevertWhen_PositionImplementationIsInitialized() external {
    PremiumATP implementation = factory.getATPImplementation();
    vm.expectRevert(PremiumATP.PremiumATP__AlreadyInitialized.selector);
    vm.prank(address(factory));
    implementation.initialize(attacker, ALLOCATION);
    assertEq(implementation.getStaker(), address(0xdead));
  }

  function test_RevertWhen_NonFactoryInitializesAPosition(address _caller) external {
    vm.assume(_caller != address(factory));
    vm.expectRevert(abi.encodeWithSelector(PremiumATP.PremiumATP__NotFactory.selector, _caller));
    vm.prank(_caller);
    atp.initialize(_caller, ALLOCATION);
  }

  function test_RevertWhen_InitializingWithZeroBeneficiaryOrAllocation() external {
    PremiumATP clone = PremiumATP(Clones.clone(address(factory.getATPImplementation())));
    vm.startPrank(address(factory));
    vm.expectRevert(PremiumATP.PremiumATP__ZeroBeneficiary.selector);
    clone.initialize(address(0), ALLOCATION);
    vm.expectRevert(PremiumATP.PremiumATP__ZeroAllocation.selector);
    clone.initialize(beneficiary, 0);
    vm.stopPrank();
  }

  function test_RevertWhen_StakerIsInitializedAgain(address _caller) external {
    vm.expectRevert(PremiumATPStaker.PremiumATPStaker__AlreadyInitialized.selector);
    vm.prank(_caller);
    staker.initialize();
    assertEq(staker.getATP(), address(atp));
  }

  function test_RevertWhen_StakerImplementationIsInitialized(address _caller) external {
    PremiumATPStaker implementation = factory.getStakerImplementation();
    vm.expectRevert(PremiumATPStaker.PremiumATPStaker__AlreadyInitialized.selector);
    vm.prank(_caller);
    implementation.initialize();
    assertEq(implementation.getATP(), address(0xdead));
  }

  // Access control

  function test_RevertWhen_NonBeneficiaryClaimsOrSetsTheOperator(address _caller) external {
    vm.assume(_caller != beneficiary);
    vm.startPrank(_caller);
    vm.expectRevert(abi.encodeWithSelector(PremiumATP.PremiumATP__NotBeneficiary.selector, _caller));
    atp.claim();
    vm.expectRevert(abi.encodeWithSelector(PremiumATP.PremiumATP__NotBeneficiary.selector, _caller));
    atp.updateStakerOperator(_caller);
    vm.stopPrank();
  }

  function test_RevertWhen_NonStakerReservesOrReleases(address _caller) external {
    vm.assume(_caller != address(staker));
    vm.startPrank(_caller);
    vm.expectRevert(abi.encodeWithSelector(PremiumATP.PremiumATP__NotStaker.selector, _caller));
    atp.reserveForStake(THRESHOLD);
    vm.expectRevert(abi.encodeWithSelector(PremiumATP.PremiumATP__NotStaker.selector, _caller));
    atp.releaseReservation(0);
    vm.stopPrank();
  }

  function test_RevertWhen_NonOperatorUsesTheStaker(address _caller) external {
    vm.assume(_caller != operator);
    address attester = _stake(staker);
    vm.startPrank(_caller);
    vm.expectRevert(abi.encodeWithSelector(PremiumATPStaker.PremiumATPStaker__NotOperator.selector, _caller, operator));
    staker.stake(1, _newAttester(), BN254Lib.g1Zero(), BN254Lib.g2Zero(), BN254Lib.g1Zero(), false);
    vm.expectRevert(abi.encodeWithSelector(PremiumATPStaker.PremiumATPStaker__NotOperator.selector, _caller, operator));
    staker.stakeWithProvider(1, 0, 0, _caller, false);
    vm.expectRevert(abi.encodeWithSelector(PremiumATPStaker.PremiumATPStaker__NotOperator.selector, _caller, operator));
    staker.initiateWithdraw(1, attester);
    vm.expectRevert(abi.encodeWithSelector(PremiumATPStaker.PremiumATPStaker__NotOperator.selector, _caller, operator));
    staker.release(attester);
    vm.stopPrank();
  }

  function test_StakingIsDisabledWithoutAnOperator() external {
    vm.prank(beneficiary);
    atp.updateStakerOperator(address(0));
    vm.expectRevert(
      abi.encodeWithSelector(PremiumATPStaker.PremiumATPStaker__NotOperator.selector, beneficiary, address(0))
    );
    vm.prank(beneficiary);
    staker.stake(1, _newAttester(), BN254Lib.g1Zero(), BN254Lib.g2Zero(), BN254Lib.g1Zero(), false);
  }

  // Staking from the allocation

  function test_StakeReservesBeforeDepositing() external {
    address attester = _stake(staker);
    assertEq(atp.getReserved(), THRESHOLD);
    assertEq(staker.getStake(attester), THRESHOLD);
    assertTrue(staker.isAttester(attester));
    assertEq(token.balanceOf(address(atp)), ALLOCATION - THRESHOLD);
    assertEq(token.balanceOf(address(rollup)), THRESHOLD);
    assertEq(token.balanceOf(address(staker)), 0);
    assertEq(token.allowance(address(staker), address(rollup)), 0);

    DepositArgs memory entry = rollup.getEntryQueueAt(0);
    assertEq(entry.attester, attester);
    assertEq(entry.withdrawer, address(staker));
  }

  function test_StakesUpToTheAllocationAndNoFurther() external {
    for (uint256 i = 0; i < ALLOCATION / THRESHOLD; i++) {
      _stake(staker);
    }
    assertEq(atp.getReserved(), ALLOCATION);
    vm.expectRevert(abi.encodeWithSelector(PremiumATP.PremiumATP__AllocationExhausted.selector, 0, THRESHOLD));
    vm.prank(operator);
    staker.stake(1, _newAttester(), BN254Lib.g1Zero(), BN254Lib.g2Zero(), BN254Lib.g1Zero(), false);
  }

  function test_TopUpDoesNotRaiseTheStakingQuota() external {
    for (uint256 i = 0; i < ALLOCATION / THRESHOLD; i++) {
      _stake(staker);
    }
    token.mint(address(atp), 10 * THRESHOLD);
    vm.expectRevert(abi.encodeWithSelector(PremiumATP.PremiumATP__AllocationExhausted.selector, 0, THRESHOLD));
    vm.prank(operator);
    staker.stake(1, _newAttester(), BN254Lib.g1Zero(), BN254Lib.g2Zero(), BN254Lib.g1Zero(), false);
  }

  function test_ClaimedTokensCannotBeStaked() external {
    vm.warp(UNLOCK_START + LOCK);
    vm.prank(beneficiary);
    atp.claim();
    token.mint(address(atp), ALLOCATION);
    vm.expectRevert(abi.encodeWithSelector(PremiumATP.PremiumATP__AllocationExhausted.selector, 0, THRESHOLD));
    vm.prank(operator);
    staker.stake(1, _newAttester(), BN254Lib.g1Zero(), BN254Lib.g2Zero(), BN254Lib.g1Zero(), false);
  }

  function test_RevertWhen_StakingARecordedAttesterAgain() external {
    address attester = _stake(staker);
    vm.expectRevert(abi.encodeWithSelector(PremiumATPStaker.PremiumATPStaker__AlreadyRecorded.selector, attester));
    vm.prank(operator);
    staker.stake(1, attester, BN254Lib.g1Zero(), BN254Lib.g2Zero(), BN254Lib.g1Zero(), false);
    assertEq(atp.getReserved(), THRESHOLD);
  }

  // Claim: bounded by the lock, the reservation and the balance

  function test_NothingIsClaimableBeforeTheCliff() external {
    vm.warp(UNLOCK_START + CLIFF - 1);
    assertEq(atp.getClaimable(), 0);
    vm.expectRevert(PremiumATP.PremiumATP__NothingToClaim.selector);
    vm.prank(beneficiary);
    atp.claim();
  }

  function test_ClaimFollowsTheLock(uint256 _elapsed) external {
    _elapsed = bound(_elapsed, CLIFF, LOCK * 2);
    vm.warp(UNLOCK_START + _elapsed);
    uint256 unlocked = _elapsed >= LOCK ? ALLOCATION : (ALLOCATION * _elapsed) / LOCK;
    vm.prank(beneficiary);
    assertEq(atp.claim(), unlocked);
    assertEq(token.balanceOf(beneficiary), unlocked);
    assertEq(atp.getClaimed(), unlocked);
    assertEq(atp.getClaimable(), 0);
  }

  function test_ClaimNeverReachesTheReservation(uint256 _staked, uint256 _topUp) external {
    _staked = bound(_staked, 0, ALLOCATION / THRESHOLD);
    _topUp = bound(_topUp, 0, 100 * ALLOCATION);
    for (uint256 i = 0; i < _staked; i++) {
      _stake(staker);
    }
    token.mint(address(atp), _topUp);
    vm.warp(UNLOCK_START + LOCK);

    uint256 expected = ALLOCATION - _staked * THRESHOLD;
    assertEq(atp.getClaimable(), expected);
    if (expected > 0) {
      vm.prank(beneficiary);
      atp.claim();
    }
    assertEq(token.balanceOf(beneficiary), expected);
    assertEq(atp.getClaimable(), 0);
    assertLe(atp.getClaimed() + atp.getReserved(), atp.getAllocation());
  }

  function test_FullyStakedPositionWithATopUpHasNothingToClaim() external {
    // A fully staked allocation plus liquid tokens sent to the position: claiming the liquid tokens as "unlocked"
    // would release allocation early while every attester keeps its premium.
    for (uint256 i = 0; i < ALLOCATION / THRESHOLD; i++) {
      _stake(staker);
    }
    token.mint(address(atp), ALLOCATION);
    vm.warp(UNLOCK_START + LOCK);
    assertEq(atp.getClaimable(), 0);
    vm.expectRevert(PremiumATP.PremiumATP__NothingToClaim.selector);
    vm.prank(beneficiary);
    atp.claim();
  }

  function test_ClaimIsBoundedByTheBalance() external {
    address released = _stake(staker);
    _stake(staker);
    vm.prank(operator);
    staker.release(released);
    vm.warp(UNLOCK_START + LOCK);
    // One threshold is still at stake in the rollup but no longer reserved: only what the position holds is paid.
    assertEq(atp.getClaimable(), ALLOCATION - 2 * THRESHOLD);
  }

  function test_RegistryOwnerCanOnlyMoveTheUnlockEarlier() external {
    vm.expectRevert(
      abi.encodeWithSelector(
        PremiumATPRegistry.PremiumATPRegistry__StartTimeNotEarlier.selector, UNLOCK_START, UNLOCK_START
      )
    );
    vm.prank(foundation);
    registry.setUnlockStartTime(UNLOCK_START);

    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, attacker));
    vm.prank(attacker);
    registry.setUnlockStartTime(0);

    _stake(staker);
    vm.expectEmit(true, true, true, true, address(registry));
    emit PremiumATPRegistry.UnlockStartTimeUpdated(0);
    vm.prank(foundation);
    registry.setUnlockStartTime(0);
    vm.warp(LOCK);
    // Unlocking everything still leaves the reservation in place.
    assertEq(atp.getClaimable(), ALLOCATION - THRESHOLD);
  }

  function test_RevertWhen_ScheduleIsInvalid() external {
    vm.expectRevert(abi.encodeWithSelector(PremiumATPRegistry.PremiumATPRegistry__InvalidSchedule.selector, 0, 0));
    new PremiumATPRegistry(foundation, UnlockSchedule({startTime: 0, cliffDuration: 0, lockDuration: 0}));
    vm.expectRevert(abi.encodeWithSelector(PremiumATPRegistry.PremiumATPRegistry__InvalidSchedule.selector, 2, 1));
    new PremiumATPRegistry(foundation, UnlockSchedule({startTime: 0, cliffDuration: 2, lockDuration: 1}));
  }

  // Release

  function test_ReleaseFreesTheReservation() external {
    address attester = _stake(staker);
    vm.expectEmit(true, true, true, true, address(staker));
    emit PremiumATPStaker.AttesterReleased(attester, THRESHOLD);
    vm.prank(operator);
    staker.release(attester);
    assertFalse(staker.isAttester(attester));
    assertEq(staker.getStake(attester), 0);
    assertEq(atp.getReserved(), 0);

    vm.expectRevert(abi.encodeWithSelector(PremiumATPStaker.PremiumATPStaker__NotRecorded.selector, attester));
    vm.prank(operator);
    staker.release(attester);
  }

  function test_RevertWhen_ReleasingAnUnrecordedAttester() external {
    address liquid = _newAttester();
    vm.expectRevert(abi.encodeWithSelector(PremiumATPStaker.PremiumATPStaker__NotRecorded.selector, liquid));
    vm.prank(operator);
    staker.release(liquid);
  }

  // Refunds

  function test_ReturnTokensToATPIsPermissionlessAndKeepsTheReservation(address _caller) external {
    _stake(staker);
    // A deposit that fails at flush refunds its withdrawer, the staker.
    token.mint(address(staker), THRESHOLD);
    vm.expectEmit(true, true, true, true, address(staker));
    emit PremiumATPStaker.TokensReturnedToATP(THRESHOLD);
    vm.prank(_caller);
    staker.returnTokensToATP();
    assertEq(token.balanceOf(address(staker)), 0);
    assertEq(token.balanceOf(address(atp)), ALLOCATION);
    assertEq(atp.getReserved(), THRESHOLD);
  }

  // Provider path

  function test_StakeWithProviderRecordsTheProvidersAttester() external {
    (MockStakingRegistry stakingRegistry, PremiumATPStaker providerStaker, address[] memory keys) = _providerSetup();
    vm.prank(operator);
    providerStaker.stakeWithProvider(1, 0, 500, beneficiary, false);

    assertTrue(providerStaker.isAttester(keys[0]));
    assertFalse(providerStaker.isAttester(keys[1]));
    assertEq(providerStaker.getStake(keys[0]), THRESHOLD);
    assertEq(token.allowance(address(providerStaker), address(stakingRegistry)), 0);
    DepositArgs memory entry = rollup.getEntryQueueAt(rollup.getEntryQueueLength() - 1);
    assertEq(entry.attester, keys[0]);
    assertEq(entry.withdrawer, address(providerStaker));

    vm.prank(operator);
    providerStaker.stakeWithProvider(1, 0, 500, beneficiary, false);
    assertTrue(providerStaker.isAttester(keys[1]));
  }

  function test_RevertWhen_ProviderDepositsWithAnotherWithdrawer() external {
    (MockStakingRegistry stakingRegistry, PremiumATPStaker providerStaker,) = _providerSetup();
    stakingRegistry.setBehaviour(MockStakingRegistry.Behaviour.SwapWithdrawer);
    vm.expectRevert(
      abi.encodeWithSelector(PremiumATPStaker.PremiumATPStaker__UnexpectedWithdrawer.selector, address(stakingRegistry))
    );
    vm.prank(operator);
    providerStaker.stakeWithProvider(1, 0, 500, beneficiary, false);
  }

  function test_RevertWhen_ProviderDepositsTwice() external {
    (MockStakingRegistry stakingRegistry, PremiumATPStaker providerStaker,) = _providerSetup();
    stakingRegistry.setBehaviour(MockStakingRegistry.Behaviour.DepositTwice);
    token.mint(address(stakingRegistry), THRESHOLD);
    uint256 length = rollup.getEntryQueueLength();
    vm.expectRevert(
      abi.encodeWithSelector(
        PremiumATPStaker.PremiumATPStaker__UnexpectedEntryQueueLength.selector, length + 1, length + 2
      )
    );
    vm.prank(operator);
    providerStaker.stakeWithProvider(1, 0, 500, beneficiary, false);
  }

  function test_RevertWhen_ProviderDoesNotDeposit() external {
    (MockStakingRegistry stakingRegistry, PremiumATPStaker providerStaker,) = _providerSetup();
    stakingRegistry.setBehaviour(MockStakingRegistry.Behaviour.NoDeposit);
    uint256 length = rollup.getEntryQueueLength();
    vm.expectRevert(
      abi.encodeWithSelector(PremiumATPStaker.PremiumATPStaker__UnexpectedEntryQueueLength.selector, length + 1, length)
    );
    vm.prank(operator);
    providerStaker.stakeWithProvider(1, 0, 500, beneficiary, false);
  }

  function test_RevertWhen_ProviderTakeRateChanged() external {
    (, PremiumATPStaker providerStaker,) = _providerSetup();
    vm.expectRevert(abi.encodeWithSelector(MockStakingRegistry.StakingRegistry__UnexpectedTakeRate.selector, 400, 500));
    vm.prank(operator);
    providerStaker.stakeWithProvider(1, 0, 400, beneficiary, false);
  }

  function test_HostileStakingRegistryCannotBreakTheReservation() external {
    // A staking registry that keeps the staker's tokens and deposits another key from its own funds passes the
    // entry queue checks. The staking registry is a trust root for the staked tokens, but not for the invariant:
    // the attester it chose is recorded against a reservation of the allocation, like any other.
    (MockStakingRegistry stakingRegistry, PremiumATPStaker providerStaker, address[] memory keys) = _providerSetup();
    stakingRegistry.setBehaviour(MockStakingRegistry.Behaviour.SubstituteAttester);
    token.mint(address(stakingRegistry), THRESHOLD);
    vm.prank(operator);
    providerStaker.stakeWithProvider(1, 0, 500, beneficiary, false);
    assertTrue(providerStaker.isAttester(keys[1]));
    PremiumATP providerAtp = PremiumATP(providerStaker.getATP());
    assertEq(providerAtp.getReserved(), THRESHOLD);
    assertLe(providerAtp.getClaimed() + providerAtp.getReserved(), providerAtp.getAllocation());
  }

  function _providerSetup()
    internal
    returns (MockStakingRegistry stakingRegistry, PremiumATPStaker providerStaker, address[] memory keys)
  {
    stakingRegistry = new MockStakingRegistry(token, new MockSplitFactory(), IRegistry(address(rollupRegistry)));
    address providerAdmin = makeAddr("provider admin");
    stakingRegistry.registerProvider(providerAdmin, 500, makeAddr("provider rewards"));
    keys = new address[](3);
    MockStakingRegistry.KeyStore[] memory keyStores = new MockStakingRegistry.KeyStore[](3);
    for (uint256 i = 0; i < 3; i++) {
      keys[i] = _newAttester();
      keyStores[i] = MockStakingRegistry.KeyStore({
        attester: keys[i],
        publicKeyG1: BN254Lib.g1Zero(),
        publicKeyG2: BN254Lib.g2Zero(),
        proofOfPossession: BN254Lib.g1Zero()
      });
    }
    vm.prank(providerAdmin);
    stakingRegistry.addKeysToProvider(0, keyStores);

    PremiumATPRegistry providerRegistry = new PremiumATPRegistry(
      foundation, UnlockSchedule({startTime: UNLOCK_START, cliffDuration: CLIFF, lockDuration: LOCK})
    );
    PremiumATPFactory providerFactory = new PremiumATPFactory(
      foundation,
      token,
      providerRegistry,
      IRegistry(address(rollupRegistry)),
      IGSE(address(gse)),
      IStakingRegistry(address(stakingRegistry))
    );
    (, providerStaker) = _position(providerFactory, ALLOCATION);
  }
}
