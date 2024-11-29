// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {StakingBase} from "./base.t.sol";
import {OperatorInfo} from "@aztec/core/staking/Staking.sol";

contract GettersTest is StakingBase {
  function setUp() public override {
    super.setUp();

    stakingAsset.mint(address(this), MINIMUM_STAKE);
    stakingAsset.approve(address(staking), MINIMUM_STAKE);
    staking.deposit({
      _attester: ATTESTER,
      _proposer: PROPOSER,
      _withdrawer: WITHDRAWER,
      _amount: MINIMUM_STAKE
    });
  }

  function test_getAttesterAt() external view {
    address attester = staking.getAttesterAt(0);
    assertEq(attester, ATTESTER);
  }

  function test_getAttesterOutOfBounds() external {
    vm.expectRevert();
    staking.getAttesterAt(1);
  }

  function test_getProposerAt() external view {
    address proposer = staking.getProposerAt(0);
    assertEq(proposer, PROPOSER);
  }

  function test_getProposerOutOfBounds() external {
    vm.expectRevert();
    staking.getProposerAt(1);
  }

  function test_getOperatorAt() external view {
    OperatorInfo memory operator = staking.getOperatorAt(0);
    assertEq(operator.attester, ATTESTER);
    assertEq(operator.proposer, PROPOSER);
  }

  function test_getOperatorOutOfBounds() external {
    vm.expectRevert();
    staking.getOperatorAt(1);
  }
}
