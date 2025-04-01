// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {StakingAssetHandlerBase} from "./base.t.sol";
import {StakingAssetHandler, IStakingAssetHandler} from "@aztec/mock/StakingAssetHandler.sol";

// solhint-disable comprehensive-interface
// solhint-disable func-name-mixedcase
// solhint-disable ordering

contract ConstructorTest is StakingAssetHandlerBase {
  function test_WhenDepositsPerMintIs0() external {
    // it reverts
    vm.expectRevert(abi.encodeWithSelector(IStakingAssetHandler.CannotMintZeroAmount.selector));
    new StakingAssetHandler(
      address(this), address(0), address(0), address(0), 0, 0, 0, new address[](0)
    );
  }

  function test_WhenDepositsPerMintIsNot0(
    address _owner,
    address _stakingAsset,
    address _staking,
    address _withdrawer,
    uint256 _depositAmount,
    uint256 _mintInterval,
    uint256 _depositsPerMint,
    address[] memory _canAddValidator
  ) external {
    vm.assume(_owner != address(0));
    _depositsPerMint = bound(_depositsPerMint, 1, 1000);
    // it sets the owner
    // it sets the staking asset
    // it sets the staking contract and emits a {RollupUpdated} event
    // it sets the withdrawer and emits a {WithdrawerUpdated} event
    // it sets the deposit amount and emits a {DepositAmountUpdated} event
    // it sets the mint interval and emits a {MintIntervalUpdated} event
    // it sets the deposits per mint and emits a {DepositsPerMintUpdated} event
    // it adds the array of addresses to the can add validator array and emits a {AddValidatorPermissionGranted} event for each address
    vm.expectEmit(true, true, true, true);
    emit IStakingAssetHandler.RollupUpdated(_staking);
    emit IStakingAssetHandler.WithdrawerUpdated(_withdrawer);
    emit IStakingAssetHandler.DepositAmountUpdated(_depositAmount);
    emit IStakingAssetHandler.IntervalUpdated(_mintInterval);
    emit IStakingAssetHandler.DepositsPerMintUpdated(_depositsPerMint);
    for (uint256 i = 0; i < _canAddValidator.length; i++) {
      emit IStakingAssetHandler.AddValidatorPermissionGranted(_canAddValidator[i]);
    }
    emit IStakingAssetHandler.AddValidatorPermissionGranted(_owner);
    vm.prank(_owner);
    stakingAssetHandler = new StakingAssetHandler(
      _owner,
      _stakingAsset,
      _staking,
      _withdrawer,
      _depositAmount,
      _mintInterval,
      _depositsPerMint,
      _canAddValidator
    );
    assertEq(stakingAssetHandler.owner(), _owner);
    assertEq(address(stakingAssetHandler.STAKING_ASSET()), _stakingAsset);
    assertEq(address(stakingAssetHandler.rollup()), _staking);
    assertEq(stakingAssetHandler.withdrawer(), _withdrawer);
    assertEq(stakingAssetHandler.depositAmount(), _depositAmount);
    assertEq(stakingAssetHandler.mintInterval(), _mintInterval);
    assertEq(stakingAssetHandler.depositsPerMint(), _depositsPerMint);
    for (uint256 i = 0; i < _canAddValidator.length; i++) {
      assertEq(stakingAssetHandler.canAddValidator(_canAddValidator[i]), true);
    }
  }
}
