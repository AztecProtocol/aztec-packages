// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {StakingBase} from "./base.t.sol";
import {OperatorInfo} from "@aztec/core/interfaces/IStaking.sol";

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

  function test_getAttesterAtIndex() external view {
    address attester = staking.getAttesterAtIndex(0);
    assertEq(attester, ATTESTER);
  }

  function test_getAttesterOutOfBounds() external {
    vm.expectRevert();
    staking.getAttesterAtIndex(1);
  }

  function test_getProposerAtIndex() external view {
    address proposer = staking.getProposerAtIndex(0);
    assertEq(proposer, PROPOSER);
  }

  function test_getProposerOutOfBounds() external {
    vm.expectRevert();
    staking.getProposerAtIndex(1);
  }

  function test_getOperatorAtIndex() external view {
    OperatorInfo memory operator = staking.getOperatorAtIndex(0);
    assertEq(operator.attester, ATTESTER);
    assertEq(operator.proposer, PROPOSER);
  }

  function test_getOperatorOutOfBounds() external {
    vm.expectRevert();
    staking.getOperatorAtIndex(1);
  }

  function test_getProposerForAttester() external view {
    assertEq(staking.getProposerForAttester(ATTESTER), PROPOSER);
    assertEq(staking.getProposerForAttester(address(1)), address(0));
  }
}
