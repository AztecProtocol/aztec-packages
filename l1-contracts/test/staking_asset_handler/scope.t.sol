// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {StakingAssetHandlerBase} from "./base.t.sol";
import {StakingAssetHandler, IStakingAssetHandler} from "@aztec/mock/StakingAssetHandler.sol";
import {BN254Lib, G1Point, G2Point} from "@aztec/shared/libraries/BN254Lib.sol";

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

  function test_WhenScopeIsValidAndScopeIsValid() external {
    // it emits {ValidatorAdded} event

    _setCorrectDomain();
    _setCorrectScope();

    address attester = address(1);

    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.ValidatorAdded(address(staking), attester, WITHDRAWER);
    vm.prank(attester);
    stakingAssetHandler.addValidator(
      attester, validMerkleProof, realProof, BN254Lib.g1Zero(), BN254Lib.g2Zero(), BN254Lib.g1Zero()
    );
  }

  function test_WhenDomainIsValidAndScopeIsInvalid() external {
    // it reverts

    _setCorrectDomain();
    _setIncorrectScope();

    address attester = address(1);

    vm.expectRevert(IStakingAssetHandler.InvalidScope.selector);
    vm.prank(attester);
    stakingAssetHandler.addValidator(
      attester, validMerkleProof, realProof, BN254Lib.g1Zero(), BN254Lib.g2Zero(), BN254Lib.g1Zero()
    );
  }

  function test_WhenDomainIsInvalidButScopeIsValid() external {
    // it reverts

    _setIncorrectDomain();
    _setCorrectScope();

    address attester = address(1);

    vm.expectRevert(IStakingAssetHandler.InvalidDomain.selector);
    vm.prank(attester);
    stakingAssetHandler.addValidator(
      attester, validMerkleProof, realProof, BN254Lib.g1Zero(), BN254Lib.g2Zero(), BN254Lib.g1Zero()
    );
  }

  function test_WhenDomainIsInvalidAndSScopeIsInvalid() external {
    // it reverts

    _setIncorrectDomain();
    _setIncorrectScope();

    address attester = address(1);

    vm.expectRevert(IStakingAssetHandler.InvalidDomain.selector);
    vm.prank(attester);
    stakingAssetHandler.addValidator(
      attester, validMerkleProof, realProof, BN254Lib.g1Zero(), BN254Lib.g2Zero(), BN254Lib.g1Zero()
    );
  }
}
