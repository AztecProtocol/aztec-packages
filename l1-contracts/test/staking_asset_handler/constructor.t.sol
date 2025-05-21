// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {StakingAssetHandlerBase} from "./base.t.sol";
import {StakingAssetHandler, IStakingAssetHandler} from "@aztec/mock/StakingAssetHandler.sol";
import {Fakerollup} from "../governance/governance-proposer/mocks/Fakerollup.sol";
import {IRollup} from "@aztec/core/interfaces/IRollup.sol";

// solhint-disable comprehensive-interface
// solhint-disable func-name-mixedcase
// solhint-disable ordering

contract ConstructorTest is StakingAssetHandlerBase {
  function test_WhenDepositsPerMintIs0() external {
    // it reverts
    vm.expectRevert(abi.encodeWithSelector(IStakingAssetHandler.CannotMintZeroAmount.selector));
    new StakingAssetHandler(
      address(this), address(0), registry, address(0), 0, 0, zkPassportVerifier, new address[](0)
    );
  }

  function test_WhenDepositsPerMintIsNot0(
    address _owner,
    address _stakingAsset,
    address _withdrawer,
    uint256 _mintInterval,
    uint256 _depositsPerMint,
    uint256 _unhingedCount
  ) external {
    vm.assume(_owner != address(0));

    _unhingedCount = bound(_unhingedCount, 1, 100);

    address[] memory unhinged = new address[](_unhingedCount);
    for (uint256 i = 0; i < _unhingedCount; i++) {
      unhinged[i] = address(uint160(uint256(keccak256(abi.encodePacked(i + 1)))));
    }

    Fakerollup fakeRollup = new Fakerollup();
    registry.addRollup(IRollup(address(fakeRollup)));

    _depositsPerMint = bound(_depositsPerMint, 1, 100);
    _depositsPerMint = 2;
    // it sets the owner
    // it sets the staking asset
    // it sets the registry and emits a {RegistryUpdated} event
    // it sets the withdrawer and emits a {WithdrawerUpdated} event
    // it sets the mint interval and emits a {MintIntervalUpdated} event
    // it sets the deposits per mint and emits a {DepositsPerMintUpdated} event
    // it adds the array of unhinged address and emits a {UnhingedAdded} event for each address
    vm.expectEmit(true, true, true, true);
    emit IStakingAssetHandler.WithdrawerUpdated(_withdrawer);
    vm.expectEmit(true, true, true, true);
    emit IStakingAssetHandler.IntervalUpdated(_mintInterval);
    vm.expectEmit(true, true, true, true);
    emit IStakingAssetHandler.DepositsPerMintUpdated(_depositsPerMint);
    for (uint256 i = 0; i < unhinged.length; i++) {
      vm.expectEmit(true, true, true, true);
      emit IStakingAssetHandler.UnhingedAdded(unhinged[i]);
    }
    vm.expectEmit(true, true, true, true);
    emit IStakingAssetHandler.UnhingedAdded(_owner);

    vm.prank(_owner);
    stakingAssetHandler = new StakingAssetHandler(
      _owner,
      _stakingAsset,
      registry,
      _withdrawer,
      _mintInterval,
      _depositsPerMint,
      zkPassportVerifier,
      unhinged
    );
    assertEq(stakingAssetHandler.owner(), _owner);
    assertEq(address(stakingAssetHandler.STAKING_ASSET()), _stakingAsset);
    assertEq(address(stakingAssetHandler.getRollup()), address(registry.getCanonicalRollup()));
    assertEq(address(stakingAssetHandler.getRollup()), address(fakeRollup));
    assertEq(stakingAssetHandler.withdrawer(), _withdrawer);
    assertEq(stakingAssetHandler.mintInterval(), _mintInterval);
    assertEq(stakingAssetHandler.depositsPerMint(), _depositsPerMint);
    for (uint256 i = 0; i < unhinged.length; i++) {
      assertTrue(stakingAssetHandler.isUnhinged(unhinged[i]));
    }
  }
}
