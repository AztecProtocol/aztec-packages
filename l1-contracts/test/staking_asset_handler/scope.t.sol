// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {StakingAssetHandlerBase} from "./base.t.sol";
import {StakingAssetHandler, IStakingAssetHandler} from "@aztec/mock/StakingAssetHandler.sol";

// solhint-disable comprehensive-interface
// solhint-disable func-name-mixedcase
// solhint-disable ordering
// solhint-disable private-vars-leading-underscore

contract ScopeTest is StakingAssetHandlerBase {
  string constant INCORRECT_SCOPE = "aint nuffin but a peanut";
  string constant INCORRECT_SUBSCOPE = "LIGHTWEIGHT BABY";

  function setUp() public override {
    super.setUp();
  }

  function _setCorrectScope() internal {
    stakingAssetHandler.setScope(CORRECT_SCOPE);
  }

  function _setCorrectSubScope() internal {
    stakingAssetHandler.setSubscope(CORRECT_SUBSCOPE);
  }

  function _setIncorrectScope() internal {
    stakingAssetHandler.setScope(INCORRECT_SCOPE);
  }

  function _setIncorrectSubScope() internal {
    stakingAssetHandler.setSubscope(INCORRECT_SUBSCOPE);
  }

  function test_WhenScopeIsValidAndSubscopeIsValid() external {
    // it emits {AddedToQueue} event

    _setCorrectScope();
    _setCorrectSubScope();

    address attester = address(1);

    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.AddedToQueue(attester, 1);
    vm.prank(attester);
    stakingAssetHandler.addValidatorToQueue(attester, realProof);
  }

  function test_WhenScopeIsValidAndSubscopeIsInvalid() external {
    // it reverts

    _setCorrectScope();
    _setIncorrectSubScope();

    address attester = address(1);

    vm.expectRevert(IStakingAssetHandler.InvalidScope.selector);
    vm.prank(attester);
    stakingAssetHandler.addValidatorToQueue(attester, realProof);
  }

  function test_WhenScopeIsInvalidButSubscopeIsValid() external {
    // it reverts

    _setIncorrectScope();
    _setCorrectSubScope();

    address attester = address(1);

    vm.expectRevert(IStakingAssetHandler.InvalidScope.selector);
    vm.prank(attester);
    stakingAssetHandler.addValidatorToQueue(attester, realProof);
  }

  function test_WhenScopeIsInvalidAndSubscopeIsInvalid() external {
    // it reverts

    _setIncorrectScope();
    _setIncorrectSubScope();

    address attester = address(1);

    vm.expectRevert(IStakingAssetHandler.InvalidScope.selector);
    vm.prank(attester);
    stakingAssetHandler.addValidatorToQueue(attester, realProof);
  }
}
