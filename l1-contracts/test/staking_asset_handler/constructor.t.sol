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
  Fakerollup public fakeRollup;

  function test_WhenFaucetAmountIs0_ItUsesDefault() external {
    StakingAssetHandler.StakingAssetHandlerArgs memory stakingAssetHandlerArgs =
      StakingAssetHandler.StakingAssetHandlerArgs({
        owner: address(this),
        stakingAsset: address(stakingAsset),
        registry: registry,
        faucetAmount: 0, // Should default to 1M STK
        zkPassportVerifier: zkPassportVerifier,
        unhinged: new address[](0),
        domain: CORRECT_DOMAIN,
        scope: CORRECT_SCOPE,
        skipBindCheck: false
      });

    StakingAssetHandler handler = new StakingAssetHandler(stakingAssetHandlerArgs);
    assertEq(handler.faucetAmount(), handler.DEFAULT_FAUCET_AMOUNT());
  }

  function test_WhenConstructorIsCalledWithValidArgs(
    address _owner,
    address _stakingAsset,
    uint256 _faucetAmount,
    uint256 _unhingedCount,
    string memory _domain,
    string memory _scope,
    bool _skipBindCheck
  ) external {
    vm.assume(_owner != address(0));
    vm.assume(_faucetAmount > 0);

    _unhingedCount = bound(_unhingedCount, 1, 100);

    address[] memory unhinged = new address[](_unhingedCount);
    for (uint256 i = 0; i < _unhingedCount; i++) {
      unhinged[i] = address(uint160(uint256(keccak256(abi.encodePacked(i + 1)))));
    }

    fakeRollup = new Fakerollup();
    registry.addRollup(IRollup(address(fakeRollup)));

    // it sets the owner
    // it sets the staking asset
    // it sets the registry
    // it sets the faucet amount and emits a {FaucetAmountUpdated} event
    // it adds the array of unhinged address and emits a {UnhingedAdded} event for each address
    vm.expectEmit(true, true, true, true);
    emit IStakingAssetHandler.FaucetAmountUpdated(_faucetAmount);
    for (uint256 i = 0; i < unhinged.length; i++) {
      vm.expectEmit(true, true, true, true);
      emit IStakingAssetHandler.UnhingedAdded(unhinged[i]);
    }
    vm.expectEmit(true, true, true, true);
    emit IStakingAssetHandler.UnhingedAdded(_owner);

    StakingAssetHandler.StakingAssetHandlerArgs memory stakingAssetHandlerArgs =
      StakingAssetHandler.StakingAssetHandlerArgs({
        owner: _owner,
        stakingAsset: _stakingAsset,
        registry: registry,
        faucetAmount: _faucetAmount,
        zkPassportVerifier: zkPassportVerifier,
        unhinged: unhinged,
        domain: _domain,
        scope: _scope,
        skipBindCheck: _skipBindCheck
      });

    vm.prank(_owner);
    stakingAssetHandler = new StakingAssetHandler(stakingAssetHandlerArgs);
    assertEq(stakingAssetHandler.owner(), _owner);
    assertEq(address(stakingAssetHandler.STAKING_ASSET()), _stakingAsset);
    assertEq(address(stakingAssetHandler.getRollup()), address(registry.getCanonicalRollup()));
    assertEq(address(stakingAssetHandler.getRollup()), address(fakeRollup));
    assertEq(stakingAssetHandler.faucetAmount(), _faucetAmount);
    for (uint256 i = 0; i < unhinged.length; i++) {
      assertTrue(stakingAssetHandler.isUnhinged(unhinged[i]));
    }
  }
}
