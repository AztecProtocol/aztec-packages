// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {RewardDistributorBase} from "./Base.t.sol";

import {Errors} from "@aztec/governance/libraries/Errors.sol";

contract ClaimTest is RewardDistributorBase {
  address internal caller;

  function test_WhenCallerIsNotCanonical(address _caller) external {
    // it reverts
    address canonical = address(registry.getCanonicalRollup());
    vm.assume(_caller != canonical);

    vm.expectRevert(abi.encodeWithSelector(Errors.RewardDistributor__InvalidCaller.selector, _caller, canonical));
    vm.prank(_caller);
    rewardDistributor.claim(_caller, 1e18);
  }

  modifier whenCallerIsCanonical() {
    caller = address(registry.getCanonicalRollup());
    _;
  }

  function test_GivenBalanceIs0() external whenCallerIsCanonical {
    // it reverts with insufficient balance
    vm.prank(caller);
    vm.expectRevert();
    rewardDistributor.claim(caller, 1e18);
  }

  function test_GivenBalanceGt0(uint256 _balance, uint256 _amount) external whenCallerIsCanonical {
    // it transfers the requested amount

    uint256 balance = bound(_balance, 1, type(uint256).max);
    uint256 amount = bound(_amount, 1, balance);
    token.mint(address(rewardDistributor), balance);

    uint256 callerBalance = token.balanceOf(caller);
    vm.prank(caller);
    rewardDistributor.claim(caller, amount);

    assertEq(token.balanceOf(caller), callerBalance + amount);
    assertEq(token.balanceOf(address(rewardDistributor)), balance - amount);
  }
}
