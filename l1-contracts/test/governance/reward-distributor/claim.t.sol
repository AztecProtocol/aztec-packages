// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {RewardDistributorBase} from "./Base.t.sol";

import {Errors} from "@aztec/governance/libraries/Errors.sol";

contract ClaimTest is RewardDistributorBase {
  address internal caller;

  function test_WhenCallerIsNotCanonical(address _caller) external {
    // it reverts
    vm.assume(_caller != address(0xdead));

    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.RewardDistributor__InvalidCaller.selector, _caller, address(0xdead)
      )
    );
    vm.prank(_caller);
    rewardDistributor.claim(_caller);
  }

  modifier whenCallerIsCanonical() {
    caller = address(0xdead);
    _;
  }

  function test_GivenBalanceIs0() external whenCallerIsCanonical {
    // it return 0
    vm.record();
    vm.prank(caller);
    assertEq(rewardDistributor.claim(caller), 0);
    (, bytes32[] memory writes) = vm.accesses(address(this));
    assertEq(writes.length, 0);
  }

  function test_GivenBalanceGt0(uint256 _balance) external whenCallerIsCanonical {
    // it transfer min(balance, BLOCK_REWARD)
    // it return min(balance, BLOCK_REWARD)

    uint256 balance = bound(_balance, 1, type(uint256).max);
    token.mint(address(rewardDistributor), balance);

    uint256 reward =
      balance > rewardDistributor.BLOCK_REWARD() ? rewardDistributor.BLOCK_REWARD() : balance;

    uint256 callerBalance = token.balanceOf(caller);
    vm.prank(caller);
    vm.record();
    uint256 claimed = rewardDistributor.claim(caller);
    (, bytes32[] memory writes) = vm.accesses(address(token));

    assertEq(claimed, reward);
    assertEq(token.balanceOf(caller), callerBalance + reward);
    assertEq(token.balanceOf(address(rewardDistributor)), balance - reward);

    assertEq(writes.length, 2, "writes");
  }
}
