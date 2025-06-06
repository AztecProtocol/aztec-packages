// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {StakingAssetHandlerBase} from "./base.t.sol";
import {StakingAssetHandler, IStakingAssetHandler} from "@aztec/mock/StakingAssetHandler.sol";
import {Ownable} from "@oz/access/Ownable.sol";

// solhint-disable comprehensive-interface
// solhint-disable func-name-mixedcase
// solhint-disable ordering

contract SetMintIntervalTest is StakingAssetHandlerBase {
  function test_WhenCallerOfSetMintIntervalIsNotOwner(address _caller) external {
    vm.assume(_caller != address(this));
    // it reverts
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, _caller));
    vm.prank(_caller);
    stakingAssetHandler.setMintInterval(mintInterval);
  }

  function test_WhenCallerOfSetMintIntervalIsOwner(uint256 _newMintInterval) external {
    // it sets the mint interval
    // it emits a {IntervalUpdated} event
    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.IntervalUpdated(_newMintInterval);
    stakingAssetHandler.setMintInterval(_newMintInterval);
    assertEq(stakingAssetHandler.mintInterval(), _newMintInterval);
  }

  function test_WhenOwnerTriesToMintBeforeTheNewIntervalHasPassed(
    uint256 _newMintInterval,
    uint256 _jump
  ) external {
    _newMintInterval = bound(_newMintInterval, mintInterval + 1, 1e18);
    _jump = bound(_jump, 1, _newMintInterval);
    stakingAssetHandler.setMintInterval(_newMintInterval);
    // the "last mint timestamp" is 0 before the first mint
    vm.warp(_newMintInterval - _jump);

    uint256 lastMintTimestamp = stakingAssetHandler.lastMintTimestamp();

    // it reverts
    vm.expectRevert(
      abi.encodeWithSelector(
        IStakingAssetHandler.ValidatorQuotaFilledUntil.selector,
        lastMintTimestamp + _newMintInterval
      )
    );
    vm.prank(address(0xbeefdeef));
    stakingAssetHandler.dripQueue();
  }

  function test_WhenOwnerTriesToMintAfterTheNewIntervalHasPassed(uint256 _newMintInterval) external {
    _newMintInterval = bound(_newMintInterval, mintInterval + 1, type(uint24).max);
    setMockZKPassportVerifier();

    stakingAssetHandler.setMintInterval(_newMintInterval);
    vm.warp(block.timestamp + _newMintInterval);
    // it mints
    // it emits a {Minted} event
    // it updates the last mint timestamp

    address rollup = stakingAssetHandler.getRollup();

    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.AddedToQueue(address(1));
    vm.prank(address(0xbeefdeef));
    stakingAssetHandler.addValidatorToQueue(address(1), realProof);

    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.ValidatorAdded(rollup, address(1), WITHDRAWER);
    stakingAssetHandler.dripQueue();

    assertEq(stakingAssetHandler.lastMintTimestamp(), block.timestamp);
  }
}
