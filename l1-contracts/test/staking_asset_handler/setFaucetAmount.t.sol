// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {StakingAssetHandlerBase} from "./base.t.sol";
import {StakingAssetHandler, IStakingAssetHandler} from "@aztec/mock/StakingAssetHandler.sol";
import {Ownable} from "@oz/access/Ownable.sol";

// solhint-disable comprehensive-interface
// solhint-disable func-name-mixedcase
// solhint-disable ordering

contract SetFaucetAmountTest is StakingAssetHandlerBase {
  function test_WhenCallerOfSetFaucetAmountIsNotOwner(address _caller, uint256 _amount) external {
    // it reverts

    vm.assume(_caller != address(this));
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, _caller));
    vm.prank(_caller);
    stakingAssetHandler.setFaucetAmount(_amount);
  }

  function test_WhenCallerOfSetFaucetAmountIsOwner(uint256 _amount) external {
    // it sets the faucet amount
    // it emits a {FaucetAmountUpdated} event

    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.FaucetAmountUpdated(_amount);
    stakingAssetHandler.setFaucetAmount(_amount);
    assertEq(stakingAssetHandler.faucetAmount(), _amount);
  }

  function test_WhenFaucetAmountIsUpdatedClaimUsesNewAmount() external {
    // it uses the new amount when claiming

    uint256 newAmount = 500_000 * 1e18;
    stakingAssetHandler.setFaucetAmount(newAmount);

    address unhinged = address(0xdead);
    stakingAssetHandler.addUnhinged(unhinged);

    uint256 balanceBefore = stakingAsset.balanceOf(unhinged);

    vm.prank(unhinged);
    stakingAssetHandler.claim(fakeProof);

    uint256 balanceAfter = stakingAsset.balanceOf(unhinged);
    assertEq(balanceAfter - balanceBefore, newAmount, "should receive new faucet amount");
  }
}
