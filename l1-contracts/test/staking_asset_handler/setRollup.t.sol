// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {StakingAssetHandlerBase} from "./base.t.sol";
import {StakingAssetHandler, IStakingAssetHandler} from "@aztec/mock/StakingAssetHandler.sol";
import {IStakingCore} from "@aztec/core/interfaces/IStaking.sol";
import {Ownable} from "@oz/access/Ownable.sol";
import {StakingCheater} from "./../staking/StakingCheater.sol";

// solhint-disable comprehensive-interface
// solhint-disable func-name-mixedcase
// solhint-disable ordering

contract SetRollupTest is StakingAssetHandlerBase {
  uint256 internal constant MINIMUM_MINT_INTERVAL = 1;
  uint256 internal constant MAX_DEPOSITS_PER_MINT = 1;

  function setUp() public override {
    super.setUp();
    stakingAssetHandler = new StakingAssetHandler(
      address(this),
      address(stakingAsset),
      address(staking),
      WITHDRAWER,
      MINIMUM_STAKE,
      MINIMUM_MINT_INTERVAL,
      MAX_DEPOSITS_PER_MINT,
      new address[](0)
    );
    stakingAsset.addMinter(address(stakingAssetHandler));
  }

  function test_WhenCallerIsNotOwner(address _caller) external {
    vm.assume(_caller != address(this));
    // it reverts
    vm.prank(_caller);
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, _caller));
    stakingAssetHandler.setRollup(address(0));
  }

  function test_WhenCallerIsOwner(address _newRollup) external {
    // it sets the rollup
    // it emits a {RollupUpdated} event
    vm.assume(_newRollup != address(staking));
    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.RollupUpdated(_newRollup);
    stakingAssetHandler.setRollup(_newRollup);
    assertEq(address(stakingAssetHandler.rollup()), _newRollup);
  }

  function test_WhenValidatorIsAddedAfterSettingTheRollup() external {
    // it deposits into the new rollup
    StakingCheater newStaking = new StakingCheater(stakingAsset, MINIMUM_STAKE, 1, 1);
    assertNotEq(address(newStaking), address(staking));

    stakingAssetHandler.setRollup(address(newStaking));
    assertEq(address(stakingAssetHandler.rollup()), address(newStaking));

    vm.warp(block.timestamp + MINIMUM_MINT_INTERVAL);

    vm.expectEmit(true, true, true, true, address(newStaking));
    emit IStakingCore.Deposit(address(1), address(1), WITHDRAWER, MINIMUM_STAKE);
    stakingAssetHandler.addValidator(address(1), address(1));
  }
}
