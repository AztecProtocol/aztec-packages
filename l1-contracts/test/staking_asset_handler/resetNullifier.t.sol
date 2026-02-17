// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {StakingAssetHandlerBase} from "./base.t.sol";
import {StakingAssetHandler, IStakingAssetHandler} from "@aztec/mock/StakingAssetHandler.sol";
import {Ownable} from "@oz/access/Ownable.sol";

// solhint-disable comprehensive-interface
// solhint-disable func-name-mixedcase
// solhint-disable ordering

contract ResetNullifierTest is StakingAssetHandlerBase {
  function test_WhenCallerOfResetNullifierIsNotOwner(address _caller, bytes32 _nullifier) external {
    // it reverts

    vm.assume(_caller != address(this));
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, _caller));
    vm.prank(_caller);
    stakingAssetHandler.resetNullifier(_nullifier);
  }

  function test_WhenCallerOfResetNullifierIsOwner(bytes32 _nullifier) external {
    // it resets the nullifier
    // it emits a {NullifierReset} event

    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.NullifierReset(_nullifier);
    stakingAssetHandler.resetNullifier(_nullifier);
    assertFalse(stakingAssetHandler.nullifiers(_nullifier));
  }

  function test_WhenNullifierIsResetUserCanClaimAgain() external {
    // it allows a user to claim again after their nullifier is reset

    address caller = address(1);

    // First claim succeeds
    vm.prank(caller);
    stakingAssetHandler.claim(realProof);

    // Get the nullifier that was used
    bytes32 nullifier = stakingAssetHandler.addressToNullifier(caller);
    assertTrue(stakingAssetHandler.nullifiers(nullifier), "nullifier should be set");

    // Second claim fails - sybil detected
    vm.expectRevert(abi.encodeWithSelector(IStakingAssetHandler.SybilDetected.selector, nullifier));
    vm.prank(caller);
    stakingAssetHandler.claim(realProof);

    // Owner resets the nullifier
    stakingAssetHandler.resetNullifier(nullifier);
    assertFalse(stakingAssetHandler.nullifiers(nullifier), "nullifier should be reset");

    // Third claim succeeds
    uint256 balanceBefore = stakingAsset.balanceOf(caller);
    vm.prank(caller);
    stakingAssetHandler.claim(realProof);
    uint256 balanceAfter = stakingAsset.balanceOf(caller);

    assertEq(balanceAfter - balanceBefore, faucetAmount, "user should receive faucet amount after reset");
  }
}
