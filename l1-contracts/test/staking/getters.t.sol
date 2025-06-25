// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {StakingBase} from "./base.t.sol";

contract GettersTest is StakingBase {
  function setUp() public override {
    super.setUp();

    stakingAsset.mint(address(this), DEPOSIT_AMOUNT);
    stakingAsset.approve(address(staking), DEPOSIT_AMOUNT);
    staking.deposit({_attester: ATTESTER, _withdrawer: WITHDRAWER, _onCanonical: true});
    staking.flushEntryQueue();
  }

  function test_getAttesterAtIndex() external view {
    address attester = staking.getAttesterAtIndex(0);
    assertEq(attester, ATTESTER);
  }

  function test_getAttesterOutOfBounds() external {
    vm.expectRevert();
    staking.getAttesterAtIndex(1);
  }
}
