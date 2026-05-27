// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

import {EscapeHatchIntegrationBase} from "./EscapeHatchIntegrationBase.sol";
import {EscapeHatch} from "@aztec/core/EscapeHatch.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {IValidatorSelectionCore} from "@aztec/core/interfaces/IValidatorSelection.sol";
import {Ownable} from "@oz/access/Ownable.sol";

/**
 * @notice Verifies setEscapeHatch is one-shot.
 *
 * - setEscapeHatch(0) reverts with `EscapeHatchCannotBeZero`.
 * - First setEscapeHatch(nonZero) succeeds and emits `EscapeHatchSet`.
 * - Any subsequent setEscapeHatch reverts with `EscapeHatchAlreadySet`, regardless of the
 *   address (including the same one) and regardless of whether the caller is the owner.
 */
contract SetEscapeHatchOneShotTest is EscapeHatchIntegrationBase {
  function _newEscapeHatch() internal returns (EscapeHatch) {
    return new EscapeHatch(
      address(rollup),
      address(testERC20),
      DEFAULT_BOND_SIZE,
      DEFAULT_WITHDRAWAL_TAX,
      DEFAULT_FAILED_HATCH_PUNISHMENT,
      DEFAULT_FREQUENCY,
      DEFAULT_ACTIVE_DURATION,
      DEFAULT_LAG_IN_HATCHES,
      DEFAULT_PROPOSING_EXIT_DELAY
    );
  }

  function test_revertsOnZeroAddress() external setup(2, 2) {
    address owner = Ownable(address(rollup)).owner();
    vm.expectRevert(abi.encodeWithSelector(Errors.ValidatorSelection__EscapeHatchCannotBeZero.selector));
    vm.prank(owner);
    rollup.setEscapeHatch(address(0));
  }

  function test_revertsWhenHatchPointsAtDifferentRollup() external setup(2, 2) {
    // An EscapeHatch bound to a foreign rollup must not be acceptable. Once installed it would
    // become a permanent alternate proposal route the current rollup cannot reach or replace.
    // Mock the IInstance read the EscapeHatch constructor performs so we can build a hatch
    // pointing at a foreign address without deploying a second rollup.
    address fakeRollup = address(0xC0FFEE);
    vm.mockCall(
      fakeRollup, abi.encodeWithSelector(bytes4(keccak256("getProofSubmissionEpochs()"))), abi.encode(uint256(1))
    );

    EscapeHatch foreignHatch = new EscapeHatch(
      fakeRollup,
      address(testERC20),
      DEFAULT_BOND_SIZE,
      DEFAULT_WITHDRAWAL_TAX,
      DEFAULT_FAILED_HATCH_PUNISHMENT,
      DEFAULT_FREQUENCY,
      DEFAULT_ACTIVE_DURATION,
      DEFAULT_LAG_IN_HATCHES,
      DEFAULT_PROPOSING_EXIT_DELAY
    );

    address owner = Ownable(address(rollup)).owner();
    vm.expectRevert(
      abi.encodeWithSelector(Errors.ValidatorSelection__EscapeHatchRollupMismatch.selector, address(rollup), fakeRollup)
    );
    vm.prank(owner);
    rollup.setEscapeHatch(address(foreignHatch));
  }

  function test_succeedsOnFirstNonZeroCallAndEmitsEvent() external setup(2, 2) {
    EscapeHatch first = _newEscapeHatch();
    address owner = Ownable(address(rollup)).owner();

    vm.expectEmit(true, true, true, true, address(rollup));
    emit IValidatorSelectionCore.EscapeHatchSet(address(first));
    vm.prank(owner);
    rollup.setEscapeHatch(address(first));
  }

  function test_revertsOnSecondCallWithDifferentAddress() external setup(2, 2) {
    EscapeHatch first = _newEscapeHatch();
    EscapeHatch second = _newEscapeHatch();
    address owner = Ownable(address(rollup)).owner();

    vm.prank(owner);
    rollup.setEscapeHatch(address(first));

    vm.expectRevert(abi.encodeWithSelector(Errors.ValidatorSelection__EscapeHatchAlreadySet.selector));
    vm.prank(owner);
    rollup.setEscapeHatch(address(second));
  }

  function test_revertsOnSecondCallWithSameAddress() external setup(2, 2) {
    EscapeHatch first = _newEscapeHatch();
    address owner = Ownable(address(rollup)).owner();

    vm.prank(owner);
    rollup.setEscapeHatch(address(first));

    vm.expectRevert(abi.encodeWithSelector(Errors.ValidatorSelection__EscapeHatchAlreadySet.selector));
    vm.prank(owner);
    rollup.setEscapeHatch(address(first));
  }

  function test_revertsOnSecondCallEvenAfterZeroAttempt() external setup(2, 2) {
    EscapeHatch first = _newEscapeHatch();
    address owner = Ownable(address(rollup)).owner();

    // Zero attempt reverts but does NOT mutate state, so a subsequent non-zero call still
    // succeeds (proving zero is rejected before the one-shot check).
    vm.expectRevert(abi.encodeWithSelector(Errors.ValidatorSelection__EscapeHatchCannotBeZero.selector));
    vm.prank(owner);
    rollup.setEscapeHatch(address(0));

    vm.prank(owner);
    rollup.setEscapeHatch(address(first));

    vm.expectRevert(abi.encodeWithSelector(Errors.ValidatorSelection__EscapeHatchAlreadySet.selector));
    vm.prank(owner);
    rollup.setEscapeHatch(address(first));
  }

  function test_revertsForNonOwner(address _caller) external setup(2, 2) {
    address owner = Ownable(address(rollup)).owner();
    vm.assume(_caller != owner);

    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, _caller));
    vm.prank(_caller);
    rollup.setEscapeHatch(address(0xdeadbeef));
  }
}
