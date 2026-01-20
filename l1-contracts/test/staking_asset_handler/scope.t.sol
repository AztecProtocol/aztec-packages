// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {StakingAssetHandlerBase} from "./base.t.sol";
import {StakingAssetHandler, IStakingAssetHandler} from "@aztec/mock/StakingAssetHandler.sol";

// solhint-disable comprehensive-interface
// solhint-disable func-name-mixedcase
// solhint-disable ordering
// solhint-disable private-vars-leading-underscore

contract ScopeTest is StakingAssetHandlerBase {
  string constant INCORRECT_DOMAIN = "aint nuffin but a peanut";
  string constant INCORRECT_SCOPE = "LIGHTWEIGHT BABY";

  function setUp() public override {
    super.setUp();
  }

  function _setCorrectDomain() internal {
    stakingAssetHandler.setDomain(CORRECT_DOMAIN);
  }

  function _setCorrectScope() internal {
    stakingAssetHandler.setScope(CORRECT_SCOPE);
  }

  function _setIncorrectDomain() internal {
    stakingAssetHandler.setDomain(INCORRECT_DOMAIN);
  }

  function _setIncorrectScope() internal {
    stakingAssetHandler.setScope(INCORRECT_SCOPE);
  }

  function test_WhenDomainIsValidAndScopeIsValid() external {
    // it transfers tokens to the caller

    _setCorrectDomain();
    _setCorrectScope();

    address caller = address(1);
    uint256 balanceBefore = stakingAsset.balanceOf(caller);

    vm.prank(caller);
    stakingAssetHandler.claim(realProof);

    uint256 balanceAfter = stakingAsset.balanceOf(caller);
    assertEq(balanceAfter - balanceBefore, faucetAmount, "caller should receive faucet amount");
  }

  function test_WhenDomainIsValidAndScopeIsInvalid() external {
    // it reverts

    _setCorrectDomain();
    _setIncorrectScope();

    address caller = address(1);

    vm.expectRevert(IStakingAssetHandler.InvalidScope.selector);
    vm.prank(caller);
    stakingAssetHandler.claim(realProof);
  }

  function test_WhenDomainIsInvalidButScopeIsValid() external {
    // it reverts

    _setIncorrectDomain();
    _setCorrectScope();

    address caller = address(1);

    vm.expectRevert(IStakingAssetHandler.InvalidDomain.selector);
    vm.prank(caller);
    stakingAssetHandler.claim(realProof);
  }

  function test_WhenDomainIsInvalidAndScopeIsInvalid() external {
    // it reverts

    _setIncorrectDomain();
    _setIncorrectScope();

    address caller = address(1);

    vm.expectRevert(IStakingAssetHandler.InvalidDomain.selector);
    vm.prank(caller);
    stakingAssetHandler.claim(realProof);
  }
}
