// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {StakingAssetHandlerBase} from "./base.t.sol";
import {StakingAssetHandler, IStakingAssetHandler} from "@aztec/mock/StakingAssetHandler.sol";
import {IStakingCore} from "@aztec/core/interfaces/IStaking.sol";

// solhint-disable comprehensive-interface
// solhint-disable func-name-mixedcase
// solhint-disable ordering

contract ReenterExitedValidatorTest is StakingAssetHandlerBase {
  function test_WhenAttesterHasNOTProvidedAValidDeposit(address _attester, address _proposer)
    external
  {
    // it reverts

    vm.assume(_attester != address(0) && _proposer != address(0));

    vm.expectRevert(
      abi.encodeWithSelector(IStakingAssetHandler.AttesterDoesNotExist.selector, _attester)
    );
    stakingAssetHandler.reenterExitedValidator(_attester);
  }

  function test_WhenAttesterHasProvidedAValidDeposit(
    address _caller,
    address _attester,
    address _proposer
  ) external {
    // it succeeds
    // it emits a {ValidatorAdded} event

    // 1. Perform a valid deposit
    // 2. Exit the validator
    // 3. Reenter the validator

    vm.assume(_attester != address(0) && _proposer != address(0) && _caller != address(this));

    // 1. Perform a valid deposit
    vm.prank(_caller);
    stakingAssetHandler.addValidator(_attester, validMerkleProof, realProof);

    emit IStakingAssetHandler.ValidatorAdded(address(staking), _attester, WITHDRAWER);
    staking.flushEntryQueue();

    // 2. Exit the validator
    vm.prank(WITHDRAWER);
    assertTrue(IStakingCore(staking).initiateWithdraw(_attester, WITHDRAWER));

    // Jump forward the withdrawal window - very far in future incase values change
    vm.warp(block.timestamp + 4 weeks);

    // 3. Reenter the validator
    vm.prank(_caller);
    emit IStakingAssetHandler.ValidatorAdded(address(staking), _attester, WITHDRAWER);
    stakingAssetHandler.reenterExitedValidator(_attester);

    vm.prank(_caller);
    emit IStakingAssetHandler.ValidatorAdded(address(staking), _attester, WITHDRAWER);
  }
}
