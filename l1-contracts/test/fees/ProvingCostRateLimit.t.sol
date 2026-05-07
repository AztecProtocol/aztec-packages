// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

import {RollupBuilder} from "../builder/RollupBuilder.sol";
import {Rollup} from "@aztec/core/Rollup.sol";
import {IRollup, EthValue} from "@aztec/core/interfaces/IRollup.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {
  MIN_PROVING_COST_PER_MANA,
  PROVING_COST_STEP_DEN,
  PROVING_COST_STEP_NUM,
  PROVING_COST_UPDATE_INTERVAL
} from "@aztec/core/libraries/rollup/FeeLib.sol";
import {Test} from "forge-std/Test.sol";

/**
 * @title ProvingCostRateLimitTest
 * @notice Exercises the rate limiter on setProvingCostPerMana:
 *
 *           - hard floor (MIN_PROVING_COST_PER_MANA = 2)
 *           - multiplicative step cap (3/2) against the live value
 *           - cooldown (30 days) between updates, with the first post-init update exempt
 *
 *         Tests go through the real Rollup surface so the whole path is validated.
 */
contract ProvingCostRateLimitTest is Test {
  uint256 internal constant INITIAL = 1000;

  Rollup internal rollup;

  function setUp() public {
    RollupBuilder builder = new RollupBuilder(address(this)).setMakeGovernance(false).setTargetCommitteeSize(0)
      .setProvingCostPerMana(EthValue.wrap(INITIAL));
    builder.deploy();
    rollup = builder.getConfig().rollup;
  }

  // ---------------------------------------------------------------------
  // Floor
  // ---------------------------------------------------------------------

  function test_revertsWhen_belowFloor() public {
    vm.expectRevert(abi.encodeWithSelector(Errors.FeeLib__ProvingCostBelowFloor.selector, 1, MIN_PROVING_COST_PER_MANA));
    rollup.setProvingCostPerMana(EthValue.wrap(1));

    vm.expectRevert(abi.encodeWithSelector(Errors.FeeLib__ProvingCostBelowFloor.selector, 0, MIN_PROVING_COST_PER_MANA));
    rollup.setProvingCostPerMana(EthValue.wrap(0));
  }

  // ---------------------------------------------------------------------
  // Step cap
  // ---------------------------------------------------------------------

  function test_firstUpdate_bypassesCooldown_atStepCap() public {
    // newV <= current * PROVING_COST_STEP_NUM / PROVING_COST_STEP_DEN
    uint256 maxUp = INITIAL * PROVING_COST_STEP_NUM / PROVING_COST_STEP_DEN;
    rollup.setProvingCostPerMana(EthValue.wrap(maxUp));
    assertEq(EthValue.unwrap(rollup.getProvingCostPerManaInEth()), maxUp);
  }

  function test_revertsWhen_aboveStepCap() public {
    uint256 above = (INITIAL * PROVING_COST_STEP_NUM / PROVING_COST_STEP_DEN) + 1;
    vm.expectRevert(abi.encodeWithSelector(Errors.FeeLib__ProvingCostStepExceeded.selector, INITIAL, above));
    rollup.setProvingCostPerMana(EthValue.wrap(above));
  }

  function test_downStep_atBoundary() public {
    // newV >= current * PROVING_COST_STEP_DEN / PROVING_COST_STEP_NUM
    uint256 maxDown = (INITIAL * PROVING_COST_STEP_DEN + PROVING_COST_STEP_NUM - 1) / PROVING_COST_STEP_NUM;
    rollup.setProvingCostPerMana(EthValue.wrap(maxDown));
    assertEq(EthValue.unwrap(rollup.getProvingCostPerManaInEth()), maxDown);
  }

  function test_revertsWhen_belowStepCap() public {
    uint256 below = (INITIAL * PROVING_COST_STEP_DEN + PROVING_COST_STEP_NUM - 1) / PROVING_COST_STEP_NUM - 1;
    vm.expectRevert(abi.encodeWithSelector(Errors.FeeLib__ProvingCostStepExceeded.selector, INITIAL, below));
    rollup.setProvingCostPerMana(EthValue.wrap(below));
  }

  // ---------------------------------------------------------------------
  // Cooldown
  // ---------------------------------------------------------------------

  function test_revertsWhen_withinCooldown() public {
    // First update: consumes the "lastUpdate == 0" bypass.
    rollup.setProvingCostPerMana(EthValue.wrap(1500));

    // Any follow-up before the interval reverts, regardless of value.
    uint256 nextAllowed = block.timestamp + PROVING_COST_UPDATE_INTERVAL;
    vm.expectRevert(abi.encodeWithSelector(Errors.FeeLib__ProvingCostCooldown.selector, nextAllowed));
    rollup.setProvingCostPerMana(EthValue.wrap(1500));
  }

  function test_succeedsAt_cooldownBoundary() public {
    rollup.setProvingCostPerMana(EthValue.wrap(1500));

    vm.warp(block.timestamp + PROVING_COST_UPDATE_INTERVAL);
    // 1500 * 3/2 = 2250, at the boundary.
    rollup.setProvingCostPerMana(EthValue.wrap(2250));
    assertEq(EthValue.unwrap(rollup.getProvingCostPerManaInEth()), 2250);
  }

  function test_revertsWhen_oneSecondShortOfCooldown() public {
    rollup.setProvingCostPerMana(EthValue.wrap(1500));

    uint256 nextAllowed = block.timestamp + PROVING_COST_UPDATE_INTERVAL;
    vm.warp(nextAllowed - 1);
    vm.expectRevert(abi.encodeWithSelector(Errors.FeeLib__ProvingCostCooldown.selector, nextAllowed));
    rollup.setProvingCostPerMana(EthValue.wrap(1500));
  }

  // ---------------------------------------------------------------------
  // Rate-of-growth guarantee
  // ---------------------------------------------------------------------

  /// @notice Ten cooperating 3/2 steps (the theoretical max growth rate) should not exceed
  ///         (3/2)^10 ≈ 57.67x. Guards against accidental amplification bugs.
  function test_tenStepsCapGrowth() public {
    uint256 value = INITIAL;
    // First step is free of cooldown.
    uint256 next = value * PROVING_COST_STEP_NUM / PROVING_COST_STEP_DEN;
    rollup.setProvingCostPerMana(EthValue.wrap(next));
    value = next;

    for (uint256 i = 0; i < 9; i++) {
      vm.warp(block.timestamp + PROVING_COST_UPDATE_INTERVAL);
      next = value * PROVING_COST_STEP_NUM / PROVING_COST_STEP_DEN;
      rollup.setProvingCostPerMana(EthValue.wrap(next));
      value = next;
    }

    // (3/2)^10 * 1000 = 57_665.039..., integer flooring makes this 57_629 (bounded tightly below 58k).
    assertLt(value, 58_000, "value should not exceed (3/2)^10 * INITIAL");
    assertGt(value, 57_000, "value should reach close to (3/2)^10 * INITIAL");
  }
}
