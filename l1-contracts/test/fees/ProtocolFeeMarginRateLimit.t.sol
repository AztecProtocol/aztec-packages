// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

import {RollupBuilder} from "../builder/RollupBuilder.sol";
import {Rollup} from "@aztec/core/Rollup.sol";
import {IRollupCore} from "@aztec/core/interfaces/IRollup.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {
  FeeLib,
  FeeStore,
  ManaMinFeeComponents,
  PROTOCOL_FEE_MARGIN_STEP_DEN,
  PROTOCOL_FEE_MARGIN_STEP_NUM,
  PROTOCOL_FEE_MARGIN_UPDATE_INTERVAL,
  MINIMUM_CONGESTION_MULTIPLIER,
  EthValue
} from "@aztec/core/libraries/rollup/FeeLib.sol";
import {Timestamp, TimeLib} from "@aztec/core/libraries/TimeLib.sol";
import {
  FeeConfig,
  FeeConfigLib,
  CompressedFeeConfig,
  EthPerFeeAssetE12
} from "@aztec/core/libraries/compressed-data/fees/FeeConfig.sol";
import {TestConstants} from "../harnesses/TestConstants.sol";
import {Ownable} from "@oz/access/Ownable.sol";
import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";

/**
 * @notice Harness exposing FeeLib's margin updater on its own storage, so states that the
 *         hardcoded mu=0 deployment cannot produce (a nonzero margin with no cooldown stamp,
 *         i.e. a deployment starting at mu > 0) can still be exercised.
 */
contract FeeLibMarginHarness {
  using FeeConfigLib for FeeConfig;
  using FeeConfigLib for CompressedFeeConfig;

  constructor() {
    TimeLib.initialize(
      block.timestamp,
      TestConstants.AZTEC_SLOT_DURATION,
      TestConstants.AZTEC_EPOCH_DURATION,
      TestConstants.AZTEC_PROOF_SUBMISSION_EPOCHS,
      TestConstants.ETHEREUM_SLOT_DURATION
    );
    FeeLib.initialize(
      TestConstants.AZTEC_MANA_TARGET, EthValue.wrap(100), TestConstants.AZTEC_INITIAL_ETH_PER_FEE_ASSET
    );
  }

  /// @notice Writes the margin directly into config without stamping the cooldown, emulating a
  ///         deployment that starts at a nonzero margin.
  function seedMargin(uint16 _bps) external {
    FeeStore storage feeStore = FeeLib.getStorage();
    FeeConfig memory config = feeStore.config.decompress();
    config.protocolFeeMarginBps = _bps;
    feeStore.config = config.compress();
  }

  function update(uint16 _bps) external returns (bool, uint16) {
    return FeeLib.updateProtocolFeeMargin(_bps);
  }

  function getMargin() external view returns (uint16) {
    return FeeLib.getProtocolFeeMarginBps();
  }

  function getLastUpdate() external view returns (uint64) {
    return FeeLib.getStorage().protocolMarginLastUpdate;
  }

  function congestionMultiplierAt(uint256 _excessMana) external view returns (uint256) {
    return FeeLib.congestionMultiplier(_excessMana);
  }

  /// @notice The components at checkpoint 0 (zero excess mana), in wei.
  function components() external view returns (ManaMinFeeComponents memory) {
    return FeeLib.getManaMinFeeComponentsAt(0, Timestamp.wrap(block.timestamp), false);
  }
}

/**
 * @title ProtocolFeeMarginRateLimitTest
 * @notice Exercises the rate limiter on setProtocolFeeMargin:
 *
 *           - multiplicative step cap (3/2) on the fee multiplier (10_000 + bps)
 *           - cooldown (30 days) between updates, with the first post-init update exempt
 *           - immediate, unrestricted decreases that still stamp the cooldown
 *           - idempotent no-op when setting the current value
 *
 *         Tests go through the real Rollup surface so the whole path is validated; the
 *         first-ever-update-is-a-decrease case uses the FeeLib harness because the deployed
 *         margin is hardcoded to 0.
 */
