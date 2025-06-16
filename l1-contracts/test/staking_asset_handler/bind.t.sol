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
    // it emits {AddedToQueue} event

    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.AddedToQueue(BOUND_ADDRESS, 1);
    vm.prank(BOUND_ADDRESS);
    stakingAssetHandler.addValidatorToQueue(BOUND_ADDRESS, realProof);
  }

  function test_WhenNotUsingTheBoundAddress(address _attester) external {
    // it reverts

    vm.assume(_attester != BOUND_ADDRESS && _attester != address(this));

    vm.expectRevert(
      abi.encodeWithSelector(
        IStakingAssetHandler.ProofNotBoundToAddress.selector, BOUND_ADDRESS, _attester
      )
    );
    vm.prank(_attester);
    stakingAssetHandler.addValidatorToQueue(_attester, realProof);
  }
}
