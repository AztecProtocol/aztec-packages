// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {StakingAssetHandlerBase} from "./base.t.sol";
import {StakingAssetHandler, IStakingAssetHandler} from "@aztec/mock/StakingAssetHandler.sol";
import {IStakingCore} from "@aztec/core/interfaces/IStaking.sol";
import {Ownable} from "@oz/access/Ownable.sol";

// solhint-disable comprehensive-interface
// solhint-disable func-name-mixedcase
// solhint-disable ordering

contract SetDepositAmountTest is StakingAssetHandlerBase {
  uint256 internal constant MINT_INTERVAL = 1;
  uint256 internal constant DEPOSITS_PER_MINT = 2;

  function setUp() public override {
    super.setUp();
    stakingAssetHandler = new StakingAssetHandler(
      address(this),
      address(stakingAsset),
      address(staking),
      WITHDRAWER,
      MINIMUM_STAKE,
      MINT_INTERVAL,
      DEPOSITS_PER_MINT,
      new address[](0)
    );
    stakingAsset.addMinter(address(stakingAssetHandler));
  }

  function test_WhenCallerIsNotOwner(address _caller) external {
    vm.assume(_caller != address(this));
    // it reverts
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, _caller));
    vm.prank(_caller);
    stakingAssetHandler.setDepositAmount(MINIMUM_STAKE);
  }

  function test_WhenCallerIsOwner(uint256 _newDepositAmount) external {
    // it sets the deposit amount
    // it emits a {DepositAmountUpdated} event
    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.DepositAmountUpdated(_newDepositAmount);
    stakingAssetHandler.setDepositAmount(_newDepositAmount);
    assertEq(stakingAssetHandler.depositAmount(), _newDepositAmount);
  }

  function test_WhenValidatorIsAddedAfterSettingTheDepositAmount(uint256 _newDepositAmount)
    external
  {
    // it deposits the new amount
    _newDepositAmount = bound(_newDepositAmount, MINIMUM_STAKE + 1, 1e22);
    stakingAssetHandler.setDepositAmount(_newDepositAmount);

    vm.warp(block.timestamp + MINT_INTERVAL);

    vm.expectEmit(true, true, true, true, address(staking));
    emit IStakingCore.Deposit(address(1), address(1), WITHDRAWER, _newDepositAmount);
    stakingAssetHandler.addValidator(address(1), address(1));
    assertEq(stakingAssetHandler.depositAmount(), _newDepositAmount);
    assertEq(
      stakingAsset.balanceOf(address(stakingAssetHandler)),
      _newDepositAmount * (DEPOSITS_PER_MINT - 1)
    );
  }
}
