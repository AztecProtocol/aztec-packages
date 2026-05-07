// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {StakingBase} from "./base.t.sol";
import {RollupBuilder} from "../builder/RollupBuilder.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {IStaking, IStakingCore, Status, AttesterView, Exit, Timestamp} from "@aztec/core/interfaces/IStaking.sol";
import {BN254Lib, G1Point, G2Point} from "@aztec/shared/libraries/BN254Lib.sol";
import {Ownable} from "@oz/access/Ownable.sol";

contract SlashTest is StakingBase {
  uint256 internal slashingAmount = 1;

  function setUp() public override {
    super.setUp();
  }

  function test_WhenCallerIsNotTheSlasher() external {
    mint(address(this), ACTIVATION_THRESHOLD);
    stakingAsset.approve(address(staking), ACTIVATION_THRESHOLD);
    staking.deposit({
      _attester: ATTESTER,
      _withdrawer: WITHDRAWER,
      _publicKeyInG1: BN254Lib.g1Zero(),
      _publicKeyInG2: BN254Lib.g2Zero(),
      _proofOfPossession: BN254Lib.g1Zero(),
      _moveWithLatestRollup: true
    });
    staking.flushEntryQueue();

    // it reverts
    vm.expectRevert(abi.encodeWithSelector(Errors.Staking__NotSlasher.selector, SLASHER, address(this)));
    staking.slash(ATTESTER, 1);
  }

  modifier whenCallerIsTheSlasher() {
    _;
  }

  function test_WhenAttesterIsNotRegistered() external whenCallerIsTheSlasher {
    // it reverts

    vm.prank(SLASHER);
    // vm.expectRevert(abi.encodeWithSelector(Errors.Staking__NoOneToSlash.selector, ATTESTER));
    assertFalse(staking.slash(ATTESTER, 1));
  }

  modifier whenAttesterIsRegistered() {
    mint(address(this), ACTIVATION_THRESHOLD);
    stakingAsset.approve(address(staking), ACTIVATION_THRESHOLD);

    staking.deposit({
      _attester: ATTESTER,
      _withdrawer: WITHDRAWER,
      _publicKeyInG1: BN254Lib.g1Zero(),
      _publicKeyInG2: BN254Lib.g2Zero(),
      _proofOfPossession: BN254Lib.g1Zero(),
      _moveWithLatestRollup: true
    });
    staking.flushEntryQueue();
    _;
  }

  modifier whenAttesterIsExiting() {
    vm.prank(WITHDRAWER);
    staking.initiateWithdraw(ATTESTER, RECIPIENT);

    _;
  }

  function test_GivenTimeIsAfterUnlock()
    external
    whenCallerIsTheSlasher
    whenAttesterIsRegistered
    whenAttesterIsExiting
  {
    // it reverts

    Exit memory exit = staking.getExit(ATTESTER);
    vm.warp(Timestamp.unwrap(exit.exitableAt));

    /*vm.expectRevert(
      abi.encodeWithSelector(Errors.Staking__CannotSlashExitedStake.selector, ATTESTER)
    );*/
    vm.prank(SLASHER);
    assertFalse(staking.slash(ATTESTER, 1));
  }

  function test_GivenTimeIsBeforeUnlock()
    external
    whenCallerIsTheSlasher
    whenAttesterIsRegistered
    whenAttesterIsExiting
  {
    // it reduce stake by amount
    // it emits {Slashed} event

    AttesterView memory attesterView = staking.getAttesterView(ATTESTER);
    assertEq(attesterView.effectiveBalance, 0);
    assertEq(attesterView.exit.amount, ACTIVATION_THRESHOLD, "Invalid exit amount");
    assertTrue(attesterView.status == Status.EXITING);

    vm.expectEmit(true, true, true, true, address(staking));
    emit IStakingCore.Slashed(ATTESTER, 1);
    vm.prank(SLASHER);
    staking.slash(ATTESTER, 1);

    attesterView = staking.getAttesterView(ATTESTER);
    assertEq(attesterView.effectiveBalance, 0);
    assertEq(attesterView.exit.amount, ACTIVATION_THRESHOLD - 1, "Invalid exit amount 2");
    assertTrue(attesterView.status == Status.EXITING);
  }

  function test_WhenAttesterIsNotExiting() external whenCallerIsTheSlasher whenAttesterIsRegistered {
    // it reduce stake by amount
    // it emits {Slashed} event

    for (uint256 i = 0; i < 3; i++) {
      bool isAlive = i != 2;
      // Prepare the status and state
      AttesterView memory attesterView = staking.getAttesterView(ATTESTER);
      assertTrue(attesterView.status == (isAlive ? Status.VALIDATING : Status.ZOMBIE), "Invalid status");
      assertEq(staking.getActiveAttesterCount(), isAlive ? 1 : 0, "Invalid active attester count");

      uint256 balance = isAlive ? attesterView.effectiveBalance : attesterView.exit.amount;
      slashingAmount = isAlive ? ACTIVATION_THRESHOLD / 3 : balance;

      vm.expectEmit(true, true, true, true, address(staking));
      emit IStakingCore.Slashed(ATTESTER, slashingAmount);
      vm.prank(SLASHER);
      staking.slash(ATTESTER, slashingAmount);

      attesterView = staking.getAttesterView(ATTESTER);

      if (i == 0) {
        // The first round, we are still active, not slashing enough yet!
        assertEq(attesterView.effectiveBalance, balance - slashingAmount, "Invalid effective balance");
        assertEq(attesterView.exit.amount, 0, "Invalid exit amount");
        assertTrue(attesterView.status == Status.VALIDATING, "Invalid status after slash");
        assertEq(staking.getActiveAttesterCount(), 1, "Invalid active attester count");
      } else if (i == 1) {
        // The second round, we are not longer active, but there are money left
        assertEq(attesterView.effectiveBalance, 0, "Invalid effective balance");
        assertEq(attesterView.exit.amount, balance - slashingAmount, "Invalid exit amount");
        assertTrue(attesterView.status == Status.ZOMBIE, "Invalid status after slash");
        assertEq(staking.getActiveAttesterCount(), 0, "Invalid active attester count");
      } else {
        // Fully slashed! NUKE IT.
        assertEq(attesterView.effectiveBalance, 0, "Invalid effective balance");
        assertEq(attesterView.exit.amount, 0, "Invalid exit amount");
        assertTrue(attesterView.status == Status.NONE, "Invalid status after slash");
        assertEq(staking.getActiveAttesterCount(), 0, "Invalid active attester count");
      }
    }
  }

  modifier whenAttesterIsValidatingAndStakeIsBelowEjectionThreshold() {
    AttesterView memory attesterView = staking.getAttesterView(ATTESTER);
    uint256 targetBalance = EJECTION_THRESHOLD - 1;

    slashingAmount = attesterView.effectiveBalance - targetBalance;
    _;
  }

  function test_GivenAttesterIsNotActive()
    external
    whenCallerIsTheSlasher
    whenAttesterIsRegistered
    whenAttesterIsValidatingAndStakeIsBelowEjectionThreshold
  {
    // it reverts

    // This should be impossible to trigger in practice as the only case where attester is removed already
    // is if the status is none.
  }

  function test_GivenAttesterIsActive()
    external
    whenCallerIsTheSlasher
    whenAttesterIsRegistered
    whenAttesterIsValidatingAndStakeIsBelowEjectionThreshold
  {
    // it reduce stake by amount
    // it remove from active attesters
    // it set status to living
    // it emits {Slashed} event

    AttesterView memory attesterView = staking.getAttesterView(ATTESTER);
    assertTrue(attesterView.status == Status.VALIDATING);
    uint256 activeAttesterCount = staking.getActiveAttesterCount();
    uint256 balance = attesterView.effectiveBalance;

    vm.expectEmit(true, true, true, true, address(staking));
    emit IStakingCore.Slashed(ATTESTER, slashingAmount);
    vm.prank(SLASHER);
    staking.slash(ATTESTER, slashingAmount);

    attesterView = staking.getAttesterView(ATTESTER);
    assertEq(attesterView.effectiveBalance, 0);
    assertEq(attesterView.exit.amount, balance - slashingAmount);
    assertTrue(attesterView.status == Status.ZOMBIE);

    assertEq(staking.getActiveAttesterCount(), activeAttesterCount - 1);
  }

  function test_SlashingMoreThanBalance() external whenCallerIsTheSlasher whenAttesterIsRegistered {
    // it should slash only up to the available balance
    // it emits {Slashed} event with the actual slashed amount

    AttesterView memory attesterView = staking.getAttesterView(ATTESTER);
    assertTrue(attesterView.status == Status.VALIDATING);
    uint256 balance = attesterView.effectiveBalance;

    // Try to slash more than the balance
    uint256 amountToSlash = balance * 2;

    vm.expectEmit(true, true, true, true, address(staking));
    emit IStakingCore.Slashed(ATTESTER, balance);
    vm.prank(SLASHER);
    staking.slash(ATTESTER, amountToSlash);

    attesterView = staking.getAttesterView(ATTESTER);
    assertEq(attesterView.effectiveBalance, 0, "Effective balance should be 0");
    assertEq(attesterView.exit.amount, 0, "Exit amount should be 0");
    assertTrue(attesterView.status == Status.NONE, "Status should be NONE");
  }

  function test_SlashingMoreThanExitBalance()
    external
    whenCallerIsTheSlasher
    whenAttesterIsRegistered
    whenAttesterIsExiting
  {
    // it should slash only up to the available exit balance
    // it emits {Slashed} event with the actual slashed amount

    AttesterView memory attesterView = staking.getAttesterView(ATTESTER);
    assertTrue(attesterView.status == Status.EXITING);
    uint256 exitAmount = attesterView.exit.amount;

    // Try to slash more than the exit balance
    uint256 amountToSlash = exitAmount * 2;

    vm.expectEmit(true, true, true, true, address(staking));
    emit IStakingCore.Slashed(ATTESTER, exitAmount);
    vm.prank(SLASHER);
    staking.slash(ATTESTER, amountToSlash);

    attesterView = staking.getAttesterView(ATTESTER);
    assertEq(attesterView.effectiveBalance, 0, "Effective balance should be 0");
    assertEq(attesterView.exit.amount, 0, "Exit amount should be 0");
    assertTrue(attesterView.status == Status.NONE, "Status should be NONE");
  }
}

