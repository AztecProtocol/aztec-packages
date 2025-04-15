// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {StakingAssetHandlerBase} from "./base.t.sol";
import {StakingAssetHandler, IStakingAssetHandler} from "@aztec/mock/StakingAssetHandler.sol";
import {Ownable} from "@oz/access/Ownable.sol";

// solhint-disable comprehensive-interface
// solhint-disable func-name-mixedcase
// solhint-disable ordering

contract SetMintIntervalTest is StakingAssetHandlerBase {
  uint256 internal constant INITIAL_MINT_INTERVAL = 1;
  uint256 internal constant DEPOSITS_PER_MINT = 1;

  function setUp() public override {
    super.setUp();
    stakingAssetHandler = new StakingAssetHandler(
      address(this),
      address(stakingAsset),
      address(staking),
      WITHDRAWER,
      MINIMUM_STAKE,
      INITIAL_MINT_INTERVAL,
      DEPOSITS_PER_MINT,
      new address[](0)
    );
    stakingAsset.addMinter(address(stakingAssetHandler));
  }

  function test_WhenCallerOfSetMintIntervalIsNotOwner(address _caller) external {
    vm.assume(_caller != address(this));
    // it reverts
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, _caller));
    vm.prank(_caller);
    stakingAssetHandler.setMintInterval(INITIAL_MINT_INTERVAL);
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
    _newMintInterval = bound(_newMintInterval, INITIAL_MINT_INTERVAL + 1, 1e18);
    _jump = bound(_jump, 1, _newMintInterval);
    stakingAssetHandler.setMintInterval(_newMintInterval);
    // the "last mint timestamp" is 0 before the first mint
    vm.warp(_newMintInterval - _jump);

    // it reverts
    vm.expectRevert(
      abi.encodeWithSelector(
        IStakingAssetHandler.NotEnoughTimeSinceLastMint.selector, 0, _newMintInterval
      )
    );
    stakingAssetHandler.addValidator(address(1), address(1));
  }

  function test_WhenOwnerTriesToMintAfterTheNewIntervalHasPassed(uint256 _newMintInterval) external {
    _newMintInterval = bound(_newMintInterval, INITIAL_MINT_INTERVAL + 1, 1e12);
    stakingAssetHandler.setMintInterval(_newMintInterval);
    vm.warp(block.timestamp + _newMintInterval);
    // it mints
    // it emits a {Minted} event
    // it updates the last mint timestamp
    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.ValidatorAdded(address(1), address(1), WITHDRAWER);
    stakingAssetHandler.addValidator(address(1), address(1));
    assertEq(stakingAssetHandler.lastMintTimestamp(), block.timestamp);
  }
}
