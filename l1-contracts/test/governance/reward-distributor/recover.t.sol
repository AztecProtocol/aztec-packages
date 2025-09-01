// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {RewardDistributorBase} from "./Base.t.sol";

import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {Ownable} from "@oz/access/Ownable.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";

contract RecoverTest is RewardDistributorBase {
  address internal caller;

  function test_WhenCallerIsNotOwner(address _caller) external {
    // it reverts
    address owner = Ownable(address(registry)).owner();
    vm.assume(_caller != owner);

    vm.expectRevert(abi.encodeWithSelector(Errors.RewardDistributor__InvalidCaller.selector, _caller, owner));
    vm.prank(_caller);
    rewardDistributor.recover(address(token), _caller, 1e18);
  }

  modifier whenCallerIsOwner() {
    caller = Ownable(address(registry)).owner();
    _;
  }

  function test_GivenBalanceGt0(uint256 _balance, uint256 _amount) external whenCallerIsOwner {
    // it transfers the requested amount

    uint256 balance = bound(_balance, 1, type(uint256).max);
    uint256 amount = bound(_amount, 1, balance);
    token.mint(address(rewardDistributor), balance);

    uint256 callerBalance = token.balanceOf(caller);
    vm.prank(caller);
    rewardDistributor.recover(address(token), caller, amount);

    assertEq(token.balanceOf(caller), callerBalance + amount);
    assertEq(token.balanceOf(address(rewardDistributor)), balance - amount);

    TestERC20 token2 = new TestERC20("Token2", "T2", address(this));
    token2.mint(address(rewardDistributor), balance);

    vm.prank(caller);
    rewardDistributor.recover(address(token2), caller, amount);
    assertEq(token2.balanceOf(caller), amount);
    assertEq(token2.balanceOf(address(rewardDistributor)), balance - amount);
  }
}