/**
 * @notice Exercises the local-ejection-threshold path. The threshold is baked in at rollup
 *         construction (there is no live setter), so this contract deploys its own rollup
 *         with a non-zero threshold rather than extending {SlashTest}'s default-zero setup.
 */
contract SlashLocalEjectionTest is StakingBase {
  // Pick a threshold strictly between the global ejection threshold (50e18) and
  // the activation threshold (100e18) so a slash that lands between them ejects
  // locally but would not eject globally.
  uint256 internal constant LOCAL_EJECTION_THRESHOLD = 75e18;

  function setUp() public override {
    RollupBuilder builder = new RollupBuilder(address(this)).setSlashingQuorum(1).setSlashingRoundSize(1)
      .setLocalEjectionThreshold(LOCAL_EJECTION_THRESHOLD);
    builder.deploy();

    registry = builder.getConfig().registry;
    EPOCH_DURATION_SECONDS = builder.getConfig().rollupConfigInput.aztecEpochDuration
      * builder.getConfig().rollupConfigInput.aztecSlotDuration;

    staking = IStaking(address(builder.getConfig().rollup));
    stakingAsset = builder.getConfig().testERC20;

    ACTIVATION_THRESHOLD = staking.getActivationThreshold();
    EJECTION_THRESHOLD = staking.getEjectionThreshold();
    SLASHER = staking.getSlasher();
  }

  function test_localEjectionThresholdIsApplied() external {
    assertEq(staking.getLocalEjectionThreshold(), LOCAL_EJECTION_THRESHOLD);
    assertGt(LOCAL_EJECTION_THRESHOLD, EJECTION_THRESHOLD, "threshold must exceed global ejection");
    assertLe(LOCAL_EJECTION_THRESHOLD, ACTIVATION_THRESHOLD, "threshold must fit in activation");
  }

  function test_WhenAttesterIsValidatingAndStakeIsBelowLocalEjectionThreshold() external {
    mint(address(this), ACTIVATION_THRESHOLD);
    stakingAsset.approve(address(staking), ACTIVATION_THRESHOLD);
    staking.deposit({
      _attester: ATTESTER,
      _withdrawer: WITHDRAWER,
      _publicKeyInG1: BN254Lib.g1Zero(),
      _publicKeyInG2: BN254Lib.g2Zero(),
      _proofOfPossession: BN254Lib.g1Zero(),
      _moveWithLatestRollup: true
    });
    staking.flushEntryQueue();

    AttesterView memory attesterView = staking.getAttesterView(ATTESTER);
    uint256 targetBalance = LOCAL_EJECTION_THRESHOLD - 1;
    assertGe(targetBalance, EJECTION_THRESHOLD, "target above global ejection");

    uint256 slashingAmount = attesterView.effectiveBalance - targetBalance;
    uint256 balance = attesterView.effectiveBalance;
    uint256 activeAttesterCount = staking.getActiveAttesterCount();

    assertTrue(attesterView.status == Status.VALIDATING);

    vm.expectEmit(true, true, true, true, address(staking));
    emit IStakingCore.Slashed(ATTESTER, slashingAmount);
    vm.prank(SLASHER);
    staking.slash(ATTESTER, slashingAmount);

    attesterView = staking.getAttesterView(ATTESTER);
    assertEq(attesterView.effectiveBalance, 0);
    assertEq(attesterView.exit.amount, balance - slashingAmount);
    assertTrue(attesterView.status == Status.ZOMBIE);

    assertEq(staking.getActiveAttesterCount(), activeAttesterCount - 1);
  }
}
