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
    // it emits {ValidatorAdded} event

    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.ValidatorAdded(address(staking), BOUND_ADDRESS, WITHDRAWER);
    vm.prank(BOUND_ADDRESS);
    stakingAssetHandler.addValidator(BOUND_ADDRESS, realProof);
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
    stakingAssetHandler.addValidator(_attester, realProof);
  }
}
