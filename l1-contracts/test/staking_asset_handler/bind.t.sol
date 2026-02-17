// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {StakingAssetHandlerBase} from "./base.t.sol";
import {StakingAssetHandler, IStakingAssetHandler} from "@aztec/mock/StakingAssetHandler.sol";

// solhint-disable comprehensive-interface
// solhint-disable func-name-mixedcase
// solhint-disable ordering

contract BindTest is StakingAssetHandlerBase {
  // Bound address in the provided fixtures
  address constant BOUND_ADDRESS = 0x04Fb06E8BF44eC60b6A99D2F98551172b2F2dED8;

  function setUp() public override {
    super.setUp();
    // Check is disabled by default
    enableBindCheck();
  }

  function test_WhenUsingTheBoundAddress() external {
    // it emits {Claimed} event

    uint256 balanceBefore = stakingAsset.balanceOf(BOUND_ADDRESS);

    vm.prank(BOUND_ADDRESS);
    stakingAssetHandler.claim(realProof);

    uint256 balanceAfter = stakingAsset.balanceOf(BOUND_ADDRESS);
    assertEq(balanceAfter - balanceBefore, faucetAmount, "bound address should receive faucet amount");
  }

  function test_WhenNotUsingTheBoundAddress(address _caller) external {
    // it reverts

    vm.assume(_caller != BOUND_ADDRESS && _caller != address(this));

    vm.expectRevert(abi.encodeWithSelector(IStakingAssetHandler.InvalidBoundAddress.selector, BOUND_ADDRESS, _caller));
    vm.prank(_caller);
    stakingAssetHandler.claim(realProof);
  }
}
