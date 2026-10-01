// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

// solhint-disable func-name-mixedcase
// solhint-disable comprehensive-interface

import {Test} from "forge-std/Test.sol";
import {Rollup} from "@aztec/core/Rollup.sol";
import {IRollupCore} from "@aztec/core/interfaces/IRollup.sol";
import {RollupBuilder} from "@test/builder/RollupBuilder.sol";
import {Ownable} from "@oz/access/Ownable.sol";
import {TableCalculator} from "@test/mock/SequencerRewardCalculatorMocks.sol";

/// @notice The rollup's sequencer reward calculator configuration: constructor value, owner-only setter and getter.
contract SequencerRewardCalculatorConfigTest is Test {
  Rollup internal rollup;

  function setUp() public {
    rollup = new RollupBuilder(address(this)).deploy().getConfig().rollup;
  }

  function test_DefaultsToNoCalculator() external view {
    assertEq(rollup.getSequencerRewardCalculator(), address(0));
  }

  function test_ConstructorSetsTheInitialCalculator() external {
    address calculator = address(new TableCalculator());
    Rollup withCalculator =
    new RollupBuilder(address(this)).setSequencerRewardCalculator(calculator).deploy().getConfig().rollup;
    assertEq(withCalculator.getSequencerRewardCalculator(), calculator);
  }

  function test_RevertWhen_CallerIsNotTheOwner(address _caller, address _calculator) external {
    vm.assume(_caller != rollup.owner());
    vm.prank(_caller);
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, _caller));
    rollup.setSequencerRewardCalculator(_calculator);
    assertEq(rollup.getSequencerRewardCalculator(), address(0));
  }

  function test_OwnerSetsAndClearsTheCalculator() external {
    address owner = rollup.owner();
    address first = address(new TableCalculator());
    address second = makeAddr("second");

    vm.expectEmit(true, true, true, true, address(rollup));
    emit IRollupCore.SequencerRewardCalculatorUpdated(address(0), first);
    vm.prank(owner);
    rollup.setSequencerRewardCalculator(first);
    assertEq(rollup.getSequencerRewardCalculator(), first);

    vm.expectEmit(true, true, true, true, address(rollup));
    emit IRollupCore.SequencerRewardCalculatorUpdated(first, second);
    vm.prank(owner);
    rollup.setSequencerRewardCalculator(second);
    assertEq(rollup.getSequencerRewardCalculator(), second);

    // The zero address is accepted and disables the calculator.
    vm.expectEmit(true, true, true, true, address(rollup));
    emit IRollupCore.SequencerRewardCalculatorUpdated(second, address(0));
    vm.prank(owner);
    rollup.setSequencerRewardCalculator(address(0));
    assertEq(rollup.getSequencerRewardCalculator(), address(0));
  }

  function test_SetterHasNoCooldown() external {
    address owner = rollup.owner();
    for (uint256 i = 1; i <= 3; i++) {
      address calculator = address(uint160(i));
      vm.prank(owner);
      rollup.setSequencerRewardCalculator(calculator);
      assertEq(rollup.getSequencerRewardCalculator(), calculator);
    }
  }
}
