// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {RewardDistributorBase} from "./Base.t.sol";

import {Errors} from "@aztec/governance/libraries/Errors.sol";

contract ClaimBlockRewardsTest is RewardDistributorBase {
  address internal caller;

  function test_WhenCallerIsNotCanonical(address _caller) external {
    // it reverts
    address canonical = rewardDistributor.canonicalRollup();
    vm.assume(_caller != canonical);

    vm.expectRevert(
      abi.encodeWithSelector(Errors.RewardDistributor__InvalidCaller.selector, _caller, canonical)
    );
    vm.prank(_caller);
    rewardDistributor.claimBlockRewards(_caller, 1);
  }

  modifier whenCallerIsCanonical() {
    caller = address(registry.getCanonicalRollup());
    _;
  }

  function test_GivenBalanceIs0(uint8 _blocks) external whenCallerIsCanonical {
    // it return 0
    vm.record();
    vm.prank(caller);
    assertEq(rewardDistributor.claimBlockRewards(caller, _blocks), 0);
    (, bytes32[] memory writes) = vm.accesses(address(token));
    assertEq(writes.length, 0);
  }

  function test_GivenBalanceGt0(uint256 _balance, uint8 _blocks) external whenCallerIsCanonical {
    // it transfer min(balance, BLOCK_REWARD * blocks)
    // it return min(balance, BLOCK_REWARD * blocks)

    uint256 blocks = bound(_blocks, 1, type(uint8).max);
    uint256 balance = bound(_balance, 1, type(uint256).max);
    token.mint(address(rewardDistributor), balance);

    uint256 reward = balance > rewardDistributor.BLOCK_REWARD() * blocks
      ? rewardDistributor.BLOCK_REWARD() * blocks
      : balance;

    uint256 callerBalance = token.balanceOf(caller);
    vm.prank(caller);
    vm.record();
    uint256 claimed = rewardDistributor.claimBlockRewards(caller, blocks);
    (, bytes32[] memory writes) = vm.accesses(address(token));

    assertEq(claimed, reward);
    assertEq(token.balanceOf(caller), callerBalance + reward);
    assertEq(token.balanceOf(address(rewardDistributor)), balance - reward);

    assertEq(writes.length, 2, "writes");
  }
}
