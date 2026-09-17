// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

import {RollupBuilder} from "../builder/RollupBuilder.sol";
import {Rollup} from "@aztec/core/Rollup.sol";
import {IRollupCore} from "@aztec/core/interfaces/IRollup.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Ownable} from "@oz/access/Ownable.sol";
import {Test} from "forge-std/Test.sol";

/**
 * @title ProtocolFeeRecipientTest
 * @notice Exercises the protocol fee recipient setter semantics: burn-address default,
 *         owner gating, zero-address rejection, and event emission. The end-to-end
 *         "epoch proof pays the new recipient" flow lives in FeeRollup.t.sol, which owns
 *         the proven-epoch machinery.
 */
contract ProtocolFeeRecipientTest is Test {
  address internal constant BURN_ADDRESS = address(bytes20("CUAUHXICALLI"));

  Rollup internal rollup;

  function setUp() public {
    RollupBuilder builder = new RollupBuilder(address(this)).setMakeGovernance(false).setTargetCommitteeSize(0);
    builder.deploy();
    rollup = builder.getConfig().rollup;
  }

  function test_defaultIsBurnAddress() public view {
    assertEq(rollup.getProtocolFeeRecipient(), BURN_ADDRESS);
  }

  function test_revertsWhen_notOwner(address _caller) public {
    vm.assume(_caller != address(this));
    vm.prank(_caller);
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, _caller));
    rollup.setProtocolFeeRecipient(address(0xbeef));
  }

  function test_revertsWhen_zeroAddress() public {
    vm.expectRevert(abi.encodeWithSelector(Errors.RewardLib__InvalidProtocolFeeRecipient.selector));
    rollup.setProtocolFeeRecipient(address(0));
  }

  function test_setEmitsEventAndUpdates(address _recipient) public {
    vm.assume(_recipient != address(0));

    vm.expectEmit(true, true, true, true, address(rollup));
    emit IRollupCore.ProtocolFeeRecipientUpdated(BURN_ADDRESS, _recipient);
    rollup.setProtocolFeeRecipient(_recipient);
    assertEq(rollup.getProtocolFeeRecipient(), _recipient);

    // Setting again (even to the same value) always sets and emits; idempotency is a
    // margin-setter property only.
    vm.expectEmit(true, true, true, true, address(rollup));
    emit IRollupCore.ProtocolFeeRecipientUpdated(_recipient, _recipient);
    rollup.setProtocolFeeRecipient(_recipient);
    assertEq(rollup.getProtocolFeeRecipient(), _recipient);
  }
}