contract ProtocolFeeMarginRateLimitTest is Test {
  // From 0, the step cap permits (10_000 + new) * 2 <= (10_000 + 0) * 3, i.e. new <= 5000.
  uint16 internal constant MAX_FIRST_STEP = 5000;

  Rollup internal rollup;

  function setUp() public {
    RollupBuilder builder = new RollupBuilder(address(this)).setMakeGovernance(false).setTargetCommitteeSize(0);
    builder.deploy();
    rollup = builder.getConfig().rollup;
  }

  function test_initialMarginIsZero() public view {
    assertEq(rollup.getProtocolFeeMargin(), 0);
  }

  function test_revertsWhen_notOwner(address _caller) public {
    vm.assume(_caller != address(this));
    vm.prank(_caller);
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, _caller));
    rollup.setProtocolFeeMargin(1);

    vm.prank(_caller);
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, _caller));
    rollup.setProtocolFeeRecipient(address(0xbeef));
  }

  // ---------------------------------------------------------------------
  // Step cap
  // ---------------------------------------------------------------------

  function test_firstUpdate_bypassesCooldown_atStepCap() public {
    vm.expectEmit(true, true, true, true, address(rollup));
    emit IRollupCore.ProtocolFeeMarginUpdated(0, MAX_FIRST_STEP);
    rollup.setProtocolFeeMargin(MAX_FIRST_STEP);
    assertEq(rollup.getProtocolFeeMargin(), MAX_FIRST_STEP);
  }

  function test_revertsWhen_aboveStepCap() public {
    vm.expectRevert(
      abi.encodeWithSelector(Errors.FeeLib__ProtocolFeeMarginStepExceeded.selector, 0, MAX_FIRST_STEP + 1)
    );
    rollup.setProtocolFeeMargin(MAX_FIRST_STEP + 1);
  }

  function test_stepCapBoundsTheFeeMultiplier() public {
    rollup.setProtocolFeeMargin(MAX_FIRST_STEP);

    // From 5000, the cap permits (10_000 + new) * 2 <= 15_000 * 3, i.e. new <= 12_500.
    uint16 nextMax =
      uint16((10_000 + uint256(MAX_FIRST_STEP)) * PROTOCOL_FEE_MARGIN_STEP_NUM / PROTOCOL_FEE_MARGIN_STEP_DEN - 10_000);
    assertEq(nextMax, 12_500);

    vm.warp(block.timestamp + PROTOCOL_FEE_MARGIN_UPDATE_INTERVAL);
    vm.expectRevert(
      abi.encodeWithSelector(Errors.FeeLib__ProtocolFeeMarginStepExceeded.selector, MAX_FIRST_STEP, nextMax + 1)
    );
    rollup.setProtocolFeeMargin(nextMax + 1);

    rollup.setProtocolFeeMargin(nextMax);
    assertEq(rollup.getProtocolFeeMargin(), nextMax);
  }

  // ---------------------------------------------------------------------
  // Cooldown
  // ---------------------------------------------------------------------

  function test_revertsWhen_withinCooldown() public {
    rollup.setProtocolFeeMargin(1000);

    uint256 nextAllowed = block.timestamp + PROTOCOL_FEE_MARGIN_UPDATE_INTERVAL;
    vm.expectRevert(abi.encodeWithSelector(Errors.FeeLib__ProtocolFeeMarginCooldown.selector, nextAllowed));
    rollup.setProtocolFeeMargin(1100);
  }

  function test_succeedsAt_cooldownBoundary() public {
    rollup.setProtocolFeeMargin(1000);

    vm.warp(block.timestamp + PROTOCOL_FEE_MARGIN_UPDATE_INTERVAL);
    rollup.setProtocolFeeMargin(1100);
    assertEq(rollup.getProtocolFeeMargin(), 1100);
  }

  function test_revertsWhen_oneSecondShortOfCooldown() public {
    rollup.setProtocolFeeMargin(1000);

    uint256 nextAllowed = block.timestamp + PROTOCOL_FEE_MARGIN_UPDATE_INTERVAL;
    vm.warp(nextAllowed - 1);
    vm.expectRevert(abi.encodeWithSelector(Errors.FeeLib__ProtocolFeeMarginCooldown.selector, nextAllowed));
    rollup.setProtocolFeeMargin(1100);
  }

  // ---------------------------------------------------------------------
  // Decreases
  // ---------------------------------------------------------------------

  function test_decreaseIsImmediate_butStampsCooldown() public {
    rollup.setProtocolFeeMargin(MAX_FIRST_STEP);

    // A decrease is not gated by the cooldown that is still running from the increase.
    vm.expectEmit(true, true, true, true, address(rollup));
    emit IRollupCore.ProtocolFeeMarginUpdated(MAX_FIRST_STEP, 1000);
    rollup.setProtocolFeeMargin(1000);
    assertEq(rollup.getProtocolFeeMargin(), 1000);

    // But it stamps the cooldown: the next increase reverts until 30 days after the DECREASE.
    uint256 nextAllowed = block.timestamp + PROTOCOL_FEE_MARGIN_UPDATE_INTERVAL;
    vm.expectRevert(abi.encodeWithSelector(Errors.FeeLib__ProtocolFeeMarginCooldown.selector, nextAllowed));
    rollup.setProtocolFeeMargin(1100);

    vm.warp(nextAllowed - 1);
    vm.expectRevert(abi.encodeWithSelector(Errors.FeeLib__ProtocolFeeMarginCooldown.selector, nextAllowed));
    rollup.setProtocolFeeMargin(1100);

    vm.warp(nextAllowed);
    rollup.setProtocolFeeMargin(1100);
    assertEq(rollup.getProtocolFeeMargin(), 1100);
  }

  function test_decreaseToZeroIsAlwaysAllowed() public {
    rollup.setProtocolFeeMargin(MAX_FIRST_STEP);
    rollup.setProtocolFeeMargin(0);
    assertEq(rollup.getProtocolFeeMargin(), 0);
  }

  /// @notice A decrease as the first-ever update (only reachable on a deployment starting at
  ///         mu > 0) succeeds unrestricted but consumes the lastUpdate == 0 cooldown bypass.
  function test_decreaseAsFirstUpdate_consumesBypass() public {
    FeeLibMarginHarness harness = new FeeLibMarginHarness();
    harness.seedMargin(1000);
    assertEq(harness.getLastUpdate(), 0, "seeding must not stamp the cooldown");

    (bool changed, uint16 oldBps) = harness.update(500);
    assertTrue(changed);
    assertEq(oldBps, 1000);
    assertEq(harness.getMargin(), 500);
    assertEq(harness.getLastUpdate(), uint64(block.timestamp), "decrease must stamp the cooldown");

    uint256 nextAllowed = block.timestamp + PROTOCOL_FEE_MARGIN_UPDATE_INTERVAL;
    vm.expectRevert(abi.encodeWithSelector(Errors.FeeLib__ProtocolFeeMarginCooldown.selector, nextAllowed));
    harness.update(600);

    vm.warp(nextAllowed);
    harness.update(600);
    assertEq(harness.getMargin(), 600);
  }

  // ---------------------------------------------------------------------
  // Idempotency
  // ---------------------------------------------------------------------

  function test_idempotentAtZero_noEventNoStamp() public {
    vm.recordLogs();
    rollup.setProtocolFeeMargin(0);
    Vm.Log[] memory logs = vm.getRecordedLogs();
    assertEq(logs.length, 0, "no-op must emit no events");

    // The first-update bypass is still available, proving the no-op did not stamp lastUpdate.
    rollup.setProtocolFeeMargin(MAX_FIRST_STEP);
    assertEq(rollup.getProtocolFeeMargin(), MAX_FIRST_STEP);
  }

  function test_idempotentAtNonZero_noRevertNoEventNoStamp() public {
    rollup.setProtocolFeeMargin(1000);
    uint256 nextAllowed = block.timestamp + PROTOCOL_FEE_MARGIN_UPDATE_INTERVAL;

    // Same-value call inside the cooldown window must not revert, emit, or change state.
    vm.warp(block.timestamp + PROTOCOL_FEE_MARGIN_UPDATE_INTERVAL / 2);
    vm.recordLogs();
    rollup.setProtocolFeeMargin(1000);
    Vm.Log[] memory logs = vm.getRecordedLogs();
    assertEq(logs.length, 0, "no-op must emit no events");
    assertEq(rollup.getProtocolFeeMargin(), 1000);

    // The original cooldown boundary is unchanged: an increase succeeds at the boundary set by
    // the FIRST update. Had the no-op stamped lastUpdate, this would still be cooling down.
    vm.warp(nextAllowed);
    rollup.setProtocolFeeMargin(1100);
    assertEq(rollup.getProtocolFeeMargin(), 1100);
  }

  // ---------------------------------------------------------------------
  // Multiplier scaling
  // ---------------------------------------------------------------------

  /// @notice At zero excess mana the congestion multiplier equals the scaled factor exactly:
  ///         (10_000 + bps) * 1e5, which is (1 + mu) * MINIMUM_CONGESTION_MULTIPLIER.
  function test_multiplierAtZeroExcessEqualsScaledFactor(uint16 _bps) public {
    FeeLibMarginHarness harness = new FeeLibMarginHarness();
    assertEq(harness.congestionMultiplierAt(0), MINIMUM_CONGESTION_MULTIPLIER, "mu=0 baseline must be 1e9");

    harness.seedMargin(_bps);
    assertEq(harness.congestionMultiplierAt(0), (10_000 + uint256(_bps)) * 1e5, "baseline must scale with (1+mu)");
  }

  /// @notice At mu = 5000 the fee components carry a nonzero margin tranche while operator costs
  ///         stay untouched. This is the L1-side guard against the silent cancellation where both
  ///         the fakeExponential factor AND the mulDiv divisor get scaled and mu vanishes.
  function test_componentsScaleWithMargin() public {
    FeeLibMarginHarness harness = new FeeLibMarginHarness();

    ManaMinFeeComponents memory base = harness.components();
    assertEq(base.protocolFee, 0, "mu=0 at zero excess must have no protocol fee");

    harness.seedMargin(5000);
    ManaMinFeeComponents memory scaled = harness.components();

    assertEq(scaled.sequencerCost, base.sequencerCost, "sequencer cost must not scale with mu");
    assertEq(scaled.proverCost, base.proverCost, "prover cost must not scale with mu");

    // At zero excess mana the entire protocol fee is the margin: floor(cost * 3 / 2) - cost.
    uint256 cost = base.sequencerCost + base.proverCost;
    assertEq(scaled.protocolFee, cost * 15_000 / 10_000 - cost, "protocol fee must be exactly mu * cost");
    assertGt(scaled.protocolFee, 0, "mu=5000 must produce a nonzero protocol fee");
  }
}
